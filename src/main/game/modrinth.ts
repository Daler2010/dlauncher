import { createHash } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  ContentKind,
  LoaderType,
  ProjectDetails,
  ProjectHit,
  ProjectType,
  SearchQuery,
  SearchResult
} from '@shared/types'
import type { InstallRunner } from './progress'

const API = 'https://api.modrinth.com/v2'
export const MR_HEADERS = { 'User-Agent': 'Daler2010/dlauncher/0.1.0' }

export interface MrFile {
  url: string
  filename: string
  primary: boolean
  size: number
  hashes: { sha1: string; sha512?: string }
}

export interface MrVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  loaders: string[]
  game_versions: string[]
  files: MrFile[]
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded' }[]
}

interface MrProject {
  id: string
  slug: string
  title: string
  description: string
  body: string
  icon_url: string | null
  gallery: { url: string; title: string | null; featured: boolean }[]
  downloads: number
  followers: number
  categories: string[]
  loaders: string[]
  game_versions: string[]
  project_type: ProjectType
  source_url: string | null
  issues_url: string | null
  wiki_url: string | null
  discord_url: string | null
  updated: string
}

/** Некоторые ответы приходят с BOM — разбираем текст сами */
export async function mrJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...MR_HEADERS, ...(init?.headers ?? {}) } })
  if (!res.ok) throw new Error(`Modrinth ответил ${res.status}`)
  return JSON.parse((await res.text()).replace(/^﻿/, '')) as T
}

/* ---------- Поиск и страница проекта ---------- */

/** Шейдеры и ресурспаки не зависят от загрузчика модов: для них фильтруем только по версии */
function facetsFor(q: SearchQuery): string[][] {
  const facets = [[`project_type:${q.type}`]]
  if (q.gameVersion) facets.push([`versions:${q.gameVersion}`])
  if (q.loader && q.loader !== 'vanilla' && (q.type === 'mod' || q.type === 'modpack')) {
    facets.push([`categories:${q.loader}`])
  }
  return facets
}

export async function searchProjects(q: SearchQuery): Promise<SearchResult> {
  const params = new URLSearchParams({
    query: q.query,
    index: q.sort,
    offset: String(q.offset),
    limit: '20',
    facets: JSON.stringify(facetsFor(q))
  })
  const data = await mrJson<{
    hits: {
      project_id: string
      slug: string
      title: string
      author: string
      description: string
      icon_url: string | null
      featured_gallery: string | null
      gallery: string[]
      downloads: number
      follows: number
      display_categories: string[]
      project_type: ProjectType
      date_modified: string
    }[]
    total_hits: number
    offset: number
  }>(`${API}/search?${params}`)
  const hits: ProjectHit[] = data.hits.map((h) => ({
    id: h.project_id,
    slug: h.slug,
    title: h.title,
    author: h.author,
    description: h.description,
    iconUrl: h.icon_url ?? undefined,
    imageUrl: h.featured_gallery ?? h.gallery?.[0] ?? undefined,
    downloads: h.downloads,
    follows: h.follows,
    categories: h.display_categories ?? [],
    type: h.project_type,
    updated: h.date_modified
  }))
  return { hits, total: data.total_hits, offset: data.offset }
}

export async function getProject(idOrSlug: string): Promise<ProjectDetails> {
  const p = await mrJson<MrProject>(`${API}/project/${encodeURIComponent(idOrSlug)}`)
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    body: p.body,
    iconUrl: p.icon_url ?? undefined,
    gallery: [...p.gallery].sort((a, b) => Number(b.featured) - Number(a.featured)).map((g) => ({ url: g.url, title: g.title ?? undefined })),
    downloads: p.downloads,
    followers: p.followers,
    categories: p.categories,
    loaders: p.loaders,
    gameVersions: p.game_versions,
    type: p.project_type,
    links: {
      source: p.source_url ?? undefined,
      issues: p.issues_url ?? undefined,
      wiki: p.wiki_url ?? undefined,
      discord: p.discord_url ?? undefined
    },
    updated: p.updated
  }
}

/* ---------- Выбор версии и загрузка ---------- */

/** Загрузчики, чьи моды подходят сборке (Quilt умеет запускать моды Fabric) */
export function compatibleLoaders(loader: LoaderType): string[] {
  if (loader === 'quilt') return ['quilt', 'fabric']
  return [loader]
}

/**
 * Лучшая версия проекта под версию игры (и загрузчик, если это мод): самая свежая не-альфа.
 * Предпочитать «release» нельзя: Iris для 1.21.1 выходит как beta, а свежий Sodium
 * несовместим со старыми релизами Iris — игра падает на загрузке.
 */
export async function bestVersion(
  project: string,
  gameVersion: string,
  loaders: string[] | null
): Promise<MrVersion | null> {
  const params = new URLSearchParams({ game_versions: JSON.stringify([gameVersion]) })
  if (loaders) params.set('loaders', JSON.stringify(loaders))
  try {
    const versions = await mrJson<MrVersion[]>(`${API}/project/${project}/version?${params}`)
    return versions.find((v) => v.version_type !== 'alpha') ?? versions[0] ?? null
  } catch {
    return null
  }
}

export async function sha1File(file: string): Promise<string> {
  return createHash('sha1').update(await readFile(file)).digest('hex')
}

/** Качает файл с проверкой SHA-1 */
export async function downloadFile(url: string, target: string, sha1?: string): Promise<number> {
  const res = await fetch(url, { headers: MR_HEADERS })
  if (!res.ok) throw new Error(`Не удалось скачать ${url} (${res.status})`)
  const data = Buffer.from(await res.arrayBuffer())
  if (sha1 && createHash('sha1').update(data).digest('hex') !== sha1) {
    throw new Error(`Файл ${target} скачался с ошибкой`)
  }
  mkdirSync(join(target, '..'), { recursive: true })
  await writeFile(target, data)
  return data.length
}

const folderFor: Record<ProjectType, ContentKind | null> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  modpack: null
}

export interface InstallContext {
  gameDir: string
  gameVersion: string
  loader: LoaderType
}

/**
 * Ставит проект в сборку вместе с обязательными зависимостями.
 * Шейдерам на Fabric/Quilt нужен Iris — подтягиваем его сами.
 * Возвращает название установленного проекта.
 */
export async function installProject(ctx: InstallContext, projectId: string): Promise<string> {
  const project = await mrJson<MrProject>(`${API}/project/${projectId}`)
  const kind = folderFor[project.project_type]
  if (!kind) throw new Error('Модпак ставится как отдельная сборка')
  if (kind === 'mods' && ctx.loader === 'vanilla') {
    throw new Error('В ванильную сборку моды не ставятся — создай сборку на Fabric, Forge или NeoForge')
  }

  const queue: { id: string; kind: ContentKind }[] = [{ id: project.id, kind }]
  if (kind === 'shaderpacks') {
    if (ctx.loader === 'fabric' || ctx.loader === 'quilt') queue.push({ id: 'iris', kind: 'mods' })
    else if (ctx.loader === 'vanilla') throw new Error('Шейдерам нужен Iris — создай сборку на Fabric')
  }

  const seen = new Set<string>()
  while (queue.length) {
    const job = queue.shift()!
    const loaders = job.kind === 'mods' ? compatibleLoaders(ctx.loader) : null
    const version = await bestVersion(job.id, ctx.gameVersion, loaders)
    if (!version) {
      if (job.id === project.id) throw new Error(`«${project.title}» не выходил под ${ctx.gameVersion}${loaders ? ' / ' + ctx.loader : ''}`)
      continue
    }
    if (seen.has(version.project_id)) continue
    seen.add(version.project_id)
    const file = version.files.find((f) => f.primary) ?? version.files[0]
    if (!file) continue
    const dir = join(ctx.gameDir, job.kind)
    const target = join(dir, file.filename)
    if (!existsSync(target) && !existsSync(target + '.disabled')) {
      await downloadFile(file.url, target, file.hashes.sha1)
    }
    if (job.kind === 'mods') {
      for (const dep of version.dependencies) {
        if (dep.dependency_type === 'required' && dep.project_id) queue.push({ id: dep.project_id, kind: 'mods' })
      }
    }
  }
  return project.title
}

/* ---------- Моды оптимизации и служебные моды ---------- */

/** Что лаунчер поставил сам: project_id → имя файла */
interface ManagedMods {
  gameVersion: string
  loader: LoaderType
  files: Record<string, string>
}

const MANIFEST = '.dlauncher-mods.json'

/**
 * Ставит набор модов в папку mods сборки вместе с обязательными зависимостями.
 * Повторный вызов ничего не качает, если всё на месте.
 */
export async function ensureMods(
  gameDir: string,
  slugs: string[],
  gameVersion: string,
  loader: LoaderType,
  runner: InstallRunner
): Promise<void> {
  const modsDir = join(gameDir, 'mods')
  mkdirSync(modsDir, { recursive: true })
  const manifestPath = join(modsDir, MANIFEST)
  let managed: ManagedMods = { gameVersion, loader, files: {} }
  try {
    const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as ManagedMods & { slugs?: string[] }
    if (saved.gameVersion === gameVersion && saved.loader === loader && sameSet(saved.slugs ?? [], slugs)) managed = saved
  } catch {
    // Первый запуск
  }

  const allPresent =
    Object.keys(managed.files).length > 0 &&
    Object.values(managed.files).every((f) => existsSync(join(modsDir, f)) || existsSync(join(modsDir, f + '.disabled')))
  if (allPresent) return

  await runner.custom('Служебные моды', async (update) => {
    const wanted = new Map<string, MrVersion>()
    const queue = [...slugs]
    while (queue.length) {
      const project = queue.shift()!
      const version = await bestVersion(project, gameVersion, compatibleLoaders(loader))
      if (!version || wanted.has(version.project_id)) continue
      wanted.set(version.project_id, version)
      for (const dep of version.dependencies) {
        if (dep.dependency_type === 'required' && dep.project_id && !wanted.has(dep.project_id)) queue.push(dep.project_id)
      }
    }

    const jobs = [...wanted.values()].map((v) => ({ v, file: v.files.find((f) => f.primary) ?? v.files[0] }))
    const totalBytes = jobs.reduce((s, j) => s + (j.file?.size ?? 0), 0)
    let bytes = 0
    let files = 0
    const next: ManagedMods & { slugs: string[] } = { gameVersion, loader, files: {}, slugs }

    for (const { v, file } of jobs) {
      if (!file) continue
      const target = join(modsDir, file.filename)
      const old = managed.files[v.project_id]
      if (old && old !== file.filename) await rm(join(modsDir, old), { force: true })
      // Игрок мог выключить мод — не включаем его обратно
      if (!existsSync(target + '.disabled') && (!existsSync(target) || (await sha1File(target)) !== file.hashes.sha1)) {
        await downloadFile(file.url, target, file.hashes.sha1)
      }
      bytes += file.size
      files++
      next.files[v.project_id] = file.filename
      update(bytes, totalBytes, files)
    }
    await writeFile(manifestPath, JSON.stringify(next, null, 2))
  })
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}
