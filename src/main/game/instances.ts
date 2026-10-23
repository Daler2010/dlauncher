import { randomBytes } from 'crypto'
import { mkdirSync } from 'fs'
import { cp, rm } from 'fs/promises'
import { join, normalize } from 'path'
import { shell } from 'electron'
import type { Instance, InstancePatch, NewInstance } from '@shared/types'
import { instanceDir } from '../paths'
import { save, store } from '../store'

const DEFAULT_VERSION = '1.21.1'

/** При первом запуске создаём оптимизированную сборку под версию сервера */
export function ensureDefaultInstance(): void {
  if (store.instances.length > 0) return
  const inst = createInstance({ name: 'Анархия 1.21.1', version: DEFAULT_VERSION, loader: 'fabric', optimized: true })
  store.settings.selectedInstanceId = inst.id
  save()
}

export function listInstances(): Instance[] {
  return store.instances
}

export function getInstance(id: string): Instance {
  const inst = store.instances.find((i) => i.id === id)
  if (!inst) throw new Error('Сборка не найдена')
  return inst
}

export function createInstance(input: NewInstance, extra: Partial<Instance> = {}): Instance {
  const name = input.name.trim() || input.version
  const inst: Instance = {
    id: randomBytes(6).toString('hex'),
    name,
    version: input.version,
    loader: input.loader,
    loaderVersion: input.loaderVersion,
    optimized: input.loader !== 'vanilla' && input.optimized !== false,
    createdAt: Date.now(),
    ...extra
  }
  mkdirSync(instanceDir(inst.id), { recursive: true })
  store.instances.push(inst)
  if (!store.settings.selectedInstanceId) store.settings.selectedInstanceId = inst.id
  save()
  return inst
}

export function updateInstance(id: string, patch: InstancePatch): Instance {
  const inst = getInstance(id)
  if (patch.name !== undefined) inst.name = patch.name.trim() || inst.name
  if (patch.memoryMb !== undefined) inst.memoryMb = patch.memoryMb || undefined
  if (patch.optimized !== undefined) inst.optimized = inst.loader !== 'vanilla' && patch.optimized
  if (patch.loaderVersion !== undefined) inst.loaderVersion = patch.loaderVersion || undefined
  save()
  return inst
}

export async function duplicateInstance(id: string): Promise<Instance> {
  const src = getInstance(id)
  const copy = createInstance(
    { name: `${src.name} (копия)`, version: src.version, loader: src.loader, loaderVersion: src.loaderVersion, optimized: src.optimized },
    { iconUrl: src.iconUrl, memoryMb: src.memoryMb, modpack: src.modpack }
  )
  await cp(instanceDir(src.id), instanceDir(copy.id), { recursive: true, force: true })
  return copy
}

export async function removeInstance(id: string): Promise<Instance[]> {
  store.instances = store.instances.filter((i) => i.id !== id)
  if (store.settings.selectedInstanceId === id) {
    store.settings.selectedInstanceId = store.instances[0]?.id ?? null
  }
  save()
  await rm(instanceDir(id), { recursive: true, force: true })
  return store.instances
}

export async function openInstanceFolder(id: string, sub?: string): Promise<void> {
  const root = instanceDir(id)
  const dir = sub ? normalize(join(root, sub)) : root
  if (!dir.startsWith(root)) return
  mkdirSync(dir, { recursive: true })
  await shell.openPath(dir)
}

export function touchInstance(id: string): void {
  const inst = store.instances.find((i) => i.id === id)
  if (inst) {
    inst.lastPlayed = Date.now()
    save()
  }
}

export function addPlayTime(id: string, ms: number): void {
  const inst = store.instances.find((i) => i.id === id)
  if (inst) {
    inst.playTimeMs = (inst.playTimeMs ?? 0) + ms
    save()
  }
}
