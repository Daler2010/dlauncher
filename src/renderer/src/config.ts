import type { RemoteConfig } from '@shared/types'
import { useApp } from './store'

/** Пока удалённый конфиг не пришёл — встроенные значения */
const FALLBACK: RemoteConfig['server'] = {
  name: 'Анархия',
  motd: 'Выживание без правил: кланы, дуэли, аирдропы, кейсы.',
  host: 'practically-edges.tun.ply.gg',
  version: '1.21.1',
  slots: 30
}

export function useServerInfo(): RemoteConfig['server'] {
  return useApp((s) => s.remote?.server) ?? FALLBACK
}
