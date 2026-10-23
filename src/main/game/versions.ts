import { getVersionList, type MinecraftVersion } from '@xmcl/installer'
import type { VersionInfo } from '@shared/types'
import { store } from '../store'

let cache: { at: number; versions: MinecraftVersion[] } | null = null
const TTL = 10 * 60 * 1000

export async function allVersions(): Promise<MinecraftVersion[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.versions
  const list = await getVersionList()
  cache = { at: Date.now(), versions: list.versions }
  return cache.versions
}

export async function findVersion(id: string): Promise<MinecraftVersion | undefined> {
  return (await allVersions()).find((v) => v.id === id)
}

export async function listVersions(): Promise<VersionInfo[]> {
  const versions = await allVersions()
  return versions
    .filter((v) => v.type === 'release' || (store.settings.showSnapshots && v.type === 'snapshot'))
    .map((v) => ({ id: v.id, type: v.type as VersionInfo['type'], releaseTime: v.releaseTime }))
}
