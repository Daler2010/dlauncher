import { useEffect, useRef, useState } from 'react'
import * as skinview3d from 'skinview3d'
import type { CapeCatalog, Fetched, ServerInfo, TopEntry } from '@shared/types'
import { formatCount, headFromSkin, loadImage, timeAgo } from '../art'
import { Icon } from '../components/Icon'
import { Button, Spinner } from '../components/ui'
import { CAPE_RANKS, capeName, rankOf } from '../ranks'
import { useActiveSkin, useApp } from '../store'

/** Голова игрока по ссылке на скин (или Стив) */
function Head({ url, size = 28 }: { url: string | null; size?: number }): React.JSX.Element {
  const fallback = useApp((s) => s.defaultSkinUrl)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const skin = url ?? fallback
    if (skin) void headFromSkin(skin).then(setSrc).catch(() => setSrc(null))
  }, [url, fallback])
  return src ? (
    <img src={src} width={size} height={size} style={{ imageRendering: 'pixelated', borderRadius: 4 }} alt="" />
  ) : (
    <div style={{ width: size, height: size, borderRadius: 4, background: 'var(--panel-3)' }} />
  )
}

function minutesLabel(m: number): string {
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  return h < 100 ? `${h} ч ${m % 60} мин` : `${h} ч`
}

function Viewer({ capeUrl }: { capeUrl: string | null }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewer = useRef<skinview3d.SkinViewer | null>(null)
  const { url, slim } = useActiveSkin()

  useEffect(() => {
    const v = new skinview3d.SkinViewer({ canvas: canvas.current!, width: 320, height: 420, zoom: 0.72, fov: 38 })
    v.animation = new skinview3d.IdleAnimation()
    v.autoRotate = true
    v.autoRotateSpeed = 0.5
    v.globalLight.intensity = 2.6
    v.cameraLight.intensity = 0.7
    // Чуть со спины — чтобы был виден плащ
    v.playerObject.rotation.y = Math.PI * 0.8
    viewer.current = v
    return () => v.dispose()
  }, [])
  useEffect(() => {
    if (url) void viewer.current?.loadSkin(url, { model: slim ? 'slim' : 'default' })
  }, [url, slim])
  useEffect(() => {
    const v = viewer.current
    if (!v) return
    if (capeUrl) void v.loadCape(capeUrl).catch(() => v.loadCape(null))
    else v.loadCape(null)
  }, [capeUrl])
  return <canvas ref={canvas} />
}

/** Плоское превью плаща: внешняя сторона 10×16 из текстуры 64×32 */
function CapeThumb({ url }: { url: string }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    void loadImage(url).then((img) => {
      const ctx = ref.current?.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, 10, 16)
      // Текстура может быть крупнее 64×32 (HD) — берём пропорционально
      const k = img.width / 64
      ctx.drawImage(img, 1 * k, 1 * k, 10 * k, 16 * k, 0, 0, 10, 16)
    })
  }, [url])
  return <canvas ref={ref} width={10} height={16} className="cape-thumb" />
}

function CapeWardrobe(props: { group: string; choice: string; capeAvailable: boolean; busy: boolean; onPick(c: string): void }): React.JSX.Element | null {
  const [catalog, setCatalog] = useState<CapeCatalog | null>(null)
  useEffect(() => {
    void window.dl.server.capes().then((r) => r.ok && setCatalog(r.data))
  }, [])
  if (!catalog) return null
  const own = catalog.rank.find((c) => c.id === props.group.toLowerCase())
  const locked = catalog.rank.filter((c) => c.id !== own?.id && CAPE_RANKS.includes(c.id))
  const tile = (id: string, label: string, sub: string, url: string | null, opts: { locked?: boolean } = {}): React.JSX.Element => (
    <button
      key={id}
      className={'cape-tile' + (props.choice === id ? ' on' : '') + (opts.locked ? ' locked' : '')}
      disabled={props.busy || opts.locked}
      onClick={() => props.onPick(id)}
      title={opts.locked ? `Плащ выдаётся за ранг ${label}` : label}
    >
      {url ? <CapeThumb url={url} /> : <div className="cape-thumb empty"><Icon name="close" size={16} /></div>}
      <span className="n">{label}</span>
      <span className="s">{sub}</span>
    </button>
  )
  return (
    <>
      <div className="section-title" style={{ marginTop: 6 }}>
        <h2>Гардероб плащей</h2>
        <span className="label">видят все игроки DLauncher · на элитрах тоже</span>
      </div>
      <div className="cape-grid">
        {tile('off', 'Без плаща', 'скрыть', null)}
        {own && tile('rank', `Ранг ${rankOf(own.id).label}`, 'твой ранг', own.url)}
        {catalog.free.map((c) => tile(c.id, capeName(c.id), 'для всех', c.url))}
        {locked.map((c) => tile('locked-' + c.id, rankOf(c.id).label, 'за ранг', c.url, { locked: true }))}
      </div>
    </>
  )
}

function TopList({ title, rows, format }: { title: string; rows: TopEntry[]; format(v: number): string }): React.JSX.Element {
  return (
    <div className="card card-pad top-card">
      <div className="label" style={{ marginBottom: 12 }}>
        {title}
      </div>
      {rows.length === 0 && <div style={{ color: 'var(--faint)' }}>пока пусто</div>}
      {rows.map((r, i) => (
        <div key={r.name} className="top-row">
          <span className="place">{i + 1}</span>
          <Head url={r.skinUrl} size={24} />
          <span className="n">{r.name}</span>
          <span className="v">{format(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Profile(): React.JSX.Element {
  const { profile, loadProfile, accounts, notify } = useApp()
  const nick = accounts.accounts.find((a) => a.id === accounts.activeId)?.name ?? ''
  const [server, setServer] = useState<Fetched<ServerInfo> | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadProfile()
    void window.dl.server.info().then(setServer)
  }, [loadProfile])

  if (profile === null) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center' }}>
        <Spinner />
      </div>
    )
  }
  if (!profile.ok) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="label">профиль игрока</div>
            <h1 style={{ marginTop: 8 }}>{nick}</h1>
          </div>
        </div>
        <div className="empty">
          <b>{profile.notConfigured ? 'Профиль скоро появится' : 'Сервер не отвечает'}</b>
          {profile.notConfigured
            ? 'Ранг, баланс, клан, статистика и плащ подтянутся с сервера, когда его подключат к DLauncher.'
            : 'Профиль берётся прямо с сервера Анархии — похоже, сейчас он выключен.'}
          <Button onClick={() => void loadProfile()}>
            <Icon name="refresh" size={15} /> Обновить
          </Button>
        </div>
      </div>
    )
  }

  const p = profile.data
  const rank = rankOf(p.group)
  const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : String(p.kills)

  const pickCape = async (choice: string): Promise<void> => {
    setBusy(true)
    const res = await window.dl.server.setCape(choice)
    if (res.ok) useApp.setState({ profile: res })
    else notify(res.error, 'error')
    setBusy(false)
  }

  return (
    <div className="profile">
      <section className="stage">
        <div className="stage-head">
          <div className="label">профиль игрока</div>
          <h1>{p.name}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <span className="rank-chip" style={{ color: rank.color, borderColor: rank.color + '55', background: rank.color + '18' }}>
              {rank.label}
            </span>
            {p.clan && <span className="chip">[{p.clan.tag}] {p.clan.name}</span>}
            <span className="chip">
              <span className={'live-dot' + (p.online ? '' : ' off')} style={{ width: 6, height: 6 }} />
              {p.online ? 'в игре' : p.known ? 'был ' + timeAgo(p.lastSeen) : 'ещё не заходил'}
            </span>
          </div>
        </div>
        <Viewer capeUrl={p.capeUrl} />
        <div className="stage-foot">
          <div className="label" style={{ textAlign: 'center' }}>
            {p.capeChoice === 'off'
              ? 'без плаща'
              : p.capeChoice === 'rank'
                ? p.capeAvailable
                  ? `плащ ранга ${rank.label}`
                  : 'плащ не выбран'
                : `плащ «${capeName(p.capeChoice)}»`}
          </div>
        </div>
      </section>

      <section className="profile-body">
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="big-num">{p.balance === null ? '—' : '$' + formatCount(Math.round(p.balance))}</div>
            <div className="label">баланс</div>
          </div>
          <div className="stat-tile">
            <div className="big-num">{p.kills}</div>
            <div className="label">убийств</div>
          </div>
          <div className="stat-tile">
            <div className="big-num">{p.deaths}</div>
            <div className="label">смертей</div>
          </div>
          <div className="stat-tile">
            <div className="big-num">{kd}</div>
            <div className="label">K/D</div>
          </div>
          <div className="stat-tile">
            <div className="big-num">{minutesLabel(p.playMinutes)}</div>
            <div className="label">на сервере</div>
          </div>
          <div className="stat-tile">
            <div className="big-num">{formatCount(p.mobKills)}</div>
            <div className="label">мобов убито</div>
          </div>
        </div>
        {p.known && (
          <div className="mono" style={{ color: 'var(--faint)', fontSize: 12, margin: '10px 0 26px' }}>
            впервые зашёл {new Date(p.firstPlayed).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        )}

        <CapeWardrobe group={p.group} choice={p.capeChoice} capeAvailable={p.capeAvailable} busy={busy} onPick={(c) => void pickCape(c)} />

        <div className="section-title" style={{ marginTop: 26 }}>
          <h2>Сейчас на сервере</h2>
          <span className="label">{server?.ok ? `${server.data.online.length} / ${server.data.max}` : ''}</span>
        </div>
        {!server ? (
          <div className="skeleton" style={{ height: 60 }} />
        ) : !server.ok ? (
          <div className="empty" style={{ padding: 24 }}>
            {server.error}
          </div>
        ) : server.data.online.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>
            Никого нет — самое время зайти первым
          </div>
        ) : (
          <div className="online-list">
            {server.data.online.map((o) => {
              const r = rankOf(o.group)
              return (
                <div key={o.name} className="online-chip">
                  <Head url={o.skinUrl} size={22} />
                  {o.name}
                  {o.group !== 'default' && <span style={{ color: r.color, fontSize: 11, fontWeight: 600 }}>{r.label}</span>}
                </div>
              )
            })}
          </div>
        )}

        {server?.ok && (
          <>
            <div className="section-title" style={{ marginTop: 26 }}>
              <h2>Топы сервера</h2>
            </div>
            <div className="tops">
              <TopList title="богачи" rows={server.data.tops.balance} format={(v) => '$' + formatCount(v)} />
              <TopList title="убийцы" rows={server.data.tops.kills} format={(v) => String(v)} />
              <TopList title="наиграли больше всех" rows={server.data.tops.playtime} format={minutesLabel} />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
