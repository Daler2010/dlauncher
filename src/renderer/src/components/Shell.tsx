import { useEffect, useState } from 'react'
import type { Instance } from '@shared/types'
import { coverFor, headFromSkin } from '../art'
import { useActiveSkin, useApp, type Page } from '../store'
import { AccountModal } from './AccountModal'
import { Icon, Logo, type IconName } from './Icon'
import { Button, Progress } from './ui'

export function Cover({ inst, className }: { inst: Instance; className?: string }): React.JSX.Element {
  return (
    <img
      className={className}
      src={inst.iconUrl ?? coverFor(inst.id)}
      style={{ objectFit: 'cover', imageRendering: inst.iconUrl ? 'auto' : 'pixelated' }}
      alt=""
    />
  )
}

export function SkinHead({ size = 24, className }: { size?: number; className?: string }): React.JSX.Element {
  const { url } = useActiveSkin()
  const [head, setHead] = useState<string | null>(null)
  useEffect(() => {
    if (url) void headFromSkin(url).then(setHead).catch(() => setHead(null))
    else setHead(null)
  }, [url])
  return head ? <img className={className} src={head} width={size} height={size} alt="" /> : <div className={className} />
}

export function TopBar(): React.JSX.Element {
  const accounts = useApp((s) => s.accounts)
  const ready = useApp((s) => s.settings !== null)
  const version = useApp((s) => s.version)
  const update = useApp((s) => s.update)
  const [open, setOpen] = useState(false)
  const active = accounts.accounts.find((a) => a.id === accounts.activeId)
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        DLAUNCHER <small>{version}</small>
      </div>
      <span className="spacer" />
      {update.status === 'downloading' && (
        <span className="update-chip passive">
          <Icon name="download" size={13} /> Обновление {update.version} · {update.percent ?? 0}%
        </span>
      )}
      {update.status === 'ready' && (
        <button className="update-chip" onClick={() => void window.dl.update.install()} title="Лаунчер перезапустится">
          <Icon name="refresh" size={13} /> Обновить до {update.version}
        </button>
      )}
      <button className="account-chip" onClick={() => setOpen(true)} title="Аккаунты">
        <SkinHead className="head" />
        <span className="nick">{active?.name ?? 'Войти'}</span>
      </button>
      <div style={{ display: 'flex' }}>
        <button className="win-btn" title="Свернуть" onClick={() => window.dl.window.minimize()}>
          <Icon name="minus" size={15} />
        </button>
        <button className="win-btn" title="Развернуть" onClick={() => window.dl.window.maximize()}>
          <Icon name="square" size={13} />
        </button>
        <button className="win-btn close" title="Закрыть" onClick={() => window.dl.window.close()}>
          <Icon name="close" size={15} />
        </button>
      </div>
      {ready && (open || !active) && <AccountModal required={!active} onClose={() => setOpen(false)} />}
    </header>
  )
}

const nav: { page: Page; label: string; icon: IconName }[] = [
  { page: 'home', label: 'Главная', icon: 'home' },
  { page: 'library', label: 'Сборки', icon: 'library' },
  { page: 'discover', label: 'Каталог', icon: 'compass' },
  { page: 'skins', label: 'Скины', icon: 'shirt' },
  { page: 'news', label: 'Новости', icon: 'news' }
]

export function Rail(): React.JSX.Element {
  const { page, go } = useApp()
  const active = page === 'instance' ? 'library' : page
  const item = (n: { page: Page; label: string; icon: IconName }): React.JSX.Element => (
    <button key={n.page} className={'rail-btn' + (active === n.page ? ' active' : '')} onClick={() => go(n.page)}>
      <Icon name={n.icon} size={21} />
      {n.label}
    </button>
  )
  return (
    <nav className="rail">
      {nav.map(item)}
      <div className="grow" />
      {item({ page: 'console', label: 'Логи', icon: 'terminal' })}
      {item({ page: 'settings', label: 'Опции', icon: 'settings' })}
    </nav>
  )
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

/** Плашка текущей задачи: установка, запуск, игра */
export function TaskDock(): React.JSX.Element | null {
  const { progress, game, instances, go } = useApp()
  if (!progress && game.status === 'idle') return null
  const inst = instances.find((i) => i.id === (progress?.instanceId ?? game.instanceId))

  let stage = 'Запуск…'
  let meta = inst?.name ?? ''
  let value = 0
  let indeterminate = true
  if (progress) {
    stage = progress.stage
    if (progress.totalBytes > 0) {
      value = progress.bytes / progress.totalBytes
      indeterminate = false
      meta = `${mb(progress.bytes)} / ${mb(progress.totalBytes)} МБ`
    } else meta = 'проверка файлов'
  } else if (game.status === 'running') {
    stage = 'В игре'
    value = 1
    indeterminate = false
  }

  return (
    <div className="dock">
      <div style={{ minWidth: 0 }}>
        <div className="stage">
          {game.status === 'running' && !progress && <span className="live-dot" style={{ marginRight: 8 }} />}
          {stage}
        </div>
        <div className="meta">{meta}</div>
      </div>
      {game.status === 'running' && !progress ? (
        <Button size="sm" variant="danger" onClick={() => void window.dl.game.kill()}>
          <Icon name="stop" size={12} /> Закрыть
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => go('console')}>
          Лог
        </Button>
      )}
      <Progress value={value} indeterminate={indeterminate} />
    </div>
  )
}

export function Toast(): React.JSX.Element | null {
  const toast = useApp((s) => s.toast)
  if (!toast) return null
  return <div className={'toast ' + toast.kind}>{toast.text}</div>
}
