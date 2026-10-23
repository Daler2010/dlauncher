import { useEffect, useState } from 'react'
import type { LoaderType, VersionInfo } from '@shared/types'
import { formatPlayTime, LOADER_LABEL, timeAgo } from '../art'
import { Icon } from '../components/Icon'
import { Cover } from '../components/Shell'
import { Button, Field, Modal, Segmented, Switch } from '../components/ui'
import { cleanError, useApp } from '../store'

export function Library(): React.JSX.Element {
  const { instances, settings, openInstance, play, game, openDiscover } = useApp()
  const [creating, setCreating] = useState(false)
  const sorted = [...instances].sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt))
  const totalTime = instances.reduce((s, i) => s + (i.playTimeMs ?? 0), 0)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="label">
            {instances.length} сборок · наиграно {formatPlayTime(totalTime)}
          </div>
          <h1 style={{ marginTop: 8 }}>Сборки</h1>
        </div>
        <span className="spacer" />
        <Button variant="ghost" onClick={() => openDiscover('modpack')}>
          <Icon name="box" size={16} /> Модпаки
        </Button>
        <Button variant="lime" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Новая сборка
        </Button>
      </div>

      <div className="lib-grid">
        {sorted.map((inst) => (
          <div key={inst.id} className={'inst-card' + (inst.id === settings?.selectedInstanceId ? ' selected' : '')} onClick={() => openInstance(inst.id)}>
            <Cover inst={inst} className="cover" />
            <button
              className="quick-play"
              title="Играть"
              disabled={game.status !== 'idle'}
              onClick={(e) => {
                e.stopPropagation()
                void play(inst.id)
              }}
            >
              <Icon name="play" size={20} />
            </button>
            <div className="info">
              <div className="name">{inst.name}</div>
              <div className="row">
                <span className="chip">{inst.version}</span>
                <span className="chip">{LOADER_LABEL[inst.loader]}</span>
                {inst.optimized && (
                  <span className="chip lime">
                    <Icon name="zap" size={10} />
                  </span>
                )}
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>
                {timeAgo(inst.lastPlayed)} · {formatPlayTime(inst.playTimeMs)}
              </div>
            </div>
          </div>
        ))}
        <button className="new-card" onClick={() => setCreating(true)}>
          <Icon name="plus" size={26} />
          Новая сборка
        </button>
      </div>

      {creating && <CreateInstance onClose={() => setCreating(false)} />}
    </div>
  )
}

const LOADERS: { value: LoaderType; label: string }[] = [
  { value: 'fabric', label: 'Fabric' },
  { value: 'neoforge', label: 'NeoForge' },
  { value: 'forge', label: 'Forge' },
  { value: 'quilt', label: 'Quilt' },
  { value: 'vanilla', label: 'Ванилла' }
]

function CreateInstance({ onClose }: { onClose(): void }): React.JSX.Element {
  const { reloadInstances, selectInstance, openInstance } = useApp()
  const [versions, setVersions] = useState<VersionInfo[] | null>(null)
  const [version, setVersion] = useState('')
  const [name, setName] = useState('')
  const [loader, setLoader] = useState<LoaderType>('fabric')
  const [loaderVersions, setLoaderVersions] = useState<string[] | null>(null)
  const [loaderVersion, setLoaderVersion] = useState('')
  const [optimized, setOptimized] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    window.dl.versions
      .list()
      .then((list) => {
        setVersions(list)
        setVersion(list.find((v) => v.type === 'release')?.id ?? list[0]?.id ?? '')
      })
      .catch((e) => setError('Не удалось загрузить список версий: ' + cleanError(e)))
  }, [])

  useEffect(() => {
    setLoaderVersions(null)
    setLoaderVersion('')
    if (loader === 'vanilla' || !version) return
    let alive = true
    window.dl.versions
      .loaders(loader, version)
      .then((list) => {
        if (!alive) return
        setLoaderVersions(list)
        setLoaderVersion(list[0] ?? '')
      })
      .catch(() => alive && setLoaderVersions([]))
    return () => {
      alive = false
    }
  }, [loader, version])

  const unsupported = loader !== 'vanilla' && loaderVersions !== null && loaderVersions.length === 0

  const create = async (): Promise<void> => {
    try {
      const inst = await window.dl.instances.create({
        name: name || `${LOADER_LABEL[loader]} ${version}`,
        version,
        loader,
        loaderVersion: loaderVersion || undefined,
        optimized
      })
      await selectInstance(inst.id)
      await reloadInstances()
      onClose()
      openInstance(inst.id)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  return (
    <Modal onClose={onClose}>
      <div>
        <div className="label">новая сборка</div>
        <h3 style={{ marginTop: 6 }}>Собери свою игру</h3>
      </div>
      <Field label="Название">
        <input className="input" value={name} placeholder={`${LOADER_LABEL[loader]} ${version}`} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Загрузчик">
        <Segmented value={loader} options={LOADERS} onChange={setLoader} />
      </Field>
      <div className="row-2">
        <Field label="Версия игры">
          <select className="select" value={version} disabled={!versions} onChange={(e) => setVersion(e.target.value)}>
            {!versions && <option>Загрузка…</option>}
            {versions?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}
                {v.type === 'snapshot' ? ' (снапшот)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Версия ${LOADER_LABEL[loader]}`}>
          <select
            className="select"
            value={loaderVersion}
            disabled={loader === 'vanilla' || !loaderVersions?.length}
            onChange={(e) => setLoaderVersion(e.target.value)}
          >
            {loader === 'vanilla' && <option>—</option>}
            {loader !== 'vanilla' && loaderVersions === null && <option>Загрузка…</option>}
            {unsupported && <option>Нет под эту версию</option>}
            {loaderVersions?.map((v, i) => (
              <option key={v} value={v}>
                {v}
                {i === 0 ? ' (рекомендуется)' : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {loader !== 'vanilla' && (
        <Switch
          checked={optimized}
          label="Максимальная оптимизация"
          hint="Sodium, Lithium, FerriteCore, ModernFix и другие — больше FPS, меньше фризов"
          onChange={setOptimized}
        />
      )}
      {error && <div className="error-text">{error}</div>}
      <div className="actions">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="lime" disabled={!version || unsupported || (loader !== 'vanilla' && !loaderVersion)} onClick={() => void create()}>
          Создать
        </Button>
      </div>
    </Modal>
  )
}
