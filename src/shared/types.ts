export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export interface Account {
  /** UUID без дефисов, как у офлайн-аккаунтов Mojang */
  id: string
  name: string
  type: 'offline'
  createdAt: number
}

export interface AccountState {
  accounts: Account[]
  activeId: string | null
}

export interface Instance {
  id: string
  name: string
  version: string
  loader: LoaderType
  loaderVersion?: string
  /** Ставить моды производительности (Sodium, Lithium и др.) — только для Fabric */
  optimized?: boolean
  /** Своё значение ОЗУ, иначе берётся из общих настроек */
  memoryMb?: number
  /** Иконка сборки (URL, например из модпака Modrinth) */
  iconUrl?: string
  /** Откуда сборка: модпак Modrinth */
  modpack?: { projectId: string; versionId: string; title: string }
  createdAt: number
  lastPlayed?: number
  /** Сколько миллисекунд наиграно всего */
  playTimeMs?: number
}

export interface NewInstance {
  name: string
  version: string
  loader: LoaderType
  loaderVersion?: string
  optimized?: boolean
}

export type InstancePatch = Partial<Pick<Instance, 'name' | 'memoryMb' | 'optimized' | 'loaderVersion'>>

export interface Settings {
  memoryMb: number
  /** Пусто — Java подбирается и скачивается автоматически */
  javaPath: string
  width: number
  height: number
  fullscreen: boolean
  jvmArgs: string
  /** Настроенный G1 GC и повышенный приоритет процесса игры */
  optimizeJvm: boolean
  hideOnLaunch: boolean
  showSnapshots: boolean
  selectedInstanceId: string | null
}

export interface VersionInfo {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export interface InstallProgress {
  instanceId: string
  stage: string
  stageIndex: number
  stageCount: number
  files: number
  bytes: number
  totalBytes: number
}

export type GameStatus = 'idle' | 'preparing' | 'running'

export interface GameState {
  status: GameStatus
  instanceId: string | null
}

export interface GameExit {
  instanceId: string
  code: number | null
  crashed: boolean
  crashReport?: string
  crashReportLocation?: string
}

export interface LogLine {
  stream: 'out' | 'err' | 'launcher'
  text: string
}

export interface LaunchRequest {
  instanceId: string
  server?: { host: string; port?: number }
}

/* ---------- Сервер и новости ---------- */

export interface ServerStatus {
  online: boolean
  ping?: number
  version?: string
  motd?: string
  players?: { online: number; max: number; sample: string[] }
  /** data:image/png;base64,... */
  favicon?: string
  error?: string
}

export interface NewsItem {
  id: string
  title: string
  text: string
  date: string
  image: string
  url: string
  tag: string
}

/* ---------- Modrinth ---------- */

export type ProjectType = 'mod' | 'modpack' | 'resourcepack' | 'shader'
export type SearchSort = 'relevance' | 'downloads' | 'follows' | 'updated' | 'newest'

export interface SearchQuery {
  query: string
  type: ProjectType
  sort: SearchSort
  offset: number
  gameVersion?: string
  loader?: LoaderType
}

export interface ProjectHit {
  id: string
  slug: string
  title: string
  author: string
  description: string
  iconUrl?: string
  imageUrl?: string
  downloads: number
  follows: number
  categories: string[]
  type: ProjectType
  updated: string
}

export interface SearchResult {
  hits: ProjectHit[]
  total: number
  offset: number
}

export interface ProjectDetails {
  id: string
  slug: string
  title: string
  description: string
  body: string
  iconUrl?: string
  gallery: { url: string; title?: string }[]
  downloads: number
  followers: number
  categories: string[]
  loaders: string[]
  gameVersions: string[]
  type: ProjectType
  links: { source?: string; issues?: string; wiki?: string; discord?: string }
  updated: string
}

/* ---------- Содержимое сборки ---------- */

export type ContentKind = 'mods' | 'resourcepacks' | 'shaderpacks'

export interface ContentItem {
  file: string
  enabled: boolean
  size: number
  title: string
  iconUrl?: string
  projectId?: string
  versionNumber?: string
  author?: string
  /** Есть более свежая версия под эту сборку */
  updateVersionId?: string
}

export interface WorldInfo {
  folder: string
  name: string
  lastPlayed?: number
  gameMode?: string
  iconUrl?: string
}

export interface Screenshot {
  file: string
  url: string
  time: number
}

/* ---------- Скины ---------- */

export type SkinModel = 'classic' | 'slim'

export interface Skin {
  id: string
  name: string
  model: SkinModel
  addedAt: number
  /** dlfile:// ссылка на PNG */
  url: string
}

export interface SkinState {
  skins: Skin[]
  /** Скин активного аккаунта */
  activeId: string | null
  /** Загружен ли скин на сервер скинов, чтобы его видели другие */
  sync?: SkinSync
}

/* ---------- Обновления и удалённый конфиг ---------- */

export interface UpdateState {
  status: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  error?: string
}

export interface Announcement {
  id: string
  title: string
  text: string
  date: string
  url?: string
}

export interface RemoteConfig {
  server: { name: string; motd: string; host: string; port?: number; version: string; slots: number }
  /** Адрес плагина скинов на сервере, например http://host:port */
  skinServer: string | null
  announcements: Announcement[]
}

/* ---------- Профиль игрока с сервера (плагин DLauncherSkins) ---------- */

export interface PlayerProfile {
  name: string
  /** Группа LuckPerms: default, vip, premium, elite, legend, titan, helper, moder, admin */
  group: string
  prefix: string | null
  /** URL текстуры плаща ранга, если он есть и включён */
  capeUrl: string | null
  /** Есть ли плащ за ранг игрока */
  capeAvailable: boolean
  /** Выбор игрока: "rank", "off" или id плаща из каталога */
  capeChoice: string
  clan: { tag: string; name: string } | null
  known: boolean
  online: boolean
  balance: number | null
  kills: number
  deaths: number
  mobKills: number
  playMinutes: number
  firstPlayed: number
  lastSeen: number
}

export interface TopEntry {
  name: string
  value: number
  skinUrl: string | null
}

export interface ServerInfo {
  max: number
  online: { name: string; group: string; skinUrl: string | null }[]
  tops: { balance: TopEntry[]; kills: TopEntry[]; playtime: TopEntry[] }
}

export interface CapeCatalog {
  /** Плащи за ранги: id = группа LuckPerms */
  rank: { id: string; url: string }[]
  /** Плащи, которые может выбрать любой игрок */
  free: { id: string; url: string }[]
}

export type Fetched<T> = { ok: true; data: T } | { ok: false; error: string; notConfigured?: boolean }

/** Скин активного аккаунта на сервере скинов */
export interface SkinSync {
  status: 'off' | 'synced' | 'error' | 'conflict'
  message?: string
}

export interface DLApi {
  window: {
    minimize(): void
    maximize(): void
    close(): void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  accounts: {
    list(): Promise<AccountState>
    add(name: string): Promise<AccountState>
    remove(id: string): Promise<AccountState>
    select(id: string): Promise<AccountState>
    logout(): Promise<AccountState>
  }
  versions: {
    list(): Promise<VersionInfo[]>
    loaders(loader: LoaderType, gameVersion: string): Promise<string[]>
  }
  instances: {
    list(): Promise<Instance[]>
    create(input: NewInstance): Promise<Instance>
    update(id: string, patch: InstancePatch): Promise<Instance>
    duplicate(id: string): Promise<Instance>
    remove(id: string): Promise<Instance[]>
    openFolder(id: string, sub?: string): Promise<void>
    worlds(id: string): Promise<WorldInfo[]>
    screenshots(id: string): Promise<Screenshot[]>
  }
  content: {
    list(instanceId: string, kind: ContentKind): Promise<ContentItem[]>
    toggle(instanceId: string, kind: ContentKind, file: string): Promise<void>
    remove(instanceId: string, kind: ContentKind, file: string): Promise<void>
    update(instanceId: string, kind: ContentKind, files: string[]): Promise<number>
  }
  modrinth: {
    search(q: SearchQuery): Promise<SearchResult>
    project(idOrSlug: string): Promise<ProjectDetails>
    install(instanceId: string, projectId: string): Promise<string>
    installModpack(projectId: string): Promise<Instance>
  }
  skins: {
    list(): Promise<SkinState>
    importFile(): Promise<SkinState>
    importNick(nick: string): Promise<SkinState>
    remove(id: string): Promise<SkinState>
    select(id: string | null): Promise<SkinState>
    setModel(id: string, model: SkinModel): Promise<SkinState>
    rename(id: string, name: string): Promise<SkinState>
    defaultSkin(): Promise<string | null>
  }
  server: {
    status(host: string, port?: number): Promise<ServerStatus>
    /** Профиль активного аккаунта с сервера DLauncher */
    profile(): Promise<Fetched<PlayerProfile>>
    /** Онлайн и топы с сервера DLauncher */
    info(): Promise<Fetched<ServerInfo>>
    /** Каталог плащей сервера */
    capes(): Promise<Fetched<CapeCatalog>>
    /** Выбрать плащ: "rank", "off" или id из каталога */
    setCape(choice: string): Promise<Fetched<PlayerProfile>>
  }
  news: {
    list(): Promise<NewsItem[]>
  }
  game: {
    launch(req: LaunchRequest): Promise<void>
    kill(): Promise<void>
    state(): Promise<GameState>
    openPath(path: string): Promise<void>
  }
  system: {
    totalMemoryMb(): Promise<number>
    openDataFolder(): Promise<void>
    openExternal(url: string): Promise<void>
    version(): Promise<string>
  }
  remote: {
    get(): Promise<RemoteConfig>
  }
  update: {
    state(): Promise<UpdateState>
    install(): Promise<void>
  }
  on: {
    update(cb: (s: UpdateState) => void): () => void
    progress(cb: (p: InstallProgress | null) => void): () => void
    log(cb: (line: LogLine) => void): () => void
    state(cb: (s: GameState) => void): () => void
    exit(cb: (e: GameExit) => void): () => void
  }
}
