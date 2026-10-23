import { existsSync, mkdirSync } from 'fs'
import { readdir, readFile, rename, rm, stat } from 'fs/promises'
import { basename, join } from 'path'
import { gunzipSync } from 'zlib'
import type { ContentItem, ContentKind, Screenshot, WorldInfo } from '@shared/types'
import { fileUrl } from '../files'
import { instanceDir } from '../paths'
import { getInstance } from './instances'
import { compatibleLoaders, downloadFile, mrJson, sha1File, type MrVersion } from './modrinth'

const API = 'https://api.modrinth.com/v2'
const EXT: Record<ContentKind, RegExp> = {
  mods: /\.jar(\.disabled)?$/i,
  resourcepacks: /\.zip(\.disabled)?$/i,
  shaderpacks: /\.zip(\.disabled)?$/i
}

function kindDir(instanceId: string, kind: ContentKind): string {
  const dir = join(instanceDir(instanceId), kind)
  mkdirSync(dir, { recursive: true })
  return dir
}

function safeFile(dir: string, file: string): string {
  if (basename(file) !== file) throw new Error('Некорректное имя файла')
  return join(dir, file)
}

/** Человеческое название из имени файла, если Modrinth о нём не знает */
function prettyName(file: string): string {
  return file
    .replace(/\.(jar|zip)(\.disabled)?$/i, '')
    .replace(/[-_+]?(mc)?\d+(\.\d+)+.*$/i, '')
    .replace(/[-_]/g, ' ')
    .trim() || file
}

export async function listContent(instanceId: string, kind: ContentKind): Promise<ContentItem[]> {
  const inst = getInstance(instanceId)
  const dir = kindDir(instanceId, kind)
  const files = (await readdir(dir)).filter((f) => EXT[kind].test(f))
  const items = await Promise.all(
    files.map(async (file) => {
      const s = await stat(join(dir, file))
      return { file, enabled: !file.endsWith('.disabled'), size: s.size, title: prettyName(file) } as ContentItem
    })
  )
  if (items.length === 0) return items

  // Узнаём проекты по SHA-1 файлов — так же делают Modrinth App и Prism
  try {
    const hashes = await Promise.all(items.map((i) => sha1File(join(dir, i.file))))
    const byHash = await mrJson<Record<string, MrVersion>>(`${API}/version_files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes, algorithm: 'sha1' })
    })
    const projectIds = [...new Set(Object.values(byHash).map((v) => v.project_id))]
    const projects = projectIds.length
      ? await mrJson<{ id: string; title: string; icon_url: string | null; team: string }[]>(
          `${API}/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`
        )
      : []

    const updates =
      kind === 'mods' && inst.loader !== 'vanilla'
        ? await mrJson<Record<string, MrVersion>>(`${API}/version_files/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hashes, algorithm: 'sha1', loaders: compatibleLoaders(inst.loader), game_versions: [inst.version] })
          }).catch(() => ({}) as Record<string, MrVersion>)
        : ({} as Record<string, MrVersion>)

    items.forEach((item, i) => {
      const version = byHash[hashes[i]]
      if (!version) return
      const project = projects.find((p) => p.id === version.project_id)
      item.projectId = version.project_id
      item.versionNumber = version.version_number
      if (project) {
        item.title = project.title
        item.iconUrl = project.icon_url ?? undefined
      }
      const latest = (updates as Record<string, MrVersion>)[hashes[i]]
      if (latest && latest.id !== version.id) item.updateVersionId = latest.id
    })
  } catch {
    // Без сети показываем просто файлы
  }
  return items.sort((a, b) => a.title.localeCompare(b.title))
}

export async function toggleContent(instanceId: string, kind: ContentKind, file: string): Promise<void> {
  const dir = kindDir(instanceId, kind)
  const from = safeFile(dir, file)
  const to = file.endsWith('.disabled') ? from.slice(0, -'.disabled'.length) : from + '.disabled'
  await rename(from, to)
}

export async function removeContent(instanceId: string, kind: ContentKind, file: string): Promise<void> {
  await rm(safeFile(kindDir(instanceId, kind), file), { force: true })
}

/** Обновляет выбранные файлы до свежих версий из Modrinth. Возвращает число обновлённых */
export async function updateContent(instanceId: string, kind: ContentKind, files: string[]): Promise<number> {
  const inst = getInstance(instanceId)
  const dir = kindDir(instanceId, kind)
  const hashes = await Promise.all(files.map((f) => sha1File(safeFile(dir, f))))
  const updates = await mrJson<Record<string, MrVersion>>(`${API}/version_files/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hashes,
      algorithm: 'sha1',
      loaders: kind === 'mods' ? compatibleLoaders(inst.loader) : ['minecraft', 'iris', 'optifine', 'canvas'],
      game_versions: [inst.version]
    })
  })
  let count = 0
  for (let i = 0; i < files.length; i++) {
    const latest = updates[hashes[i]]
    const file = latest?.files.find((f) => f.primary) ?? latest?.files[0]
    if (!file || file.filename === files[i]) continue
    const disabled = files[i].endsWith('.disabled')
    const target = join(dir, file.filename + (disabled ? '.disabled' : ''))
    await downloadFile(file.url, target, file.hashes.sha1)
    await rm(join(dir, files[i]), { force: true })
    count++
  }
  return count
}

const GAME_MODES = ['Выживание', 'Творческий', 'Приключение', 'Наблюдатель']

/** Достаём из level.dat (gzip + NBT) название мира и режим игры, не разбирая NBT целиком */
async function readLevel(file: string): Promise<{ name?: string; gameMode?: string }> {
  try {
    const nbt = gunzipSync(await readFile(file))
    const result: { name?: string; gameMode?: string } = {}
    const nameTag = Buffer.from([8, 0, 9, ...Buffer.from('LevelName')])
    const i = nbt.indexOf(nameTag)
    if (i >= 0) {
      const len = nbt.readUInt16BE(i + nameTag.length)
      result.name = nbt.subarray(i + nameTag.length + 2, i + nameTag.length + 2 + len).toString('utf8')
    }
    const modeTag = Buffer.from([3, 0, 8, ...Buffer.from('GameType')])
    const j = nbt.indexOf(modeTag)
    if (j >= 0) result.gameMode = GAME_MODES[nbt.readInt32BE(j + modeTag.length)]
    return result
  } catch {
    return {}
  }
}

export async function listWorlds(instanceId: string): Promise<WorldInfo[]> {
  const saves = join(instanceDir(instanceId), 'saves')
  if (!existsSync(saves)) return []
  const folders = await readdir(saves, { withFileTypes: true })
  const worlds = await Promise.all(
    folders
      .filter((d) => d.isDirectory() && existsSync(join(saves, d.name, 'level.dat')))
      .map(async (d) => {
        const level = await stat(join(saves, d.name, 'level.dat'))
        const icon = join(saves, d.name, 'icon.png')
        const info = await readLevel(join(saves, d.name, 'level.dat'))
        return {
          folder: d.name,
          name: info.name || d.name,
          gameMode: info.gameMode,
          lastPlayed: level.mtimeMs,
          iconUrl: existsSync(icon) ? fileUrl(icon, Math.round(level.mtimeMs)) : undefined
        }
      })
  )
  return worlds.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
}

export async function listScreenshots(instanceId: string): Promise<Screenshot[]> {
  const dir = join(instanceDir(instanceId), 'screenshots')
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((f) => /\.png$/i.test(f))
  const shots = await Promise.all(
    files.map(async (file) => {
      const s = await stat(join(dir, file))
      return { file, url: fileUrl(join(dir, file)), time: s.mtimeMs }
    })
  )
  return shots.sort((a, b) => b.time - a.time)
}
