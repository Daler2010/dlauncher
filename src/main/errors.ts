/** xmcl кидает AggregateError и объекты без message — собираем из них понятный текст */
export function describeError(e: unknown, depth = 0): string {
  if (depth > 3) return ''
  if (e instanceof AggregateError) {
    const inner = e.errors.slice(0, 3).map((x) => describeError(x, depth + 1))
    const more = e.errors.length > 3 ? ` (и ещё ${e.errors.length - 3})` : ''
    return (e.message ? e.message + ': ' : '') + inner.join('; ') + more
  }
  if (e instanceof Error) {
    const parts = [e.message || e.name]
    const extra = e as Error & { url?: string; code?: string; cause?: unknown; error?: unknown }
    if (extra.code) parts.push(`[${extra.code}]`)
    if (extra.url) parts.push(extra.url)
    if (extra.cause) parts.push('← ' + describeError(extra.cause, depth + 1))
    else if (extra.error) parts.push('← ' + describeError(extra.error, depth + 1))
    return parts.filter(Boolean).join(' ')
  }
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message) return obj.message
    try {
      return JSON.stringify(e).slice(0, 500)
    } catch {
      return String(e)
    }
  }
  return String(e)
}
