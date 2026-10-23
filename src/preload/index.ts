import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DLApi } from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

const api: DLApi = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch)
  },
  accounts: {
    list: () => invoke('accounts:list'),
    add: (name) => invoke('accounts:add', name),
    remove: (id) => invoke('accounts:remove', id),
    select: (id) => invoke('accounts:select', id),
    logout: () => invoke('accounts:logout')
  },
  versions: {
    list: () => invoke('versions:list'),
    loaders: (loader, gameVersion) => invoke('versions:loaders', loader, gameVersion)
  },
  instances: {
    list: () => invoke('instances:list'),
    create: (input) => invoke('instances:create', input),
    update: (id, patch) => invoke('instances:update', id, patch),
    duplicate: (id) => invoke('instances:duplicate', id),
    remove: (id) => invoke('instances:remove', id),
    openFolder: (id, sub) => invoke('instances:openFolder', id, sub),
    worlds: (id) => invoke('instances:worlds', id),
    screenshots: (id) => invoke('instances:screenshots', id),
    packMods: (id) => invoke('instances:packMods', id),
    setPackMod: (id, slug, enabled) => invoke('instances:setPackMod', id, slug, enabled),
    createServerInstance: () => invoke('instances:createServerInstance')
  },
  content: {
    list: (id, kind) => invoke('content:list', id, kind),
    toggle: (id, kind, file) => invoke('content:toggle', id, kind, file),
    remove: (id, kind, file) => invoke('content:remove', id, kind, file),
    update: (id, kind, files) => invoke('content:update', id, kind, files)
  },
  modrinth: {
    search: (q) => invoke('modrinth:search', q),
    project: (id) => invoke('modrinth:project', id),
    install: (instanceId, projectId) => invoke('modrinth:install', instanceId, projectId),
    installModpack: (projectId) => invoke('modrinth:installModpack', projectId)
  },
  skins: {
    list: () => invoke('skins:list'),
    importFile: () => invoke('skins:importFile'),
    importNick: (nick) => invoke('skins:importNick', nick),
    remove: (id) => invoke('skins:remove', id),
    select: (id) => invoke('skins:select', id),
    setModel: (id, model) => invoke('skins:setModel', id, model),
    rename: (id, name) => invoke('skins:rename', id, name),
    defaultSkin: () => invoke('skins:defaultSkin')
  },
  server: {
    status: (host, port) => invoke('server:status', host, port),
    profile: () => invoke('server:profile'),
    info: () => invoke('server:info'),
    capes: () => invoke('server:capes'),
    setCape: (choice) => invoke('server:setCape', choice)
  },
  news: {
    list: () => invoke('news:list')
  },
  game: {
    launch: (req) => invoke('game:launch', req),
    kill: () => invoke('game:kill'),
    state: () => invoke('game:state'),
    openPath: (path) => invoke('game:openPath', path)
  },
  system: {
    totalMemoryMb: () => invoke('system:totalMemoryMb'),
    openDataFolder: () => invoke('system:openDataFolder'),
    openExternal: (url) => invoke('system:openExternal', url),
    version: () => invoke('system:version')
  },
  remote: {
    get: () => invoke('remote:get')
  },
  update: {
    state: () => invoke('update:state'),
    install: () => invoke('update:install')
  },
  on: {
    update: (cb) => subscribe('update:state', cb),
    progress: (cb) => subscribe('install:progress', cb),
    log: (cb) => subscribe('game:log', cb),
    state: (cb) => subscribe('game:state', cb),
    exit: (cb) => subscribe('game:exit', cb)
  }
}

contextBridge.exposeInMainWorld('dl', api)
