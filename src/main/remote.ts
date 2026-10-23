import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { RemoteConfig } from '@shared/types'
import { dataDir } from './paths'

/** Конфиг лежит в репозитории: адрес сервера, сервер скинов и анонсы меняются без новой версии лаунчера */
const URL = 'https://raw.githubusercontent.com/Daler2010/dlauncher/main/remote.json'
const cacheFile = join(dataDir, 'remote-cache.json')

export const DEFAULT_REMOTE: RemoteConfig = {
  server: {
    name: 'Анархия',
    motd: 'Выживание без правил: кланы, дуэли, аирдропы, кейсы.',
    host: 'practically-edges.tun.ply.gg',
    version: '1.21.1',
    slots: 30
  },
  skinServer: null,
  announcements: []
}

let cache: { at: number; config: RemoteConfig } | null = null

/** Плагин DLauncher на этом же ПК (у владельца сервера) — по умолчанию порт 8765 */
const LOCAL_SERVER = 'http://127.0.0.1:8765'
let localProbe: { at: number; ok: boolean } | null = null

async function localServerUp(): Promise<boolean> {
  if (localProbe && Date.now() - localProbe.at < 30_000) return localProbe.ok
  let ok = false
  try {
    ok = (await fetch(`${LOCAL_SERVER}/api/ping`, { signal: AbortSignal.timeout(1500) })).ok
  } catch {
    // плагина на этом ПК нет
  }
  localProbe = { at: Date.now(), ok }
  return ok
}

/**
 * Конфиг с подставленным сервером DLauncher: если в remote.json адрес не задан,
 * но сервер запущен на этом же компьютере — берём локальный.
 */
export async function getRemote(): Promise<RemoteConfig> {
  const config = await loadRemote()
  if (!config.skinServer && (await localServerUp())) return { ...config, skinServer: LOCAL_SERVER }
  return config
}

async function loadRemote(): Promise<RemoteConfig> {
  // Для разработки: DL_REMOTE_FILE=путь к локальному remote.json
  const local = process.env['DL_REMOTE_FILE']
  if (local) return { ...DEFAULT_REMOTE, ...JSON.parse(await readFile(local, 'utf8')) }
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.config
  try {
    const res = await fetch(URL, { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const config = { ...DEFAULT_REMOTE, ...((await res.json()) as Partial<RemoteConfig>) }
    cache = { at: Date.now(), config }
    await writeFile(cacheFile, JSON.stringify(config)).catch(() => {})
    return config
  } catch {
    // Нет сети или файла — последний сохранённый конфиг, иначе встроенный
    try {
      return { ...DEFAULT_REMOTE, ...JSON.parse(await readFile(cacheFile, 'utf8')) }
    } catch {
      return DEFAULT_REMOTE
    }
  }
}
