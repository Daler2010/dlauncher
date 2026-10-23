import { app } from 'electron'
import { join } from 'path'

/** %APPDATA%\.dlauncher — общие versions/libraries/assets/runtime и папки сборок */
export const dataDir = join(app.getPath('appData'), '.dlauncher')
export const runtimeDir = join(dataDir, 'runtime')
export const instancesDir = join(dataDir, 'instances')
export const logsDir = join(dataDir, 'logs')
export const storeFile = join(dataDir, 'launcher.json')

export const instanceDir = (id: string): string => join(instancesDir, id)
