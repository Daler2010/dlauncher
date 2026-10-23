import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { ResolvedVersion } from '@xmcl/core'
import {
  DEFAULT_RUNTIME_ALL_URL,
  installJavaRuntimeTask,
  type JavaRuntimeManifest,
  type JavaRuntimes,
  type JavaRuntimeTarget
} from '@xmcl/installer'
import { runtimeDir } from '../paths'
import { store } from '../store'
import type { InstallRunner } from './progress'

/** Для старых версий без javaVersion в version.json Mojang использует jre-legacy (Java 8) */
function componentFor(version: ResolvedVersion): string {
  return version.javaVersion?.component || 'jre-legacy'
}

function platformKey(): keyof JavaRuntimes {
  if (process.arch === 'arm64') return 'windows-arm64'
  if (process.arch === 'ia32') return 'windows-x86'
  return 'windows-x64'
}

export function javaExecutable(component: string): string {
  return join(runtimeDir, component, 'bin', 'java.exe')
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Не удалось получить ${url} (${res.status})`)
  return (await res.json()) as T
}

/**
 * fetchJavaRuntimeManifest из xmcl 6.1.2 передаёт в undici 7 опцию throwOnError,
 * которой там больше нет, и падает. Поэтому манифест получаем сами.
 */
async function fetchManifest(component: string): Promise<JavaRuntimeManifest> {
  const index = await getJson<JavaRuntimes>(DEFAULT_RUNTIME_ALL_URL)
  const target: JavaRuntimeTarget | undefined = index[platformKey()]?.[component]?.[0]
  if (!target) throw new Error(`Mojang не даёт Java «${component}» для этой системы`)
  const { files } = await getJson<Pick<JavaRuntimeManifest, 'files'>>(target.manifest.url)
  return { target: component, files, version: target.version }
}

/** Возвращает путь к java.exe: из настроек или из рантайма Mojang (скачивает при необходимости) */
export async function ensureJava(version: ResolvedVersion, runner: InstallRunner): Promise<string> {
  if (store.settings.javaPath.trim()) return store.settings.javaPath.trim()

  const component = componentFor(version)
  const destination = join(runtimeDir, component)
  const marker = join(destination, '.dlauncher-installed')
  const exe = javaExecutable(component)
  if (existsSync(marker) && existsSync(exe)) return exe

  const manifest = await fetchManifest(component)
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await runner.run(
        `Java ${manifest.version.name}` + (attempt > 1 ? ` (попытка ${attempt})` : ''),
        installJavaRuntimeTask({ manifest, destination }),
        attempt > 1
      )
      lastError = undefined
      break
    } catch (e) {
      lastError = e
    }
  }
  if (lastError) throw lastError
  if (!existsSync(exe)) throw new Error('Java скачалась, но java.exe не найден')
  await writeFile(marker, manifest.version.name)
  return exe
}
