import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'

let state: UpdateState = { status: 'idle' }

export const updateState = (): UpdateState => state

/**
 * Автообновление из GitHub Releases: проверяем при старте и раз в 2 часа,
 * качаем в фоне, ставим при выходе или по кнопке в лаунчере.
 */
export function initUpdater(send: (s: UpdateState) => void): void {
  if (!app.isPackaged) return
  const set = (next: UpdateState): void => {
    state = next
    send(state)
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => set({ status: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ ...state, status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (e) => set({ status: 'error', error: e?.message ?? String(e) }))

  const check = (): void => void autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, 2 * 60 * 60 * 1000)
}

export function installUpdate(): void {
  if (state.status === 'ready') autoUpdater.quitAndInstall()
}
