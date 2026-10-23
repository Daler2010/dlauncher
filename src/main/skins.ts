import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import { copyFile, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow, dialog, nativeImage } from 'electron'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import type { Skin, SkinModel, SkinState, SkinSync } from '@shared/types'
import { activeAccount } from './account'
import { fileUrl } from './files'
import { dataDir } from './paths'
import { getRemote } from './remote'
import { save, store, type SkinMeta } from './store'

const skinsDir = join(dataDir, 'skins')
const skinPath = (id: string): string => join(skinsDir, id + '.png')

function toSkin(meta: SkinMeta): Skin {
  return { ...meta, url: fileUrl(skinPath(meta.id), meta.addedAt) }
}

let lastSync: SkinSync | undefined

export function skinState(): SkinState {
  const account = activeAccount()
  return {
    skins: store.skins.filter((s) => existsSync(skinPath(s.id))).map(toSkin),
    activeId: account ? (store.activeSkins[account.id] ?? null) : null,
    sync: lastSync
  }
}

/* ---------- Сервер скинов (плагин DLauncherSkins на Paper) ---------- */

function tokenFor(accountId: string): string {
  let token = store.skinTokens[accountId]
  if (!token) {
    token = randomBytes(24).toString('hex')
    store.skinTokens[accountId] = token
    save()
  }
  return token
}

/**
 * Загружает активный скин на сервер скинов (или снимает его), чтобы другие игроки
 * DLauncher видели его через CustomSkinLoader. Ник закрепляется за первым, кто загрузил скин.
 */
export async function syncSkin(): Promise<SkinSync> {
  const account = activeAccount()
  const { skinServer } = await getRemote()
  if (!account || !skinServer) return (lastSync = { status: 'off', message: 'Сервер скинов не настроен' })
  const active = activeSkin()
  const url = `${skinServer.replace(/\/$/, '')}/api/skins/${account.name}`
  const headers: Record<string, string> = { 'X-DL-Token': tokenFor(account.id) }
  try {
    let res: Response
    if (active) {
      headers['X-DL-Model'] = active.meta.model
      headers['Content-Type'] = 'image/png'
      res = await fetch(url, { method: 'PUT', headers, body: await readFile(active.path), signal: AbortSignal.timeout(8000) })
    } else {
      res = await fetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(8000) })
    }
    if (res.status === 403) {
      return (lastSync = { status: 'conflict', message: `Ник ${account.name} уже закреплён за другим игроком — попроси админа сбросить` })
    }
    if (!res.ok) throw new Error(`сервер ответил ${res.status}`)
    return (lastSync = { status: 'synced', message: active ? 'Скин виден другим игрокам' : 'Скин снят с сервера' })
  } catch (e) {
    return (lastSync = { status: 'error', message: 'Сервер скинов недоступен: ' + (e instanceof Error ? e.message : String(e)) })
  }
}

/** Изменение скина + синхронизация с сервером (не дольше 8 секунд) */
async function changed(): Promise<SkinState> {
  await syncSkin()
  return skinState()
}

export function activeSkin(): { meta: SkinMeta; path: string } | null {
  const account = activeAccount()
  const id = account ? store.activeSkins[account.id] : undefined
  const meta = store.skins.find((s) => s.id === id)
  return meta && existsSync(skinPath(meta.id)) ? { meta, path: skinPath(meta.id) } : null
}

/**
 * Проверяет картинку скина и угадывает модель: у «тонкой» (Alex) рук шириной 3 пикселя
 * столбец x=54..55 на высоте рук прозрачный.
 */
function inspectSkin(png: Buffer): SkinModel {
  const img = nativeImage.createFromBuffer(png)
  const { width, height } = img.getSize()
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new Error(`Скин должен быть 64×64 или 64×32, а этот ${width}×${height}`)
  }
  if (height === 32) return 'classic'
  const bitmap = img.toBitmap() // BGRA
  const alpha = (x: number, y: number): number => bitmap[(y * width + x) * 4 + 3]
  return alpha(54, 20) === 0 && alpha(55, 25) === 0 ? 'slim' : 'classic'
}

async function addSkin(png: Buffer, name: string, model?: SkinModel): Promise<SkinState> {
  const detected = inspectSkin(png)
  mkdirSync(skinsDir, { recursive: true })
  const meta: SkinMeta = { id: randomBytes(5).toString('hex'), name, model: model ?? detected, addedAt: Date.now() }
  await writeFile(skinPath(meta.id), png)
  store.skins.unshift(meta)
  const account = activeAccount()
  if (account) store.activeSkins[account.id] = meta.id
  save()
  return changed()
}

export async function importSkinFile(win: BrowserWindow | null): Promise<SkinState> {
  const opts = { title: 'Выбери скин', filters: [{ name: 'Скин Minecraft', extensions: ['png'] }], properties: ['openFile' as const] }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || !res.filePaths[0]) return skinState()
  const file = res.filePaths[0]
  const name = file.split(/[\\/]/).pop()!.replace(/\.png$/i, '')
  return addSkin(await readFile(file), name)
}

/** Берёт скин лицензионного игрока с таким ником (Mojang API) */
export async function importSkinByNick(nick: string): Promise<SkinState> {
  const clean = nick.trim()
  if (!/^\w{3,16}$/.test(clean)) throw new Error('Ник должен быть 3–16 символов: латиница, цифры и _')
  const profile = await fetch(`https://api.mojang.com/users/profiles/minecraft/${clean}`)
  if (profile.status === 404 || profile.status === 204) throw new Error(`Лицензионного игрока ${clean} не существует`)
  if (!profile.ok) throw new Error(`Mojang ответил ${profile.status}`)
  const { id, name } = (await profile.json()) as { id: string; name: string }
  const session = (await (await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`)).json()) as {
    properties: { name: string; value: string }[]
  }
  const textures = JSON.parse(
    Buffer.from(session.properties.find((p) => p.name === 'textures')?.value ?? '', 'base64').toString('utf8') || '{}'
  ) as { textures?: { SKIN?: { url: string; metadata?: { model?: string } } } }
  const skin = textures.textures?.SKIN
  if (!skin) throw new Error(`У ${name} стандартный скин`)
  const png = Buffer.from(await (await fetch(skin.url)).arrayBuffer())
  return addSkin(png, name, skin.metadata?.model === 'slim' ? 'slim' : 'classic')
}

export async function removeSkin(id: string): Promise<SkinState> {
  const wasActive = activeSkin()?.meta.id === id
  store.skins = store.skins.filter((s) => s.id !== id)
  for (const [acc, skin] of Object.entries(store.activeSkins)) if (skin === id) delete store.activeSkins[acc]
  save()
  await rm(skinPath(id), { force: true })
  return wasActive ? changed() : skinState()
}

export async function selectSkin(id: string | null): Promise<SkinState> {
  const account = activeAccount()
  if (account) {
    if (id) store.activeSkins[account.id] = id
    else delete store.activeSkins[account.id]
    save()
  }
  return changed()
}

export async function updateSkin(id: string, patch: Partial<Pick<SkinMeta, 'model' | 'name'>>): Promise<SkinState> {
  const meta = store.skins.find((s) => s.id === id)
  if (meta) {
    Object.assign(meta, patch)
    save()
  }
  // Модель влияет на то, как скин видят другие, — синхронизируем
  return patch.model && activeSkin()?.meta.id === id ? changed() : skinState()
}

/** Стандартный скин Стива берём из уже скачанного клиента игры, а не храним в лаунчере */
export async function defaultSkin(): Promise<string | null> {
  const target = join(skinsDir, '_steve.png')
  if (existsSync(target)) return fileUrl(target)
  const versions = join(dataDir, 'versions')
  if (!existsSync(versions)) return null
  for (const id of readdirSync(versions)) {
    const jar = join(versions, id, id + '.jar')
    if (!existsSync(jar)) continue
    try {
      const zip = await open(jar, { lazyEntries: true, autoClose: false })
      const entries = await readAllEntries(zip)
      const entry =
        entries.find((e) => e.fileName === 'assets/minecraft/textures/entity/player/wide/steve.png') ??
        entries.find((e) => e.fileName === 'assets/minecraft/textures/entity/steve.png')
      if (entry) {
        const data = await readEntry(zip, entry)
        zip.close()
        mkdirSync(skinsDir, { recursive: true })
        await writeFile(target, data)
        return fileUrl(target)
      }
      zip.close()
    } catch {
      // пробуем следующую версию
    }
  }
  return null
}

/* ---------- Скин в игре через CustomSkinLoader ---------- */

export const SKIN_MOD = 'customskinloader'

const LOCAL_SKIN_ENTRY = {
  name: 'LocalSkin',
  type: 'Legacy',
  checkPNG: false,
  skin: 'LocalSkin/skins/{USERNAME}.png',
  model: 'auto',
  cape: 'LocalSkin/capes/{USERNAME}.png',
  elytra: 'LocalSkin/elytras/{USERNAME}.png'
}

/**
 * Настраивает CustomSkinLoader в сборке. Порядок загрузки:
 * 1) LocalSkin — свой скин, работает даже без сети;
 * 2) сервер скинов DLauncher — скины других игроков DLauncher;
 * 3) Mojang и Ely.by — для лицензионных ников.
 * Свои источники стоят первыми, иначе мод возьмёт скин с Mojang или TLauncher по тому же нику.
 */
export async function applySkinToInstance(gameDir: string, nick: string): Promise<boolean> {
  const active = activeSkin()
  const cslDir = join(gameDir, 'CustomSkinLoader')
  const target = join(cslDir, 'LocalSkin', 'skins', nick + '.png')
  mkdirSync(join(cslDir, 'LocalSkin', 'skins'), { recursive: true })
  if (active) await copyFile(active.path, target)
  else await rm(target, { force: true })

  const { skinServer } = await getRemote()
  const configPath = join(cslDir, 'CustomSkinLoader.json')
  let config: { loadlist?: { name: string }[]; [k: string]: unknown } = {}
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'))
  } catch {
    // Конфига ещё нет — мод создаст остальное сам
  }
  const ours = new Set(['LocalSkin', 'DLauncher'])
  const list = (config.loadlist ?? []).filter((e) => !ours.has(e.name))
  if (list.length === 0) {
    list.push({ name: 'Mojang', type: 'MojangAPI' } as { name: string }, { name: 'ElyBy', type: 'ElyByAPI' } as { name: string })
  }
  const server = skinServer ? [{ name: 'DLauncher', type: 'CustomSkinAPI', root: `${skinServer.replace(/\/$/, '')}/csl/` }] : []
  config.loadlist = [LOCAL_SKIN_ENTRY, ...server, ...list]
  await writeFile(configPath, JSON.stringify(config, null, 2))
  return Boolean(active)
}
