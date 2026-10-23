import { useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { ProjectDetails, ProjectHit, ProjectType, SearchResult, SearchSort } from '@shared/types'
import { formatCount, LOADER_LABEL, timeAgo } from '../art'
import { Icon } from '../components/Icon'
import { Button, Segmented, Sheet, Spinner } from '../components/ui'
import { cleanError, useApp } from '../store'

const TYPES: { value: ProjectType; label: string }[] = [
  { value: 'mod', label: 'Моды' },
  { value: 'modpack', label: 'Модпаки' },
  { value: 'resourcepack', label: 'Ресурспаки' },
  { value: 'shader', label: 'Шейдеры' }
]

const SORTS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'По смыслу' },
  { value: 'downloads', label: 'Популярные' },
  { value: 'follows', label: 'Любимые' },
  { value: 'updated', label: 'Обновлённые' },
  { value: 'newest', label: 'Новые' }
]

/** Состояние кнопки «Установить» общее для списка и шторки */
type InstallState = Record<string, 'busy' | 'done'>

function useInstall(targetId: string | undefined): [InstallState, (p: { id: string; title: string; type: ProjectType }) => Promise<void>] {
  const { notify, reloadInstances, openInstance } = useApp()
  const [state, setState] = useState<InstallState>({})
  useEffect(() => setState({}), [targetId])

  const install = async (p: { id: string; title: string; type: ProjectType }): Promise<void> => {
    setState((s) => ({ ...s, [p.id]: 'busy' }))
    try {
      if (p.type === 'modpack') {
        const inst = await window.dl.modrinth.installModpack(p.id)
        await reloadInstances()
        notify(`Модпак «${inst.name}» готов — сборка создана`)
        openInstance(inst.id)
      } else {
        if (!targetId) throw new Error('Выбери сборку, куда ставить')
        const title = await window.dl.modrinth.install(targetId, p.id)
        notify(`«${title}» установлен`)
      }
      setState((s) => ({ ...s, [p.id]: 'done' }))
    } catch (e) {
      notify(cleanError(e), 'error')
      setState((s) => {
        const next = { ...s }
        delete next[p.id]
        return next
      })
    }
  }
  return [state, install]
}

function InstallButton({ hit, state, onInstall, big }: { hit: { id: string; title: string; type: ProjectType }; state?: 'busy' | 'done'; onInstall(): void; big?: boolean }): React.JSX.Element {
  if (state === 'done')
    return (
      <Button variant="done" size={big ? 'md' : 'sm'}>
        <Icon name="check" size={14} /> {hit.type === 'modpack' ? 'Создана' : 'Установлен'}
      </Button>
    )
  return (
    <Button
      variant="lime"
      size={big ? 'md' : 'sm'}
      disabled={state === 'busy'}
      onClick={(e) => {
        e.stopPropagation()
        onInstall()
      }}
    >
      {state === 'busy' ? <Spinner /> : <Icon name="download" size={14} />}
      {hit.type === 'modpack' ? 'Создать сборку' : 'Установить'}
    </Button>
  )
}

export function Discover(): React.JSX.Element {
  const { instances, settings, discoverPreset } = useApp()
  const [type, setType] = useState<ProjectType>(discoverPreset?.type ?? 'mod')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState<SearchSort>('downloads')
  const [offset, setOffset] = useState(0)
  const [targetId, setTargetId] = useState(discoverPreset?.instanceId ?? settings?.selectedInstanceId ?? instances[0]?.id)
  const [onlyTarget, setOnlyTarget] = useState(true)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const target = instances.find((i) => i.id === targetId)
  const [installState, install] = useInstall(targetId)
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  // Что уже стоит в выбранной сборке — показываем «Установлен» вместо кнопки
  useEffect(() => {
    setInstalled(new Set())
    if (!targetId || type === 'modpack') return
    const kind = type === 'mod' ? 'mods' : type === 'resourcepack' ? 'resourcepacks' : 'shaderpacks'
    let alive = true
    void window.dl.content.list(targetId, kind).then((items) => {
      if (alive) setInstalled(new Set(items.map((i) => i.projectId).filter((id): id is string => Boolean(id))))
    })
    return () => {
      alive = false
    }
  }, [targetId, type])
  const stateOf = (id: string): 'busy' | 'done' | undefined => installState[id] ?? (installed.has(id) ? 'done' : undefined)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])
  useEffect(() => setOffset(0), [type, debounced, sort, targetId, onlyTarget])

  useEffect(() => {
    let alive = true
    setResult(null)
    setError('')
    const filter = onlyTarget && target && type !== 'modpack'
    window.dl.modrinth
      .search({
        query: debounced,
        type,
        sort: debounced ? sort : sort === 'relevance' ? 'downloads' : sort,
        offset,
        gameVersion: filter ? target.version : undefined,
        loader: filter ? target.loader : undefined
      })
      .then((r) => alive && setResult(r))
      .catch((e) => alive && setError(cleanError(e)))
    return () => {
      alive = false
    }
  }, [type, debounced, sort, offset, target, onlyTarget])

  const pages = result ? Math.ceil(result.total / 20) : 0

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="label">modrinth.com · {result ? formatCount(result.total) + ' проектов' : '…'}</div>
          <h1 style={{ marginTop: 8 }}>Каталог</h1>
        </div>
        <span className="spacer" />
        <Segmented value={type} options={TYPES} onChange={setType} />
      </div>

      <div className="discover-controls">
        <div className="search">
          <Icon name="search" size={17} />
          <input
            className="input"
            placeholder={`Искать ${TYPES.find((t) => t.value === type)!.label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="select" style={{ height: 42, width: 170 }} value={sort} onChange={(e) => setSort(e.target.value as SearchSort)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {type !== 'modpack' && (
        <div className="discover-bar">
          <div className="target">
            Ставить в
            <select className="select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.version} {LOADER_LABEL[i.loader]}
                </option>
              ))}
            </select>
          </div>
          <label className="target" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyTarget} onChange={(e) => setOnlyTarget(e.target.checked)} style={{ accentColor: 'var(--lime)' }} />
            только совместимые
          </label>
          {target?.loader === 'vanilla' && type === 'mod' && (
            <span className="chip amber">в ванильную сборку моды не ставятся</span>
          )}
        </div>
      )}

      {error && <div className="empty">{error}</div>}
      {!result && !error && (
        <div style={{ display: 'grid', gap: 10 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 92 }} />
          ))}
        </div>
      )}
      {result && result.hits.length === 0 && (
        <div className="empty">
          <b>Ничего не нашлось</b>
          Попробуй другой запрос или сними фильтр совместимости.
        </div>
      )}
      {result && (
        <div className="results">
          {result.hits.map((hit) => (
            <ResultRow key={hit.id} hit={hit} state={stateOf(hit.id)} onInstall={() => void install(hit)} onOpen={() => setOpenId(hit.id)} />
          ))}
        </div>
      )}
      {result && pages > 1 && (
        <div className="pager">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>
            <Icon name="back" size={14} />
          </Button>
          {offset / 20 + 1} / {pages}
          <Button size="sm" variant="outline" disabled={offset + 20 >= result.total} onClick={() => setOffset(offset + 20)}>
            <Icon name="chevron" size={14} />
          </Button>
        </div>
      )}

      {openId && (
        <ProjectSheet id={openId} state={stateOf(openId)} onInstall={install} onClose={() => setOpenId(null)} targetName={type === 'modpack' ? undefined : target?.name} />
      )}
    </div>
  )
}

function ResultRow({ hit, state, onInstall, onOpen }: { hit: ProjectHit; state?: 'busy' | 'done'; onInstall(): void; onOpen(): void }): React.JSX.Element {
  return (
    <div className="result" onClick={onOpen}>
      {hit.iconUrl ? <img className="icon" src={hit.iconUrl} alt="" loading="lazy" /> : <div className="icon" />}
      <div style={{ minWidth: 0 }}>
        <div className="title">
          <b>{hit.title}</b>
          <span>от {hit.author}</span>
        </div>
        <div className="desc">{hit.description}</div>
        <div className="tags">
          {hit.categories.slice(0, 4).map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="side">
        <div className="nums">
          <span title="Скачиваний">
            <Icon name="download" size={13} /> {formatCount(hit.downloads)}
          </span>
          <span title="Подписчиков">
            <Icon name="heart" size={13} /> {formatCount(hit.follows)}
          </span>
        </div>
        <InstallButton hit={hit} state={state} onInstall={onInstall} />
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>
          {timeAgo(hit.updated)}
        </span>
      </div>
    </div>
  )
}

function ProjectSheet(props: {
  id: string
  state?: 'busy' | 'done'
  targetName?: string
  onInstall(p: { id: string; title: string; type: ProjectType }): Promise<void>
  onClose(): void
}): React.JSX.Element {
  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    void window.dl.modrinth.project(props.id).then(setProject)
  }, [props.id])

  const html = useMemo(() => (project ? DOMPurify.sanitize(marked.parse(project.body, { async: false })) : ''), [project])
  const cover = image ?? project?.gallery[0]?.url
  // В чипах только релизы, свежие первыми
  const releases = project?.gameVersions.filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v)).slice(-6).reverse() ?? []

  return (
    <Sheet onClose={props.onClose}>
      {!project ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <Spinner />
        </div>
      ) : (
        <div className="project">
          <div className={'project-top' + (cover ? '' : ' short')}>
            <div
              className={'project-cover' + (cover ? '' : ' blur')}
              style={{ backgroundImage: cover ? `url(${cover})` : project.iconUrl ? `url(${project.iconUrl})` : undefined }}
            />
            <Button className="close" variant="ghost" icon onClick={props.onClose}>
              <Icon name="close" size={16} />
            </Button>
          </div>
          <div className="project-head">
            {project.iconUrl ? <img src={project.iconUrl} alt="" /> : <div />}
            <div>
              <h2>{project.title}</h2>
              <div style={{ color: 'var(--muted)', marginTop: 4 }}>{project.description}</div>
            </div>
          </div>
          <div className="project-actions">
            <InstallButton big hit={{ id: project.id, title: project.title, type: project.type }} state={props.state} onInstall={() => void props.onInstall({ id: project.id, title: project.title, type: project.type })} />
            {props.targetName && <span className="target">в «{props.targetName}»</span>}
            <span style={{ flex: 1 }} />
            <span className="chip">
              <Icon name="download" size={11} /> {formatCount(project.downloads)}
            </span>
            <span className="chip">
              <Icon name="heart" size={11} /> {formatCount(project.followers)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void window.dl.system.openExternal(`https://modrinth.com/project/${project.slug}`)}>
              <Icon name="external" size={14} /> Modrinth
            </Button>
          </div>
          <div style={{ padding: '0 26px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {project.loaders.map((l) => (
              <span key={l} className="chip lime">
                {l}
              </span>
            ))}
            {releases.map((v) => (
              <span key={v} className="chip">
                {v}
              </span>
            ))}
          </div>
          {project.gallery.length > 1 && (
            <div className="gallery">
              {project.gallery.map((g) => (
                <img key={g.url} src={g.url} alt={g.title ?? ''} onClick={() => setImage(g.url)} />
              ))}
            </div>
          )}
          <div
            className="md"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest('a')
              if (a) {
                e.preventDefault()
                void window.dl.system.openExternal(a.href)
              }
            }}
          />
        </div>
      )}
    </Sheet>
  )
}
