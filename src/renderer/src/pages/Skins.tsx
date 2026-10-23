import { useEffect, useRef, useState } from 'react'
import * as skinview3d from 'skinview3d'
import type { Skin } from '@shared/types'
import { drawSkinFront, loadImage } from '../art'
import { Icon } from '../components/Icon'
import { Button, Segmented, Spinner } from '../components/ui'
import { cleanError, useActiveSkin, useApp } from '../store'

type Anim = 'idle' | 'walk' | 'run' | 'wave'

const ANIMS: { value: Anim; label: string }[] = [
  { value: 'idle', label: 'Стоит' },
  { value: 'walk', label: 'Идёт' },
  { value: 'run', label: 'Бежит' },
  { value: 'wave', label: 'Машет' }
]

function makeAnimation(a: Anim): skinview3d.PlayerAnimation {
  if (a === 'walk') return new skinview3d.WalkingAnimation()
  if (a === 'run') return new skinview3d.RunningAnimation()
  if (a === 'wave') return new skinview3d.WaveAnimation()
  return new skinview3d.IdleAnimation()
}

/** Плоское превью скина спереди для карточки библиотеки */
function SkinThumb({ skin }: { skin: Skin }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    void loadImage(skin.url).then((img) => {
      const ctx = ref.current?.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, 16, 32)
      drawSkinFront(ctx, img, skin.model === 'slim')
    })
  }, [skin.url, skin.model])
  return <canvas ref={ref} width={16} height={32} style={{ width: 48, height: 96 }} />
}

export function Skins(): React.JSX.Element {
  const { skins, setSkins, notify, accounts } = useApp()
  const { url, slim } = useActiveSkin()
  const nick = accounts.accounts.find((a) => a.id === accounts.activeId)?.name ?? 'Игрок'
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewer = useRef<skinview3d.SkinViewer | null>(null)
  const [anim, setAnim] = useState<Anim>('walk')
  const [rotate, setRotate] = useState(true)
  const [byNick, setByNick] = useState('')
  const [busy, setBusy] = useState(false)
  const active = skins.skins.find((s) => s.id === skins.activeId)

  useEffect(() => {
    const v = new skinview3d.SkinViewer({ canvas: canvas.current!, width: 360, height: 480, zoom: 0.7, fov: 38 })
    v.autoRotateSpeed = 0.6
    v.globalLight.intensity = 2.6
    v.cameraLight.intensity = 0.7
    viewer.current = v
    return () => v.dispose()
  }, [])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    if (url) void v.loadSkin(url, { model: slim ? 'slim' : 'default' })
    else v.loadSkin(null)
  }, [url, slim])

  useEffect(() => {
    if (viewer.current) viewer.current.animation = makeAnimation(anim)
  }, [anim])
  useEffect(() => {
    if (viewer.current) viewer.current.autoRotate = rotate
  }, [rotate])

  const run = async (fn: () => Promise<typeof skins>): Promise<void> => {
    setBusy(true)
    try {
      setSkins(await fn())
    } catch (e) {
      notify(cleanError(e), 'error')
    }
    setBusy(false)
  }

  return (
    <div className="skins">
      <section className="stage">
        <div className="stage-head">
          <div className="label">гардероб · {nick}</div>
          <h1>{active?.name ?? 'Стандартный'}</h1>
        </div>
        <canvas ref={canvas} />
        <div className="stage-foot">
          <div className="row">
            <Segmented value={anim} options={ANIMS} onChange={setAnim} />
          </div>
          <div className="row">
            {active && (
              <Segmented
                value={active.model}
                options={[
                  { value: 'classic', label: 'Широкие руки' },
                  { value: 'slim', label: 'Тонкие руки' }
                ]}
                onChange={(model) => void run(() => window.dl.skins.setModel(active.id, model))}
              />
            )}
            <Button variant="ghost" icon title={rotate ? 'Остановить вращение' : 'Вращать'} onClick={() => setRotate(!rotate)}>
              <Icon name="refresh" size={16} />
            </Button>
          </div>
        </div>
      </section>

      <section className="skin-lib">
        <div className="page-head" style={{ marginBottom: 18 }}>
          <div>
            <div className="label">{skins.skins.length} в библиотеке</div>
            <h1 style={{ marginTop: 8, fontSize: 24 }}>Скины</h1>
          </div>
        </div>

        {skins.sync && skins.sync.status !== 'off' && (
          <div className={'sync ' + skins.sync.status}>
            <span className="dot" />
            {skins.sync.message}
            {skins.sync.status === 'error' && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => window.dl.skins.select(skins.activeId))}>
                Повторить
              </Button>
            )}
          </div>
        )}

        <div className="skin-add">
          <div className="search">
            <Icon name="user" size={16} />
            <input
              className="input"
              placeholder="Взять скин по нику лицензии, например Dream"
              value={byNick}
              onChange={(e) => setByNick(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && byNick.trim()) void run(() => window.dl.skins.importNick(byNick)).then(() => setByNick(''))
              }}
            />
          </div>
          <Button disabled={busy || !byNick.trim()} onClick={() => void run(() => window.dl.skins.importNick(byNick)).then(() => setByNick(''))}>
            {busy ? <Spinner /> : <Icon name="download" size={15} />} Найти
          </Button>
          <Button variant="lime" disabled={busy} onClick={() => void run(() => window.dl.skins.importFile())}>
            <Icon name="upload" size={15} /> Загрузить PNG
          </Button>
        </div>

        <div className="skin-grid">
          <div className={'skin-card' + (!skins.activeId ? ' on' : '')} onClick={() => void run(() => window.dl.skins.select(null))}>
            <div style={{ width: 48, height: 96, display: 'grid', placeItems: 'center', color: 'var(--faint)' }}>
              <Icon name="user" size={30} />
            </div>
            <div className="n">Без скина</div>
          </div>
          {skins.skins.map((s) => (
            <div key={s.id} className={'skin-card' + (s.id === skins.activeId ? ' on' : '')} onClick={() => void run(() => window.dl.skins.select(s.id))}>
              <SkinThumb skin={s} />
              <div className="n">{s.name}</div>
              <span className="chip" style={{ height: 18, fontSize: 10 }}>
                {s.model === 'slim' ? 'slim' : 'classic'}
              </span>
              <Button
                className="del"
                variant="ghost"
                size="sm"
                icon
                title="Удалить"
                onClick={(e) => {
                  e.stopPropagation()
                  void run(() => window.dl.skins.remove(s.id))
                }}
              >
                <Icon name="trash" size={14} />
              </Button>
            </div>
          ))}
        </div>

        <div className="note">
          <Icon name="info" size={16} />
          <div>
            Скин появится в игре при следующем запуске любой сборки с модами (Fabric, Quilt, Forge, NeoForge): лаунчер сам
            поставит CustomSkinLoader. Другие игроки DLauncher тоже увидят твой скин — он хранится на сервере. Скин привязан
            к аккаунту «{nick}».
          </div>
        </div>
      </section>
    </div>
  )
}
