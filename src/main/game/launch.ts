import type { ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { createWriteStream, mkdirSync, type WriteStream } from 'fs'
import { constants, setPriority } from 'os'
import { join } from 'path'
import { createMinecraftProcessWatcher, launch, type LaunchOption } from '@xmcl/core'
import type { GameExit, GameState, LaunchRequest, LogLine } from '@shared/types'
import { activeAccount } from '../account'
import { describeError } from '../errors'
import { dataDir, instanceDir, logsDir } from '../paths'
import { getRemote } from '../remote'
import { activeSkin, applySkinToInstance, SKIN_MOD, syncSkin } from '../skins'
import { save, store } from '../store'
import { ensureJava } from './java'
import { addPlayTime, getInstance, touchInstance } from './instances'
import { INSTALL_STAGES, prepareVersion, recommendedLoader } from './install'
import { ensureMods } from './modrinth'
import { optimizedJvmFlags, PERF_MODS, writeDefaultOptions } from './optimize'
import { InstallRunner, type ProgressSink } from './progress'

export interface GameEvents {
  progress: ProgressSink
  log(line: LogLine): void
  state(state: GameState): void
  exit(exit: GameExit): void
}

/** Quick Play (--quickPlayMultiplayer) появился в 23w14a */
const QUICK_PLAY_SINCE = Date.parse('2023-04-05T00:00:00Z')

let state: GameState = { status: 'idle', instanceId: null }
let child: ChildProcess | null = null
let killedByUser = false

export const gameState = (): GameState => state

function setState(next: GameState, events: GameEvents): void {
  state = next
  events.state(state)
}

export function killGame(): void {
  if (!child) return
  killedByUser = true
  child.kill()
}

export async function launchGame(req: LaunchRequest, events: GameEvents): Promise<void> {
  if (state.status !== 'idle') throw new Error('Игра уже запускается или запущена')
  const inst = getInstance(req.instanceId)
  const account = activeAccount()
  if (!account) throw new Error('Сначала введи ник')

  const say = (text: string): void => events.log({ stream: 'launcher', text })
  setState({ status: 'preparing', instanceId: inst.id }, events)

  try {
    const runner = new InstallRunner(inst.id, INSTALL_STAGES, events.progress)
    say(`Подготовка ${inst.name} (${inst.version}, ${inst.loader})`)
    if (inst.loader !== 'vanilla' && !inst.loaderVersion) {
      // Фиксируем версию загрузчика, чтобы сборка не менялась сама собой
      inst.loaderVersion = await recommendedLoader(inst.loader, inst.version)
      save()
    }
    const { version, vanilla } = await prepareVersion(inst, runner, (v) => ensureJava(v, runner))
    const javaPath = await ensureJava(vanilla, runner)

    const gamePath = instanceDir(inst.id)
    mkdirSync(gamePath, { recursive: true })
    if (inst.loader !== 'vanilla') {
      // Служебные моды: оптимизация (если включена) и CustomSkinLoader — свой скин и скины других игроков
      const { skinServer } = await getRemote()
      const needSkins = Boolean(activeSkin() || skinServer)
      const slugs = [...(inst.optimized ? PERF_MODS.map((m) => m.slug) : []), ...(needSkins ? [SKIN_MOD] : [])]
      if (slugs.length) await ensureMods(gamePath, slugs, inst.version, inst.loader, runner)
      if (needSkins && (await applySkinToInstance(gamePath, account.name))) say('Скин подключён через CustomSkinLoader')
      void syncSkin()
    }
    await writeDefaultOptions(gamePath)
    events.progress(null)
    say(`Java: ${javaPath}`)

    const { settings } = store
    const maxMemory = inst.memoryMb ?? settings.memoryMb
    const jvmArgs = [
      ...(settings.optimizeJvm ? optimizedJvmFlags() : []),
      ...settings.jvmArgs.split(/\s+/).filter(Boolean)
    ]

    const options: LaunchOption = {
      gamePath,
      resourcePath: dataDir,
      javaPath,
      version,
      gameProfile: { name: account.name, id: account.id },
      accessToken: randomBytes(16).toString('hex'),
      userType: 'legacy',
      launcherName: 'DLauncher',
      launcherBrand: 'DLauncher',
      versionName: inst.name,
      // С оптимизацией -Xms = -Xmx: куча не растёт рывками во время игры
      minMemory: settings.optimizeJvm ? maxMemory : Math.min(1024, maxMemory),
      maxMemory,
      resolution: { width: settings.width, height: settings.height, fullscreen: settings.fullscreen },
      extraJVMArgs: jvmArgs,
      extraExecOption: { windowsHide: true }
    }
    if (req.server) {
      const address = req.server.port ? `${req.server.host}:${req.server.port}` : req.server.host
      if (Date.parse(version.releaseTime) >= QUICK_PLAY_SINCE) options.quickPlayMultiplayer = address
      else options.server = { ip: req.server.host, port: req.server.port }
    }

    say(`Запуск от имени ${account.name}, ОЗУ ${maxMemory} МБ`)
    const proc = await launch(options)
    child = proc
    if (settings.optimizeJvm && proc.pid) {
      try {
        setPriority(proc.pid, constants.priority.PRIORITY_ABOVE_NORMAL)
        say('Приоритет процесса игры: выше среднего')
      } catch (e) {
        // Без прав на смену приоритета просто играем с обычным
        say('Не удалось поднять приоритет: ' + describeError(e))
      }
    }
    killedByUser = false
    touchInstance(inst.id)
    setState({ status: 'running', instanceId: inst.id }, events)
    attachProcess(proc, inst.id, Date.now(), events)
  } catch (e) {
    events.progress(null)
    setState({ status: 'idle', instanceId: null }, events)
    const message = describeError(e) || 'неизвестная ошибка'
    say('Ошибка: ' + message)
    if (e instanceof Error && e.stack) say(e.stack)
    throw new Error(message)
  }
}

function attachProcess(proc: ChildProcess, instanceId: string, startedAt: number, events: GameEvents): void {
  mkdirSync(logsDir, { recursive: true })
  const logFile: WriteStream = createWriteStream(join(logsDir, 'game-latest.log'))
  const pipe = (stream: 'out' | 'err') => (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    logFile.write(text)
    for (const line of text.split(/\r?\n/)) if (line) events.log({ stream, text: line })
  }
  proc.stdout?.on('data', pipe('out'))
  proc.stderr?.on('data', pipe('err'))

  createMinecraftProcessWatcher(proc)
    .on('minecraft-exit', ({ code, crashReport, crashReportLocation }) => {
      logFile.end()
      child = null
      addPlayTime(instanceId, Date.now() - startedAt)
      // Закрытие кнопкой в лаунчере — не вылет
      const crashed = !killedByUser && (code !== 0 || Boolean(crashReport))
      events.exit({ instanceId, code, crashed, crashReport, crashReportLocation })
      setState({ status: 'idle', instanceId: null }, events)
    })
    .on('error', (err) => events.log({ stream: 'launcher', text: 'Ошибка процесса: ' + String(err) }))
}
