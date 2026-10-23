/* Генеративная графика лаунчера: обложки сборок и рендер скинов в 2D */

function hash(s: string): number {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Биомы для обложек: небо (верх → горизонт), светило, поверхность и порода */
interface Biome {
  sky: [string, string]
  orb: string
  top: string[]
  body: string[]
}

const BIOMES: Biome[] = [
  { sky: ['#1b3a6b', '#6aa6d8'], orb: '#fff3b0', top: ['#5da544', '#4c9136'], body: ['#7a5536', '#6e4a2e', '#5c3e26'] },
  { sky: ['#2a1745', '#d46a4c'], orb: '#ffd27a', top: ['#e8d49a', '#d8c38c'], body: ['#c9b27a', '#b89c62', '#a8875a'] },
  { sky: ['#0c1024', '#2b3a6e'], orb: '#e8ecff', top: ['#f2f6ff', '#dfe7f5'], body: ['#7d8590', '#6b727c', '#5a6069'] },
  { sky: ['#250a0a', '#6b1c1c'], orb: '#ffb347', top: ['#8c2a22', '#b2462b'], body: ['#4a1414', '#3a0f12', '#5e1a1a'] },
  { sky: ['#120b1f', '#3a2a4f'], orb: '#c9a8ff', top: ['#e4dfa5', '#d7d29a'], body: ['#c2bc7f', '#a99f64', '#b5ae73'] },
  { sky: ['#0d2b33', '#3f8f84'], orb: '#c8fff4', top: ['#63b3a3', '#3f8f84'], body: ['#2d6e66', '#1f4f4a', '#26605a'] },
  { sky: ['#1a1030', '#5a3d8f'], orb: '#f0d0ff', top: ['#9a75d6', '#7b55b8'], body: ['#3d2a63', '#4b3478', '#2a1d45'] },
  { sky: ['#13261a', '#4e8a5b'], orb: '#ffe9a8', top: ['#3b7a2c', '#2f5d23'], body: ['#505159', '#44454c', '#36373d'] }
]

const coverCache = new Map<string, string>()

/** Пиксельный пейзаж 24×13: небо с градиентом, солнце/луна, рельеф из блоков */
export function coverFor(id: string): string {
  const cached = coverCache.get(id)
  if (cached) return cached
  const h = hash(id)
  const rand = rng(h)
  const biome = BIOMES[h % BIOMES.length]
  const W = 24
  const H = 13
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, biome.sky[0])
  sky.addColorStop(1, biome.sky[1])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // Светило — квадрат 2×2, как в игре
  ctx.fillStyle = biome.orb
  ctx.fillRect(3 + Math.floor(rand() * (W - 8)), 1 + Math.floor(rand() * 2), 2, 2)

  let height = 6 + Math.floor(rand() * 2)
  for (let x = 0; x < W; x++) {
    const r = rand()
    height = Math.max(4, Math.min(10, height + (r < 0.28 ? -1 : r > 0.72 ? 1 : 0)))
    for (let y = height; y < H; y++) {
      const depth = y - height
      const set = depth === 0 ? biome.top : biome.body
      ctx.fillStyle = set[Math.floor(rand() * set.length)]
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const url = canvas.toDataURL()
  coverCache.set(id, url)
  return url
}

/* ---------- Скины ---------- */

const imageCache = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
    imageCache.set(url, p)
  }
  return p
}

type Part = [sx: number, sy: number, w: number, h: number, dx: number, dy: number, mirror?: boolean]

/**
 * Старые скины 64×32 часто заливают слой шляпы непрозрачным цветом. Игра такой слой
 * не рисует, если в нём нет ни одного прозрачного пикселя, — делаем так же.
 */
function overlayVisible(img: HTMLImageElement, sx: number, sy: number, w: number, h: number): boolean {
  if (img.height !== 32) return true
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

/** Фронтальный вид персонажа 16×32 со вторым слоем (шляпа, куртка, рукава, штаны) */
export function drawSkinFront(ctx: CanvasRenderingContext2D, img: HTMLImageElement, slim: boolean): void {
  const legacy = img.height === 32
  const aw = slim ? 3 : 4
  const base: Part[] = [
    [8, 8, 8, 8, 4, 0],
    [20, 20, 8, 12, 4, 8],
    [44, 20, aw, 12, 4 - aw, 8],
    legacy ? [44, 20, aw, 12, 12, 8, true] : [36, 52, aw, 12, 12, 8],
    [4, 20, 4, 12, 4, 20],
    legacy ? [4, 20, 4, 12, 8, 20, true] : [20, 52, 4, 12, 8, 20]
  ]
  const overlay: Part[] = legacy
    ? overlayVisible(img, 40, 8, 8, 8)
      ? [[40, 8, 8, 8, 4, 0]]
      : []
    : [
        [40, 8, 8, 8, 4, 0],
        [20, 36, 8, 12, 4, 8],
        [44, 36, aw, 12, 4 - aw, 8],
        [52, 52, aw, 12, 12, 8],
        [4, 36, 4, 12, 4, 20],
        [4, 52, 4, 12, 8, 20]
      ]
  ctx.imageSmoothingEnabled = false
  for (const [sx, sy, w, h, dx, dy, mirror] of [...base, ...overlay]) {
    if (mirror) {
      ctx.save()
      ctx.translate(dx + w, dy)
      ctx.scale(-1, 1)
      ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h)
      ctx.restore()
    } else {
      ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h)
    }
  }
}

const headCache = new Map<string, string>()

/** Голова 8×8 со шляпой — для аватарки аккаунта */
export async function headFromSkin(url: string): Promise<string> {
  const cached = headCache.get(url)
  if (cached) return cached
  const img = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 8
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8)
  if (overlayVisible(img, 40, 8, 8, 8)) ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8)
  const out = canvas.toDataURL()
  headCache.set(url, out)
  return out
}

/* ---------- Форматирование ---------- */

export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.0', '') + ' млн'
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace('.0', '') + ' тыс'
  return String(n)
}

export function formatPlayTime(ms?: number): string {
  if (!ms) return '0 мин'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  return `${h} ч ${min % 60} мин`
}

export function timeAgo(ts?: number | string): string {
  if (!ts) return 'никогда'
  const t = typeof ts === 'string' ? Date.parse(ts) : ts
  const d = (Date.now() - t) / 1000
  if (d < 60) return 'только что'
  if (d < 3600) return `${Math.floor(d / 60)} мин назад`
  if (d < 86400) return `${Math.floor(d / 3600)} ч назад`
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} дн назад`
  return new Date(t).toLocaleDateString('ru-RU')
}

export const LOADER_LABEL: Record<string, string> = {
  vanilla: 'Ванилла',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}
