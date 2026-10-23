import type { Instance, ServerPack, ServerPackModView } from '@shared/types'
import { getRemote } from '../remote'
import { save, store } from '../store'
import { createInstance, getInstance } from './instances'
import { mrJson } from './modrinth'

/** Моды сборки сервера, которые нужно держать в этой сборке: обязательные + включённые игроком */
export function packSlugs(inst: Instance, pack: ServerPack): string[] {
  return pack.mods
    .filter((m) => !m.optional || (inst.packOptions?.[m.slug] ?? m.default ?? false))
    .map((m) => m.slug)
}

/** Сборка сервера подходит под remote.json (версия и загрузчик совпадают) */
export function packApplies(inst: Instance, pack: ServerPack | null | undefined): pack is ServerPack {
  return Boolean(inst.serverPack && pack && pack.version === inst.version && pack.loader === inst.loader)
}

let infoCache: { at: number; map: Map<string, { title: string; description: string; iconUrl?: string }> } | null = null

async function projectInfo(slugs: string[]): Promise<Map<string, { title: string; description: string; iconUrl?: string }>> {
  if (infoCache && Date.now() - infoCache.at < 30 * 60 * 1000 && slugs.every((s) => infoCache!.map.has(s))) return infoCache.map
  const map = new Map<string, { title: string; description: string; iconUrl?: string }>()
  try {
    const projects = await mrJson<{ slug: string; title: string; description: string; icon_url: string | null }[]>(
      `https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(slugs))}`
    )
    for (const p of projects) map.set(p.slug, { title: p.title, description: p.description, iconUrl: p.icon_url ?? undefined })
  } catch {
    // Без сети — покажем slug
  }
  infoCache = { at: Date.now(), map }
  return map
}

export async function packMods(instanceId: string): Promise<ServerPackModView[]> {
  const inst = getInstance(instanceId)
  const { serverPack } = await getRemote()
  if (!packApplies(inst, serverPack)) return []
  const info = await projectInfo(serverPack.mods.map((m) => m.slug))
  const enabled = new Set(packSlugs(inst, serverPack))
  return serverPack.mods.map((m) => {
    const p = info.get(m.slug)
    return { ...m, title: p?.title ?? m.slug, description: m.note ?? p?.description ?? '', iconUrl: p?.iconUrl, enabled: enabled.has(m.slug) }
  })
}

export async function setPackMod(instanceId: string, slug: string, enabled: boolean): Promise<ServerPackModView[]> {
  const inst = getInstance(instanceId)
  inst.packOptions = { ...inst.packOptions, [slug]: enabled }
  save()
  return packMods(instanceId)
}

/** Сборка сервера: Fabric под версию сервера, с оптимизацией и модами из remote.json */
export async function createServerInstance(): Promise<Instance> {
  const existing = store.instances.find((i) => i.serverPack)
  if (existing) return existing
  const { serverPack, server } = await getRemote()
  const inst = createInstance(
    { name: `${server.name} ${server.version}`, version: serverPack?.version ?? server.version, loader: serverPack?.loader ?? 'fabric', optimized: true },
    { serverPack: true }
  )
  store.settings.selectedInstanceId = inst.id
  save()
  return inst
}
