import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { MinecraftFolder, Version, type ResolvedVersion } from '@xmcl/core'
import {
  getLoaderArtifactListFor,
  getQuiltLoaderVersionsByMinecraft,
  installDependenciesTask,
  installFabric,
  installForgeTask,
  installNeoForgedTask,
  installQuiltVersion,
  installTask
} from '@xmcl/installer'
import { Agent, interceptors } from 'undici'
import type { Instance, LoaderType } from '@shared/types'
import { dataDir } from '../paths'
import type { InstallRunner } from './progress'
import { findVersion } from './versions'

/** Этапы максимум: игра, Java, загрузчик, его библиотеки, моды */
export const INSTALL_STAGES = 5

/** Сколько раз повторяем установку: уже скачанные файлы при повторе пропускаются */
const ATTEMPTS = 4

const folder = MinecraftFolder.from(dataDir)
const lockFile = (id: string): string => join(folder.getVersionRoot(id), '.dlauncher-installed')

/**
 * Без ограничения xmcl открывает сотни соединений к CDN Mojang, и на домашнем интернете
 * часть из них отваливается по таймауту. Держим не больше 12 соединений на хост и ждём подольше.
 */
export const downloadAgent = new Agent({
  connections: 12,
  connect: { timeout: 30_000 },
  headersTimeout: 60_000,
  bodyTimeout: 60_000
}).compose(
  // Как в @xmcl/file-transfer: без redirect-интерцептора загрузчик падает на context.history
  interceptors.retry({
    maxRetries: 5,
    minTimeout: 500,
    errorCodes: ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND']
  }),
  interceptors.redirect({ maxRedirections: 5 })
)

const downloadOptions = {
  dispatcher: downloadAgent,
  librariesDownloadConcurrency: 8,
  assetsDownloadConcurrency: 12
}

async function withRetries<T>(body: (attempt: number) => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await body(attempt)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

async function parseIfInstalled(id: string): Promise<ResolvedVersion | null> {
  if (!existsSync(lockFile(id))) return null
  try {
    return await Version.parse(folder, id)
  } catch {
    return null // Битый version.json — переустановим
  }
}

/** Ванильная версия: version.json, клиент, библиотеки и ресурсы */
export async function installVanilla(id: string, runner: InstallRunner): Promise<ResolvedVersion> {
  const ready = await parseIfInstalled(id)
  if (ready) return ready

  const meta = await findVersion(id)
  if (!meta) throw new Error(`Версия ${id} не найдена в списке Mojang`)

  const resolved = await withRetries((attempt) =>
    runner.run(
      attempt === 1 ? `Установка Minecraft ${id}` : `Докачка Minecraft ${id} (попытка ${attempt})`,
      installTask(meta, dataDir, downloadOptions),
      attempt > 1
    )
  )
  await writeFile(lockFile(id), new Date().toISOString())
  return resolved
}

/* ---------- Загрузчики модов ---------- */

const LOADER_NAMES: Record<LoaderType, string> = {
  vanilla: 'Minecraft',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} ответил ${res.status}`)
  return (await res.text()).replace(/^﻿/, '')
}

/** NeoForge нумерует версии по игре: 1.21.1 → 21.1.x, 1.21 → 21.0.x */
function neoforgePrefix(gameVersion: string): string {
  const [, minor = '0', patch = '0'] = gameVersion.split('.')
  return `${minor}.${patch}.`
}

/** Версии загрузчика под версию игры, свежие первыми; первая — рекомендуемая */
export async function loaderVersions(loader: LoaderType, gameVersion: string): Promise<string[]> {
  switch (loader) {
    case 'vanilla':
      return []
    case 'fabric': {
      const list = await getLoaderArtifactListFor(gameVersion)
      return [...list.filter((a) => a.loader.stable), ...list.filter((a) => !a.loader.stable)].map((a) => a.loader.version)
    }
    case 'quilt': {
      const list = await getQuiltLoaderVersionsByMinecraft({ minecraftVersion: gameVersion })
      return list.map((a) => a.loader.version).filter((v) => !/beta|pre/.test(v))
    }
    case 'forge': {
      const xml = await getText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')
      const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)]
        .map((m) => m[1])
        .filter((v) => v.startsWith(gameVersion + '-'))
        .map((v) => v.slice(gameVersion.length + 1))
      try {
        const promos = JSON.parse(await getText('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')) as {
          promos: Record<string, string>
        }
        const rec = promos.promos[`${gameVersion}-recommended`] ?? promos.promos[`${gameVersion}-latest`]
        if (rec) return [rec, ...all.filter((v) => v !== rec)]
      } catch {
        // без промо — просто список
      }
      return all
    }
    case 'neoforge': {
      const data = JSON.parse(await getText('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')) as {
        versions: string[]
      }
      const prefix = neoforgePrefix(gameVersion)
      const list = data.versions.filter((v) => v.startsWith(prefix)).reverse()
      return [...list.filter((v) => !v.includes('beta')), ...list.filter((v) => v.includes('beta'))]
    }
  }
}

export async function recommendedLoader(loader: LoaderType, gameVersion: string): Promise<string> {
  const [first] = await loaderVersions(loader, gameVersion)
  if (!first) throw new Error(`${LOADER_NAMES[loader]} не поддерживает Minecraft ${gameVersion}`)
  return first
}

/** Ставит профиль загрузчика (после ванилы) и возвращает id версии */
async function installLoaderProfile(inst: Instance, loaderVersion: string, javaPath: string, runner: InstallRunner): Promise<string> {
  switch (inst.loader) {
    case 'fabric':
      return installFabric({ minecraftVersion: inst.version, version: loaderVersion, minecraft: dataDir })
    case 'quilt':
      return installQuiltVersion({ minecraftVersion: inst.version, version: loaderVersion, minecraft: dataDir })
    case 'forge':
      return withRetries((attempt) =>
        runner.run(
          attempt === 1 ? `Установка Forge ${loaderVersion}` : `Установка Forge (попытка ${attempt})`,
          installForgeTask({ mcversion: inst.version, version: loaderVersion }, dataDir, { ...downloadOptions, java: javaPath }),
          attempt > 1
        )
      )
    case 'neoforge':
      return withRetries((attempt) =>
        runner.run(
          attempt === 1 ? `Установка NeoForge ${loaderVersion}` : `Установка NeoForge (попытка ${attempt})`,
          installNeoForgedTask('neoforge', loaderVersion, dataDir, { ...downloadOptions, java: javaPath }),
          attempt > 1
        )
      )
    default:
      throw new Error('Неизвестный загрузчик')
  }
}

/** id установленных версий с загрузчиком, чтобы не ходить в сеть при каждом запуске */
const loaderIndexFile = join(dataDir, 'versions', '.dlauncher-loaders.json')

async function loaderIndex(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(loaderIndexFile, 'utf8'))
  } catch {
    return {}
  }
}

/**
 * Готовит версию сборки к запуску: ваниль, затем загрузчик и его библиотеки.
 * javaFor нужен Forge/NeoForge — их установщик запускает Java-процессоры.
 */
export async function prepareVersion(
  inst: Instance,
  runner: InstallRunner,
  javaFor: (v: ResolvedVersion) => Promise<string>
): Promise<{ version: ResolvedVersion; vanilla: ResolvedVersion }> {
  const vanilla = await installVanilla(inst.version, runner)
  if (inst.loader === 'vanilla') return { version: vanilla, vanilla }

  const loaderVersion = inst.loaderVersion || (await recommendedLoader(inst.loader, inst.version))
  const key = `${inst.loader}:${inst.version}:${loaderVersion}`
  const index = await loaderIndex()
  const known = index[key] ? await parseIfInstalled(index[key]) : null
  if (known) return { version: known, vanilla }

  const javaPath = await javaFor(vanilla)
  const id = await installLoaderProfile(inst, loaderVersion, javaPath, runner)
  const parsed = await Version.parse(folder, id)
  const resolved = await withRetries((attempt) =>
    runner.run(
      attempt === 1 ? `Библиотеки ${LOADER_NAMES[inst.loader]}` : `Докачка ${LOADER_NAMES[inst.loader]} (попытка ${attempt})`,
      installDependenciesTask(parsed, downloadOptions),
      attempt > 1
    )
  )
  await writeFile(lockFile(id), new Date().toISOString())
  index[key] = id
  await writeFile(loaderIndexFile, JSON.stringify(index, null, 2))
  return { version: resolved, vanilla }
}
