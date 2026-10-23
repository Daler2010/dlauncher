import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { mkdirSync } from 'fs'
import { totalmem } from 'os'
import { join } from 'path'
import type {
  ContentKind,
  InstancePatch,
  LaunchRequest,
  LoaderType,
  NewInstance,
  SearchQuery,
  Settings,
  SkinModel
} from '@shared/types'
import { accountState, addAccount, logout, removeAccount, selectAccount } from './account'
import { handleScheme, registerSchemePrivileges } from './files'
import { listContent, listScreenshots, listWorlds, removeContent, toggleContent, updateContent } from './game/content'
import {
  createInstance,
  duplicateInstance,
  ensureDefaultInstance,
  getInstance,
  listInstances,
  openInstanceFolder,
  removeInstance,
  updateInstance
} from './game/instances'
import { loaderVersions } from './game/install'
import { gameState, killGame, launchGame, type GameEvents } from './game/launch'
import { getProject, installProject, searchProjects } from './game/modrinth'
import { installModpack } from './game/modpack'
import { createServerInstance, packMods, setPackMod } from './game/serverpack'
import { listVersions } from './game/versions'
import { listNews } from './news'
import { dataDir, instanceDir } from './paths'
import { getCapes, getProfile, getServerInfo, setCape } from './profile'
import { getRemote } from './remote'
import { pingServer } from './server-ping'
import { initUpdater, installUpdate, updateState } from './updater'
import {
  defaultSkin,
  importSkinByNick,
  importSkinFile,
  removeSkin,
  selectSkin,
  skinState,
  updateSkin
} from './skins'
import { save, store } from './store'

let win: BrowserWindow | null = null

registerSchemePrivileges()

function createWindow(): void {
  win = new BrowserWindow({
    width: 1240,
    height: 760,
    minWidth: 1040,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#0a0b0d',
    title: 'DLauncher',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

const send = (channel: string, payload: unknown): void => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

const gameEvents: GameEvents = {
  progress: (p) => send('install:progress', p),
  log: (line) => send('game:log', line),
  state: (s) => {
    send('game:state', s)
    if (!win || !store.settings.hideOnLaunch) return
    if (s.status === 'running') win.hide()
    if (s.status === 'idle' && !win.isVisible()) win.show()
  },
  exit: (e) => {
    send('game:exit', e)
    if (e.crashed && win) {
      win.show()
      win.focus()
    }
  }
}

function registerIpc(): void {
  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('window:close', () => win?.close())

  ipcMain.handle('settings:get', () => store.settings)
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    Object.assign(store.settings, patch)
    save()
    return store.settings
  })

  ipcMain.handle('accounts:list', () => accountState())
  ipcMain.handle('accounts:add', (_e, name: string) => addAccount(name))
  ipcMain.handle('accounts:remove', (_e, id: string) => removeAccount(id))
  ipcMain.handle('accounts:select', (_e, id: string) => selectAccount(id))
  ipcMain.handle('accounts:logout', () => logout())

  ipcMain.handle('versions:list', () => listVersions())
  ipcMain.handle('versions:loaders', (_e, loader: LoaderType, gameVersion: string) => loaderVersions(loader, gameVersion))

  ipcMain.handle('instances:list', () => listInstances())
  ipcMain.handle('instances:create', (_e, input: NewInstance) => createInstance(input))
  ipcMain.handle('instances:update', (_e, id: string, patch: InstancePatch) => updateInstance(id, patch))
  ipcMain.handle('instances:duplicate', (_e, id: string) => duplicateInstance(id))
  ipcMain.handle('instances:remove', (_e, id: string) => removeInstance(id))
  ipcMain.handle('instances:openFolder', (_e, id: string, sub?: string) => openInstanceFolder(id, sub))
  ipcMain.handle('instances:worlds', (_e, id: string) => listWorlds(id))
  ipcMain.handle('instances:screenshots', (_e, id: string) => listScreenshots(id))
  ipcMain.handle('instances:packMods', (_e, id: string) => packMods(id))
  ipcMain.handle('instances:setPackMod', (_e, id: string, slug: string, enabled: boolean) => setPackMod(id, slug, enabled))
  ipcMain.handle('instances:createServerInstance', () => createServerInstance())

  ipcMain.handle('content:list', (_e, id: string, kind: ContentKind) => listContent(id, kind))
  ipcMain.handle('content:toggle', (_e, id: string, kind: ContentKind, file: string) => toggleContent(id, kind, file))
  ipcMain.handle('content:remove', (_e, id: string, kind: ContentKind, file: string) => removeContent(id, kind, file))
  ipcMain.handle('content:update', (_e, id: string, kind: ContentKind, files: string[]) => updateContent(id, kind, files))

  ipcMain.handle('modrinth:search', (_e, q: SearchQuery) => searchProjects(q))
  ipcMain.handle('modrinth:project', (_e, idOrSlug: string) => getProject(idOrSlug))
  ipcMain.handle('modrinth:install', (_e, instanceId: string, projectId: string) => {
    const inst = getInstance(instanceId)
    return installProject({ gameDir: instanceDir(inst.id), gameVersion: inst.version, loader: inst.loader }, projectId)
  })
  ipcMain.handle('modrinth:installModpack', (_e, projectId: string) => installModpack(projectId, gameEvents.progress))

  ipcMain.handle('skins:list', () => skinState())
  ipcMain.handle('skins:importFile', () => importSkinFile(win))
  ipcMain.handle('skins:importNick', (_e, nick: string) => importSkinByNick(nick))
  ipcMain.handle('skins:remove', (_e, id: string) => removeSkin(id))
  ipcMain.handle('skins:select', (_e, id: string | null) => selectSkin(id))
  ipcMain.handle('skins:setModel', (_e, id: string, model: SkinModel) => updateSkin(id, { model }))
  ipcMain.handle('skins:rename', (_e, id: string, name: string) => updateSkin(id, { name }))
  ipcMain.handle('skins:defaultSkin', () => defaultSkin())

  ipcMain.handle('server:status', (_e, host: string, port?: number) => pingServer(host, port))
  ipcMain.handle('server:profile', () => getProfile())
  ipcMain.handle('server:info', () => getServerInfo())
  ipcMain.handle('server:capes', () => getCapes())
  ipcMain.handle('server:setCape', (_e, choice: string) => setCape(choice))
  ipcMain.handle('news:list', () => listNews())

  ipcMain.handle('game:launch', (_e, req: LaunchRequest) => launchGame(req, gameEvents))
  ipcMain.handle('game:kill', () => killGame())
  ipcMain.handle('game:state', () => gameState())
  ipcMain.handle('game:openPath', (_e, path: string) => shell.openPath(path))

  ipcMain.handle('system:totalMemoryMb', () => Math.floor(totalmem() / 1024 / 1024))
  ipcMain.handle('system:openDataFolder', () => shell.openPath(dataDir))
  ipcMain.handle('system:openExternal', (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('system:version', () => app.getVersion())

  ipcMain.handle('remote:get', () => getRemote())
  ipcMain.handle('update:state', () => updateState())
  ipcMain.handle('update:install', () => installUpdate())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.daler.dlauncher')
    mkdirSync(dataDir, { recursive: true })
    handleScheme()
    ensureDefaultInstance()
    registerIpc()
    createWindow()
    initUpdater((s) => send('update:state', s))
  })

  app.on('window-all-closed', () => app.quit())
}
