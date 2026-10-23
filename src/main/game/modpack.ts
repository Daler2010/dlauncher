import { mkdirSync } from 'fs'
import { rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, normalize, sep } from 'path'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import type { Instance, LoaderType } from '@shared/types'
import { instanceDir } from '../paths'
import { createInstance, removeInstance } from './instances'
import { downloadFile, mrJson, type MrVersion } from './modrinth'
import type { ProgressSink } from './progress'

const API = 'https://api.modrinth.com/v2'

interface MrpackIndex {
  name: string
  versionId: string
  files: {
    path: string
    hashes: { sha1: string }
    downloads: string[]
    fileSize: number
    env?: { client?: 'required' | 'optional' | 'unsupported' }
  }[]
  dependencies: Record<string, string>
}

function loaderFrom(deps: Record<string, string>): { loader: LoaderType; loaderVersion?: string } {
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'] }
  if (deps['quilt-loader']) return { loader: 'quilt', loaderVersion: deps['quilt-loader'] }
  if (deps.neoforge) return { loader: 'neoforge', loaderVersion: deps.neoforge }
  if (deps.forge) return { loader: 'forge', loaderVersion: deps.forge }
  return { loader: 'vanilla' }
}

/** Путь из модпака не должен выходить за папку сборки */
function insideInstance(root: string, relative: string): string {
  const target = normalize(join(root, relative))
  if (!target.startsWith(root + sep)) throw new Error(`Подозрительный путь в модпаке: ${relative}`)
  return target
}

/** Скачивает .mrpack свежей версии модпака и разворачивает его в новую сборку */
export async function installModpack(projectId: string, progress: ProgressSink): Promise<Instance> {
  const project = await mrJson<{ id: string; title: string; icon_url: string | null }>(`${API}/project/${projectId}`)
  const versions = await mrJson<MrVersion[]>(`${API}/project/${projectId}/version`)
  const version = versions.find((v) => v.version_type === 'release') ?? versions[0]
  const packFile = version?.files.find((f) => f.filename.endsWith('.mrpack')) ?? version?.files[0]
  if (!version || !packFile) throw new Error('У модпака нет файлов для скачивания')

  const tmp = join(tmpdir(), `dlauncher-${version.id}.mrpack`)
  await downloadFile(packFile.url, tmp, packFile.hashes.sha1)
  const zip = await open(tmp, { lazyEntries: true, autoClose: false })
  let inst: Instance | null = null
  try {
    const entries = await readAllEntries(zip)
    const indexEntry = entries.find((e) => e.fileName === 'modrinth.index.json')
    if (!indexEntry) throw new Error('Это не модпак Modrinth')
    const index = JSON.parse((await readEntry(zip, indexEntry)).toString('utf8')) as MrpackIndex
    const gameVersion = index.dependencies.minecraft
    if (!gameVersion) throw new Error('В модпаке не указана версия игры')

    inst = createInstance(
      { name: project.title, version: gameVersion, ...loaderFrom(index.dependencies), optimized: false },
      { iconUrl: project.icon_url ?? undefined, modpack: { projectId: project.id, versionId: version.id, title: project.title } }
    )
    const root = instanceDir(inst.id)

    // Файлы модпака: только нужные клиенту, по 8 параллельно
    const files = index.files.filter((f) => f.env?.client !== 'unsupported')
    const totalBytes = files.reduce((s, f) => s + f.fileSize, 0)
    let bytes = 0
    let done = 0
    const report = (): void =>
      progress({ instanceId: inst!.id, stage: `Модпак ${project.title}`, stageIndex: 1, stageCount: 1, files: done, bytes, totalBytes })
    report()
    const queue = [...files]
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          await downloadFile(f.downloads[0], insideInstance(root, f.path), f.hashes.sha1)
          bytes += f.fileSize
          done++
          report()
        }
      })
    )

    // overrides и client-overrides — конфиги, ресурспаки и прочее поверх
    for (const prefix of ['overrides/', 'client-overrides/']) {
      for (const entry of entries.filter((e) => e.fileName.startsWith(prefix) && !e.fileName.endsWith('/'))) {
        const target = insideInstance(root, entry.fileName.slice(prefix.length))
        mkdirSync(dirname(target), { recursive: true })
        await writeFile(target, await readEntry(zip, entry))
      }
    }
    progress(null)
    return inst
  } catch (e) {
    progress(null)
    if (inst) await removeInstance(inst.id)
    throw e
  } finally {
    zip.close()
    await rm(tmp, { force: true })
  }
}
