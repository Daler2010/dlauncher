import type { CapeCatalog, Fetched, PlayerProfile, ServerInfo, TopEntry } from '@shared/types'
import { activeAccount } from './account'
import { getRemote } from './remote'
import { save, store } from './store'
import { syncSkin } from './skins'

/** Адрес сервера DLauncher (плагин на Paper) или null, если он не настроен */
async function base(): Promise<string | null> {
  const { skinServer } = await getRemote()
  return skinServer ? skinServer.replace(/\/$/, '') : null
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`сервер ответил ${res.status}`)
  return (await res.json()) as T
}

function failure(e: unknown): { ok: false; error: string } {
  return { ok: false, error: 'Сервер DLauncher недоступен: ' + (e instanceof Error ? e.message : String(e)) }
}

export async function getProfile(): Promise<Fetched<PlayerProfile>> {
  const root = await base()
  if (!root) return { ok: false, error: 'Сервер DLauncher не настроен', notConfigured: true }
  const account = activeAccount()
  if (!account) return { ok: false, error: 'Нет активного аккаунта' }
  try {
    const raw = await getJson<Omit<PlayerProfile, 'capeUrl'> & { cape: string | null }>(`${root}/api/profile/${account.name}`)
    const { cape, ...rest } = raw
    return { ok: true, data: { ...rest, capeUrl: cape ? `${root}/csl/textures/${cape}` : null } }
  } catch (e) {
    return failure(e)
  }
}

export async function setCape(choice: string): Promise<Fetched<PlayerProfile>> {
  const account = activeAccount()
  if (account) {
    store.capeChoice[account.id] = choice
    save()
  }
  // Выбор уходит на сервер вместе со скином
  const sync = await syncSkin()
  if (sync.status === 'error' || sync.status === 'conflict') return { ok: false, error: sync.message ?? 'Не удалось сохранить' }
  return getProfile()
}

export async function getCapes(): Promise<Fetched<CapeCatalog>> {
  const root = await base()
  if (!root) return { ok: false, error: 'Сервер DLauncher не настроен', notConfigured: true }
  try {
    const raw = await getJson<Record<'rank' | 'free', { id: string; hash: string }[]>>(`${root}/api/capes`)
    const withUrl = (list: { id: string; hash: string }[]): { id: string; url: string }[] =>
      list.map((c) => ({ id: c.id, url: `${root}/csl/textures/${c.hash}` }))
    return { ok: true, data: { rank: withUrl(raw.rank), free: withUrl(raw.free) } }
  } catch (e) {
    return failure(e)
  }
}

/* ---------- Онлайн и топы ---------- */

const skinCache = new Map<string, { at: number; url: string | null }>()

/** Ссылка на текстуру скина игрока на сервере DLauncher (для голов в списках) */
async function skinUrl(root: string, name: string): Promise<string | null> {
  const hit = skinCache.get(name)
  if (hit && Date.now() - hit.at < 2 * 60 * 1000) return hit.url
  let url: string | null = null
  try {
    const res = await fetch(`${root}/csl/${name}.json`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const json = (await res.json()) as { skins?: Record<string, string> }
      const hash = json.skins?.default ?? json.skins?.slim
      if (hash) url = `${root}/csl/textures/${hash}`
    }
  } catch {
    // нет скина — будет стандартная голова
  }
  skinCache.set(name, { at: Date.now(), url })
  return url
}

export async function getServerInfo(): Promise<Fetched<ServerInfo>> {
  const root = await base()
  if (!root) return { ok: false, error: 'Сервер DLauncher не настроен', notConfigured: true }
  try {
    const raw = await getJson<{
      max: number
      online: { name: string; group: string }[]
      tops: Record<'balance' | 'kills' | 'playtime', { name: string; value: number }[]>
    }>(`${root}/api/server`)
    const withSkin = async (e: { name: string; value: number }): Promise<TopEntry> => ({ ...e, skinUrl: await skinUrl(root, e.name) })
    const [online, balance, kills, playtime] = await Promise.all([
      Promise.all(raw.online.map(async (p) => ({ ...p, skinUrl: await skinUrl(root, p.name) }))),
      Promise.all(raw.tops.balance.map(withSkin)),
      Promise.all(raw.tops.kills.map(withSkin)),
      Promise.all(raw.tops.playtime.map(withSkin))
    ])
    return { ok: true, data: { max: raw.max, online, tops: { balance, kills, playtime } } }
  } catch (e) {
    return failure(e)
  }
}
