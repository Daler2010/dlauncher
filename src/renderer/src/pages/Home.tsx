import { useEffect, useState } from 'react'
import type { NewsItem, ServerStatus } from '@shared/types'
import { formatPlayTime, LOADER_LABEL, timeAgo } from '../art'
import { Icon } from '../components/Icon'
import { Cover } from '../components/Shell'
import { Button } from '../components/ui'
import { useServerInfo } from '../config'
import { useApp } from '../store'

function useServer(host: string, port?: number): ServerStatus | null {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  useEffect(() => {
    let alive = true
    const tick = (): void => {
      void window.dl.server.status(host, port).then((s) => alive && setStatus(s))
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [host, port])
  return status
}

export function useNews(): NewsItem[] | null {
  const [news, setNews] = useState<NewsItem[] | null>(null)
  useEffect(() => {
    void window.dl.news.list().then(setNews).catch(() => setNews([]))
  }, [])
  return news
}

export function NewsCard({ item, lead }: { item: NewsItem; lead?: boolean }): React.JSX.Element {
  return (
    <article className={'news-card' + (lead ? ' news-lead' : '')} onClick={() => void window.dl.system.openExternal(item.url)}>
      <img src={item.image} alt="" loading="lazy" />
      <div className="body">
        <div className="label">
          {new Date(item.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} · {item.tag}
        </div>
        <div className="t">{item.title}</div>
        <div className="x">{item.text}</div>
      </div>
    </article>
  )
}

export function Home(): React.JSX.Element {
  const { instances, settings, game, play, openInstance, selectInstance, go, remote } = useApp()
  const SERVER = useServerInfo()
  const server = useServer(SERVER.host, SERVER.port)
  const news = useNews()
  const announcements = remote?.announcements ?? []

  const selected = instances.find((i) => i.id === settings?.selectedInstanceId) ?? instances[0]
  const serverInstance = selected?.version === SERVER.version ? selected : instances.find((i) => i.version === SERVER.version)
  const recent = [...instances].sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt)).slice(0, 4)
  const heroImage = news?.[0]?.image
  const busy = game.status !== 'idle'

  return (
    <div className="page flush">
      <section className="hero">
        <div className="hero-bg" style={{ backgroundImage: heroImage ? `url(${heroImage})` : undefined }} />
        {selected && (
          <div className="hero-content">
            <div className="label">выбранная сборка</div>
            <h1>{selected.name}</h1>
            <div className="facts">
              <span className="chip">{selected.version}</span>
              <span className="chip">
                {LOADER_LABEL[selected.loader]}
                {selected.loaderVersion ? ' ' + selected.loaderVersion : ''}
              </span>
              {selected.optimized && (
                <span className="chip lime">
                  <Icon name="zap" size={11} /> оптимизирована
                </span>
              )}
              <span className="chip">
                <Icon name="clock" size={11} /> {formatPlayTime(selected.playTimeMs)}
              </span>
            </div>
            <div className="actions">
              <Button variant="lime" className="play" disabled={busy} onClick={() => void play(selected.id)}>
                <Icon name="play" size={16} /> {busy ? 'ЗАПУСК…' : 'ИГРАТЬ'}
              </Button>
              <select
                className="select"
                style={{ width: 220, height: 54, borderRadius: 10 }}
                value={selected.id}
                disabled={busy}
                onChange={(e) => void selectInstance(e.target.value)}
              >
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.version}
                  </option>
                ))}
              </select>
              <Button variant="ghost" style={{ height: 54 }} onClick={() => openInstance(selected.id)}>
                Открыть <Icon name="chevron" size={15} />
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="home-body">
        <div>
          <div className="section-title">
            <h2>Сервер</h2>
            <span className="label">
              <span className={'live-dot' + (server?.online ? '' : ' off')} style={{ marginRight: 8 }} />
              {server ? (server.online ? 'онлайн' : 'офлайн') : 'проверка'}
            </span>
          </div>
          <div className="card server-card">
            {server?.favicon ? <img className="fav" src={server.favicon} alt="" /> : <div className="fav" />}
            <div style={{ minWidth: 0 }}>
              <div className="name">{SERVER.name}</div>
              <div className="motd">{server?.online ? server.motd?.split('\n')[0] || SERVER.motd : SERVER.motd}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>
                {SERVER.host}
              </div>
            </div>
            <Button
              variant="lime"
              disabled={busy || !serverInstance}
              title={serverInstance ? '' : `Нужна сборка на ${SERVER.version}`}
              onClick={() => serverInstance && void play(serverInstance.id, { host: SERVER.host, port: SERVER.port })}
            >
              <Icon name="play" size={13} /> Зайти
            </Button>
            <div className="stats">
              <div>
                <div className="big-num">
                  {server?.online ? server.players?.online : '—'}
                  <small>/{server?.players?.max ?? SERVER.slots}</small>
                </div>
                <div className="label">игроков</div>
              </div>
              <div>
                <div className="big-num">
                  {server?.ping ?? '—'}
                  <small> мс</small>
                </div>
                <div className="label">пинг</div>
              </div>
              <div>
                <div className="big-num" style={{ fontSize: 17, paddingTop: 4 }}>
                  {server?.version ?? SERVER.version}
                </div>
                <div className="label">версия</div>
              </div>
            </div>
            {server?.online && (server.players?.sample.length ?? 0) > 0 && (
              <div className="heads">
                {server.players!.sample.slice(0, 12).map((n) => (
                  <img key={n} src={`https://mc-heads.net/avatar/${n}/22`} title={n} alt={n} />
                ))}
              </div>
            )}
          </div>
          {announcements.length > 0 && (
            <div className="announcements">
              {announcements.slice(0, 3).map((a) => (
                <div
                  key={a.id}
                  className={'announcement' + (a.url ? ' link' : '')}
                  onClick={() => a.url && void window.dl.system.openExternal(a.url)}
                >
                  <div className="label">{new Date(a.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
                  <div className="t">{a.title}</div>
                  <div className="x">{a.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="section-title">
            <h2>Недавние сборки</h2>
            <Button variant="ghost" size="sm" onClick={() => go('library')}>
              Все
            </Button>
          </div>
          <div className="recent-list">
            {recent.map((inst) => (
              <div key={inst.id} className="recent" onClick={() => openInstance(inst.id)}>
                <Cover inst={inst} className="cover" />
                <div style={{ minWidth: 0 }}>
                  <div className="t">{inst.name}</div>
                  <div className="m">
                    {inst.version} · {LOADER_LABEL[inst.loader]} · {timeAgo(inst.lastPlayed)}
                  </div>
                </div>
                <Button
                  className="go"
                  variant="lime"
                  size="sm"
                  icon
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation()
                    void play(inst.id)
                  }}
                >
                  <Icon name="play" size={13} />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1', marginTop: 10 }}>
          <div className="section-title">
            <h2>Новости Minecraft</h2>
            <Button variant="ghost" size="sm" onClick={() => go('news')}>
              Все новости
            </Button>
          </div>
          <div className="news-row">
            {news === null
              ? [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 230 }} />)
              : news.slice(1, 4).map((n) => <NewsCard key={n.id} item={n} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
