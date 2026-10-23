import { createHash } from 'crypto'
import type { Account, AccountState } from '@shared/types'
import { save, store } from './store'

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/

/** UUID v3 от "OfflinePlayer:<ник>" — так же его считает сервер в offline-mode */
export function offlineUuid(name: string): string {
  const hash = createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  return hash.toString('hex')
}

export function accountState(): AccountState {
  return { accounts: store.accounts, activeId: store.activeAccountId }
}

export function addAccount(name: string): AccountState {
  const trimmed = name.trim()
  if (!NAME_RE.test(trimmed)) {
    throw new Error('Ник должен быть 3–16 символов: латиница, цифры и _')
  }
  const id = offlineUuid(trimmed)
  if (!store.accounts.some((a) => a.id === id)) {
    const account: Account = { id, name: trimmed, type: 'offline', createdAt: Date.now() }
    store.accounts.push(account)
  }
  store.activeAccountId = id
  save()
  return accountState()
}

export function removeAccount(id: string): AccountState {
  store.accounts = store.accounts.filter((a) => a.id !== id)
  if (store.activeAccountId === id) store.activeAccountId = store.accounts[0]?.id ?? null
  save()
  return accountState()
}

export function selectAccount(id: string): AccountState {
  if (store.accounts.some((a) => a.id === id)) {
    store.activeAccountId = id
    save()
  }
  return accountState()
}

/** Выход: аккаунт остаётся в списке, но не выбран — лаунчер снова спросит ник */
export function logout(): AccountState {
  store.activeAccountId = null
  save()
  return accountState()
}

export function activeAccount(): Account | undefined {
  return store.accounts.find((a) => a.id === store.activeAccountId)
}
