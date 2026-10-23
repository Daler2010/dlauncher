import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { totalmem } from 'os'
import type { Account, Instance, Settings, SkinModel } from '@shared/types'
import { storeFile } from './paths'

export interface SkinMeta {
  id: string
  name: string
  model: SkinModel
  addedAt: number
}

interface StoreData {
  settings: Settings
  accounts: Account[]
  activeAccountId: string | null
  instances: Instance[]
  skins: SkinMeta[]
  /** id аккаунта → id скина */
  activeSkins: Record<string, string>
  /** id аккаунта → секрет, которым ник закреплён на сервере скинов */
  skinTokens: Record<string, string>
}

function defaultMemory(): number {
  const totalMb = Math.floor(totalmem() / 1024 / 1024)
  // Четверть ОЗУ, но в пределах 2–6 ГБ
  return Math.min(6144, Math.max(2048, Math.round(totalMb / 4 / 512) * 512))
}

function defaults(): StoreData {
  return {
    settings: {
      memoryMb: defaultMemory(),
      javaPath: '',
      width: 1280,
      height: 720,
      fullscreen: false,
      jvmArgs: '',
      optimizeJvm: true,
      hideOnLaunch: true,
      showSnapshots: false,
      selectedInstanceId: null
    },
    accounts: [],
    activeAccountId: null,
    instances: [],
    skins: [],
    activeSkins: {},
    skinTokens: {}
  }
}

function load(): StoreData {
  const base = defaults()
  try {
    const raw = JSON.parse(readFileSync(storeFile, 'utf8')) as Partial<StoreData>
    return {
      ...base,
      ...raw,
      settings: { ...base.settings, ...raw.settings }
    }
  } catch {
    return base
  }
}

export const store: StoreData = load()

export function save(): void {
  mkdirSync(dirname(storeFile), { recursive: true })
  // Пишем во временный файл и переименовываем, чтобы не оставить битый JSON при сбое
  const tmp = storeFile + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, storeFile)
}
