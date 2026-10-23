import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ContentItem, ContentKind, Instance, Screenshot, ServerPackModView, WorldInfo } from '@shared/types'
import { formatPlayTime, LOADER_LABEL, timeAgo } from '../art'
import { Icon } from '../components/Icon'
import { Cover } from '../components/Shell'
import { Button, Field, Range, Segmented, Spinner, Switch, Tabs, Toggle } from '../components/ui'
import { cleanError, useApp } from '../store'

type Tab = 'pack' | 'content' | 'worlds' | 'screens' | 'settings'

export function InstancePage(): React.JSX.Element {
  const { instances, openInstanceId, go, play, game } = useApp()
  const inst = instances.find((i) => i.id === openInstanceId)
  const [tab, setTab] = useState<Tab>(inst?.serverPack ? 'pack' : 'content')

  if (!inst) {
    return (
      <div className="page">
        <div className="empty">
          <b>Сборка не найдена</b>
          <Button onClick={() => go('library')}>К сборкам</Button>
        </div>
      </div>
    )
  }
  const busy = game.status !== 'idle'
  const running = game.instanceId === inst.id && game.status === 'running'

  return (
    <div className="page flush">
      <section className="inst-hero">
        <Cover inst={inst} className="cover" />
        <div style={{ minWidth: 0 }}>
          <Button className="back" variant="ghost" size="sm" onClick={() => go('library')}>
            <Icon name="back" size={14} /> Сборки
          </Button>
          <h1>{inst.name}</h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="chip">{inst.version}</span>
            <span className="chip">
              {LOADER_LABEL[inst.loader]}
              {inst.loaderVersion ? ' ' + inst.loaderVersion : ''}
            </span>
            {inst.modpack && (
              <span className="chip">
                <Icon name="box" size={11} /> модпак
              </span>
            )}
            {inst.serverPack && (
              <span className="chip lime">
                <Icon name="server" size={11} /> сборка сервера
              </span>
            )}
            {inst.optimized && (
              <span className="chip lime">
                <Icon name="zap" size={11} /> оптимизирована
              </span>
            )}
            <span className="chip">
              <Icon name="clock" size={11} /> {formatPlayTime(inst.playTimeMs)}
            </span>
          </div>
        </div>
        <div className="actions">
          <Button variant="outline" icon title="Открыть папку" onClick={() => void window.dl.instances.openFolder(inst.id)}>
            <Icon name="folder" size={16} />
          </Button>
          {running ? (
            <Button className="play" variant="danger" onClick={() => void window.dl.game.kill()}>
              <Icon name="stop" size={14} /> ЗАКРЫТЬ
            </Button>
          ) : (
            <Button className="play" variant="lime" disabled={busy} onClick={() => void play(inst.id)}>
              <Icon name="play" size={16} /> {busy ? 'ЗАПУСК…' : 'ИГРАТЬ'}
            </Button>
          )}
        </div>
      </section>

      <div className="inst-body">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            ...(inst.serverPack ? [{ value: 'pack' as const, label: 'Сборка сервера' }] : []),
            { value: 'content', label: 'Контент' },
            { value: 'worlds', label: 'Миры' },
            { value: 'screens', label: 'Скриншоты' },
            { value: 'settings', label: 'Настройки' }
          ]}
        />
        {tab === 'pack' && <PackTab inst={inst} />}
        {tab === 'content' && <ContentTab inst={inst} />}
        {tab === 'worlds' && <WorldsTab inst={inst} />}
        {tab === 'screens' && <ScreensTab inst={inst} />}
        {tab === 'settings' && <SettingsTab inst={inst} />}
      </div>
    </div>
  )
}

/** Моды сборки сервера: обязательные и переключаемые */
function PackTab({ inst }: { inst: Instance }): React.JSX.Element {
  const { notify } = useApp()
  const [mods, setMods] = useState<ServerPackModView[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void window.dl.instances.packMods(inst.id).then(setMods)
  }, [inst.id])

  if (!mods) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 58 }} />
        ))}
      </div>
    )
  }
  if (mods.length === 0) {
    return (
      <div className="empty">
        <b>Сборка сервера сейчас не задана</b>
        Когда админ опубликует набор модов, лаунчер поставит их сам.
      </div>
    )
  }

  const toggle = async (slug: string, enabled: boolean): Promise<void> => {
    setBusy(slug)
    try {
      setMods(await window.dl.instances.setPackMod(inst.id, slug, enabled))
      notify(enabled ? 'Мод добавится при следующем запуске' : 'Мод уберётся при следующем запуске')
    } catch (e) {
      notify(cleanError(e), 'error')
    }
    setBusy(null)
  }

  const required = mods.filter((m) => !m.optional)
  const optional = mods.filter((m) => m.optional)
  const row = (m: ServerPackModView): React.JSX.Element => (
    <div key={m.slug} className={'content-row' + (m.enabled ? '' : ' off')}>
      {m.iconUrl ? <img className="icon" src={m.iconUrl} alt="" loading="lazy" /> : <div className="icon" />}
      <div style={{ minWidth: 0 }}>
        <div className="t">{m.title}</div>
        <div className="f" style={{ fontFamily: 'var(--ui)', fontSize: 12.5 }}>
          {m.description}
        </div>
      </div>
      <span />
      <div className="acts">
        {m.optional ? (
          <Toggle on={m.enabled} title={m.enabled ? 'Выключить' : 'Включить'} onChange={(v) => busy === null && void toggle(m.slug, v)} />
        ) : (
          <span className="chip">всегда</span>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ paddingBottom: 30 }}>
      <div className="note" style={{ marginTop: 0, marginBottom: 18 }}>
        <Icon name="server" size={16} />
        <div>
          Эту сборку собрали для сервера: лаунчер сам ставит и обновляет моды при каждом запуске, а если мод уберут из
          сборки — удалит его. Свои моды можно добавлять на вкладке «Контент», их лаунчер не трогает.
        </div>
      </div>
      <div className="section-title">
        <h2>В сборке</h2>
        <span className="label">{required.length} модов</span>
      </div>
      <div className="content-list" style={{ marginBottom: 22 }}>
        {required.map(row)}
      </div>
      {optional.length > 0 && (
        <>
          <div className="section-title">
            <h2>По желанию</h2>
            <span className="label">включаются переключателем</span>
          </div>
          <div className="content-list">{optional.map(row)}</div>
        </>
      )}
    </div>
  )
}

const KINDS: { value: ContentKind; label: string }[] = [
  { value: 'mods', label: 'Моды' },
  { value: 'resourcepacks', label: 'Ресурспаки' },
  { value: 'shaderpacks', label: 'Шейдеры' }
]
const KIND_TO_TYPE = { mods: 'mod', resourcepacks: 'resourcepack', shaderpacks: 'shader' } as const

function ContentTab({ inst }: { inst: Instance }): React.JSX.Element {
  const { openDiscover, notify } = useApp()
  const [kind, setKind] = useState<ContentKind>(inst.loader === 'vanilla' ? 'resourcepacks' : 'mods')
  const [items, setItems] = useState<ContentItem[] | null>(null)
  const [filter, setFilter] = useState('')
  const [updating, setUpdating] = useState(false)

  const load = useCallback(() => {
    setItems(null)
    void window.dl.content.list(inst.id, kind).then(setItems)
  }, [inst.id, kind])
  useEffect(load, [load])

  const shown = useMemo(
    () => items?.filter((i) => (i.title + i.file).toLowerCase().includes(filter.toLowerCase())) ?? [],
    [items, filter]
  )
  const updatable = items?.filter((i) => i.updateVersionId) ?? []

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn()
    } catch (e) {
      notify(cleanError(e), 'error')
    }
    void window.dl.content.list(inst.id, kind).then(setItems)
  }

  return (
    <div>
      <div className="content-toolbar">
        <Segmented value={kind} options={KINDS} onChange={setKind} />
        <div className="search">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Фильтр" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <span className="spacer" />
        {updatable.length > 0 && (
          <Button
            variant="outline"
            disabled={updating}
            onClick={async () => {
              setUpdating(true)
              await act(async () => {
                const n = await window.dl.content.update(inst.id, kind, updatable.map((i) => i.file))
                notify(`Обновлено: ${n}`)
              })
              setUpdating(false)
            }}
          >
            {updating ? <Spinner /> : <Icon name="refresh" size={15} />} Обновить ({updatable.length})
          </Button>
        )}
        <Button variant="ghost" icon title="Открыть папку" onClick={() => void window.dl.instances.openFolder(inst.id, kind)}>
          <Icon name="folder" size={16} />
        </Button>
        <Button variant="lime" onClick={() => openDiscover(KIND_TO_TYPE[kind], inst.id)}>
          <Icon name="plus" size={15} /> Добавить
        </Button>
      </div>

      {items === null ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 58 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <b>Пусто</b>
          {inst.loader === 'vanilla' && kind === 'mods'
            ? 'Это ванильная сборка — для модов создай сборку на Fabric, Forge или NeoForge.'
            : 'Найди что-нибудь в каталоге Modrinth — установка в один клик.'}
          <Button variant="lime" onClick={() => openDiscover(KIND_TO_TYPE[kind], inst.id)}>
            Открыть каталог
          </Button>
        </div>
      ) : (
        <div className="content-list">
          {shown.map((item) => (
            <div key={item.file} className={'content-row' + (item.enabled ? '' : ' off')}>
              {item.iconUrl ? <img className="icon" src={item.iconUrl} alt="" loading="lazy" /> : <div className="icon" />}
              <div style={{ minWidth: 0 }}>
                <div className="t">
                  {item.title}{' '}
                  {item.updateVersionId && (
                    <span className="chip lime" style={{ marginLeft: 6 }}>
                      обновление
                    </span>
                  )}
                </div>
                <div className="f">
                  {item.versionNumber ? item.versionNumber + ' · ' : ''}
                  {item.file}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>
                {(item.size / 1024 / 1024).toFixed(1)} МБ
              </span>
              <div className="acts">
                <Toggle on={item.enabled} title={item.enabled ? 'Выключить' : 'Включить'} onChange={() => void act(() => window.dl.content.toggle(inst.id, kind, item.file))} />
                <Button
                  variant="ghost"
                  size="sm"
                  icon
                  title="Удалить"
                  onClick={() => {
                    if (confirm(`Удалить «${item.title}»?`)) void act(() => window.dl.content.remove(inst.id, kind, item.file))
                  }}
                >
                  <Icon name="trash" size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorldsTab({ inst }: { inst: Instance }): React.JSX.Element {
  const [worlds, setWorlds] = useState<WorldInfo[] | null>(null)
  useEffect(() => {
    void window.dl.instances.worlds(inst.id).then(setWorlds)
  }, [inst.id])
  if (!worlds) return <Spinner />
  if (worlds.length === 0)
    return (
      <div className="empty">
        <b>Миров пока нет</b>
        Создай мир в игре — он появится здесь.
      </div>
    )
  return (
    <div className="worlds">
      {worlds.map((w) => (
        <div key={w.folder} className="world">
          {w.iconUrl ? <img src={w.iconUrl} alt="" /> : <div className="noicon" style={{ background: 'var(--panel-3)' }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>
              {w.gameMode ?? 'мир'} · {timeAgo(w.lastPlayed)}
            </div>
            <Button size="sm" variant="ghost" style={{ marginTop: 6, marginLeft: -10 }} onClick={() => void window.dl.instances.openFolder(inst.id, 'saves/' + w.folder)}>
              <Icon name="folder" size={14} /> Папка
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ScreensTab({ inst }: { inst: Instance }): React.JSX.Element {
  const [shots, setShots] = useState<Screenshot[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    void window.dl.instances.screenshots(inst.id).then(setShots)
  }, [inst.id])
  if (!shots) return <Spinner />
  if (shots.length === 0)
    return (
      <div className="empty">
        <b>Скриншотов нет</b>
        Нажми F2 в игре — снимок появится здесь.
      </div>
    )
  return (
    <>
      <div className="shots">
        {shots.map((s) => (
          <img key={s.file} src={s.url} alt={s.file} loading="lazy" onClick={() => setOpen(s.url)} />
        ))}
      </div>
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <img src={open} alt="" />
        </div>
      )}
    </>
  )
}

function SettingsTab({ inst }: { inst: Instance }): React.JSX.Element {
  const { reloadInstances, settings, go, notify, openInstance } = useApp()
  const [name, setName] = useState(inst.name)
  const [loaderVersions, setLoaderVersions] = useState<string[]>([])
  const globalMem = settings?.memoryMb ?? 4096

  useEffect(() => {
    if (inst.loader !== 'vanilla') void window.dl.versions.loaders(inst.loader, inst.version).then(setLoaderVersions).catch(() => {})
  }, [inst.loader, inst.version])

  const update = async (patch: Parameters<typeof window.dl.instances.update>[1]): Promise<void> => {
    await window.dl.instances.update(inst.id, patch)
    await reloadInstances()
  }

  return (
    <div className="form-grid" style={{ paddingBottom: 30 }}>
      <Field label="Название">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void update({ name })} />
      </Field>
      <Field label="Память для этой сборки" hint={inst.memoryMb ? 'Своё значение' : `Как в общих настройках (${(globalMem / 1024).toFixed(1)} ГБ)`}>
        <Range
          min={0}
          max={16384}
          step={512}
          value={inst.memoryMb ?? 0}
          display={inst.memoryMb ? `${(inst.memoryMb / 1024).toFixed(1)} ГБ` : 'общая'}
          onChange={(v) => void update({ memoryMb: v < 1024 ? 0 : v })}
        />
      </Field>
      {inst.loader !== 'vanilla' && (
        <>
          <Field label={`Версия ${LOADER_LABEL[inst.loader]}`}>
            <select className="select" value={inst.loaderVersion ?? ''} onChange={(e) => void update({ loaderVersion: e.target.value })}>
              {inst.loaderVersion && !loaderVersions.includes(inst.loaderVersion) && <option value={inst.loaderVersion}>{inst.loaderVersion}</option>}
              {loaderVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Switch
            checked={Boolean(inst.optimized)}
            label="Моды оптимизации"
            hint="Лаунчер сам ставит и обновляет Sodium, Lithium, FerriteCore, ModernFix и другие"
            onChange={(optimized) => void update({ optimized })}
          />
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <Button
          onClick={async () => {
            const copy = await window.dl.instances.duplicate(inst.id)
            await reloadInstances()
            notify('Копия создана')
            openInstance(copy.id)
          }}
        >
          <Icon name="copy" size={15} /> Сделать копию
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm(`Удалить «${inst.name}» вместе с мирами и модами? Это нельзя отменить.`)) return
            await window.dl.instances.remove(inst.id)
            await reloadInstances()
            go('library')
          }}
        >
          <Icon name="trash" size={15} /> Удалить сборку
        </Button>
      </div>
    </div>
  )
}
