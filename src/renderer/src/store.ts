import { create } from 'zustand'
import type {
  AccountState,
  GameExit,
  GameState,
  InstallProgress,
  Instance,
  LogLine,
  ProjectType,
  RemoteConfig,
  Settings,
  SkinState,
  UpdateState
} from '@shared/types'

export type Page = 'home' | 'library' | 'instance' | 'discover' | 'skins' | 'news' | 'settings' | 'console'

const MAX_LOG = 4000

interface AppState {
  page: Page
  /** Открытая сборка на странице instance */
  openInstanceId: string | null
  /** С какими фильтрами открыть каталог */
  discoverPreset: { type: ProjectType; instanceId?: string } | null
  settings: Settings | null
  accounts: AccountState
  instances: Instance[]
  skins: SkinState
  defaultSkinUrl: string | null
  game: GameState
  progress: InstallProgress | null
  log: LogLine[]
  lastExit: GameExit | null
  toast: { text: string; kind: 'info' | 'error' } | null
  remote: RemoteConfig | null
  update: UpdateState
  version: string

  go(page: Page): void
  openInstance(id: string): void
  openDiscover(type: ProjectType, instanceId?: string): void
  init(): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  setAccounts(a: AccountState): void
  setSkins(s: SkinState): void
  reloadInstances(): Promise<void>
  selectInstance(id: string): Promise<void>
  play(instanceId?: string, server?: { host: string; port?: number }): Promise<void>
  notify(text: string, kind?: 'info' | 'error'): void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
let initialized = false

export const useApp = create<AppState>((set, get) => ({
  page: 'home',
  openInstanceId: null,
  discoverPreset: null,
  settings: null,
  accounts: { accounts: [], activeId: null },
  instances: [],
  skins: { skins: [], activeId: null },
  defaultSkinUrl: null,
  game: { status: 'idle', instanceId: null },
  progress: null,
  log: [],
  lastExit: null,
  toast: null,
  remote: null,
  update: { status: 'idle' },
  version: '',

  go: (page) => set({ page }),
  openInstance: (id) => set({ page: 'instance', openInstanceId: id }),
  openDiscover: (type, instanceId) => set({ page: 'discover', discoverPreset: { type, instanceId } }),

  async init() {
    // StrictMode вызывает эффекты дважды — не подписываемся на события повторно
    if (initialized) return
    initialized = true
    const [settings, accounts, instances, game, skins, defaultSkinUrl] = await Promise.all([
      window.dl.settings.get(),
      window.dl.accounts.list(),
      window.dl.instances.list(),
      window.dl.game.state(),
      window.dl.skins.list(),
      window.dl.skins.defaultSkin().catch(() => null)
    ])
    set({ settings, accounts, instances, game, skins, defaultSkinUrl })
    void window.dl.remote.get().then((remote) => set({ remote }))
    void window.dl.system.version().then((version) => set({ version }))
    void window.dl.update.state().then((update) => set({ update }))

    window.dl.on.update((update) => set({ update }))
    window.dl.on.progress((progress) => set({ progress }))
    window.dl.on.state((game) => {
      set({ game })
      if (game.status === 'idle') void get().reloadInstances()
    })
    window.dl.on.log((line) =>
      set((s) => {
        const log = s.log.length >= MAX_LOG ? s.log.slice(-MAX_LOG + 500) : s.log.slice()
        log.push(line)
        return { log }
      })
    )
    window.dl.on.exit((lastExit) => {
      set({ lastExit })
      if (lastExit.crashed) {
        get().notify('Игра вылетела — подробности в консоли', 'error')
        set({ page: 'console' })
      }
    })
  },

  async updateSettings(patch) {
    const settings = await window.dl.settings.set(patch)
    set({ settings })
  },

  async setAccounts(accounts) {
    // У каждого аккаунта свой скин
    set({ accounts, skins: await window.dl.skins.list() })
  },

  setSkins: (skins) => set({ skins }),

  async reloadInstances() {
    const [instances, settings] = await Promise.all([window.dl.instances.list(), window.dl.settings.get()])
    set({ instances, settings })
  },

  async selectInstance(id) {
    await get().updateSettings({ selectedInstanceId: id })
  },

  async play(forcedInstanceId, server) {
    const { settings, instances } = get()
    const instanceId = forcedInstanceId ?? settings?.selectedInstanceId ?? instances[0]?.id
    if (!instanceId) {
      get().notify('Сначала создай сборку', 'error')
      set({ page: 'library' })
      return
    }
    if (instanceId !== settings?.selectedInstanceId) void get().selectInstance(instanceId)
    set({ log: [], lastExit: null })
    try {
      await window.dl.game.launch({ instanceId, server })
    } catch (e) {
      get().notify(cleanError(e), 'error')
    }
  },

  notify(text, kind = 'info') {
    clearTimeout(toastTimer)
    set({ toast: { text, kind } })
    toastTimer = setTimeout(() => set({ toast: null }), 4500)
  }
}))

/** Electron оборачивает ошибки из main в "Error invoking remote method ...: Error: текст" */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Скин активного аккаунта или Стив */
export function useActiveSkin(): { url: string | null; slim: boolean } {
  const skins = useApp((s) => s.skins)
  const fallback = useApp((s) => s.defaultSkinUrl)
  const skin = skins.skins.find((s) => s.id === skins.activeId)
  return skin ? { url: skin.url, slim: skin.model === 'slim' } : { url: fallback, slim: false }
}
