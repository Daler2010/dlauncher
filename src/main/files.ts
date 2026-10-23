import { net, protocol } from 'electron'
import { resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { dataDir } from './paths'

/**
 * dlfile://f/?p=<путь> — показ локальных картинок (скриншоты, иконки миров, скины) в окне.
 * Отдаём только файлы из папки лаунчера.
 */
export const SCHEME = 'dlfile'

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

export function handleScheme(): void {
  const root = resolve(dataDir) + sep
  protocol.handle(SCHEME, async (request) => {
    const path = resolve(new URL(request.url).searchParams.get('p') ?? '')
    if (!path.startsWith(root)) return new Response('Forbidden', { status: 403 })
    const file = await net.fetch(pathToFileURL(path).toString())
    // skinview3d и canvas грузят картинки с crossOrigin — нужен CORS-заголовок
    const headers = new Headers(file.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(file.body, { status: file.status, headers })
  })
}

/** Ссылка для <img>; v сбрасывает кэш, когда файл меняется */
export function fileUrl(path: string, v?: number): string {
  return `${SCHEME}://f/?p=${encodeURIComponent(path)}${v ? `&v=${v}` : ''}`
}
