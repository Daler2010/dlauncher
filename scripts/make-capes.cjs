// Рисует плащи (текстуры 64×32 в формате Minecraft) в server-plugin/src/main/resources/capes:
//   rank/<группа>.png — плащи за ранги, free/<id>.png — плащи, которые может выбрать любой игрок.
// Все рисунки свои, без копирования официальных плащей.
// Запуск: npx electron scripts/make-capes.cjs
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

// Эмблемы 7×7: '#' — акцент, '+' — светлый, 'o' — тёмный
const EMBLEMS = {
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '#.....#'],
  diamond: ['...#...', '..#+#..', '.#+##.#', '#+###.#', '.#####.', '..###..', '...#...'],
  gem: ['.#####.', '#+#.#.#', '#######', '.#####.', '..###..', '...#...', '.......'],
  flame: ['...#...', '..##...', '..###..', '.##+#..', '.#+++#.', '#++++##', '.#####.'],
  crown: ['#..#..#', '##.#.##', '#######', '#+#+#+#', '#######', '.......', '.......'],
  bolt: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'],
  shield: ['#######', '#+++++#', '#+###+#', '#+###+#', '.#+#+#.', '..#+#..', '...#...'],
  cross: ['..###..', '..#+#..', '###+###', '#+++++#', '###+###', '..#+#..', '..###..'],
  creeper: ['.......', '##...##', '##...##', '...#...', '..###..', '..#.#..', '.......'],
  eye: ['..###..', '.#+++#.', '#++o++#', '#+ooo+#', '#++o++#', '.#+++#.', '..###..'],
  skull: ['.#####.', '#######', '#o#.#o#', '#######', '.#.#.#.', '.#####.', '.......'],
  jack: ['.......', '##...##', '###.###', '...#...', '#.###.#', '.#####.', '..#.#..'],
  blossom: ['..#.#..', '.##+##.', '#+#o#+#', '.##+##.', '..#.#..', '...+...', '...+...'],
  snow: ['#..#..#', '.#.#.#.', '..###..', '###+###', '..###..', '.#.#.#.', '#..#..#'],
  wave: ['.......', '.##....', '#..#..#', '....##.', '.##....', '#..#..#', '....##.'],
  bee: ['..#.#..', '...#...', '.#####.', '#o#o#o#', '.#####.', '..#o#..', '...#...'],
  heart: ['.##.##.', '#++#++#', '#+####.', '#######', '.#####.', '..###..', '...#...'],
  sword: ['......#', '.....##', '....##.', '#..##..', '.###...', '.##....', '#.#....'],
  wing: ['#......', '##.....', '###....', '####...', '#####..', '##.###.', '#...###'],
  moon: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
  tnt: ['#######', '.......', '#.#.#.#', '###.###', '#.#.#.#', '.......', '#######'],
  axolotl: ['#.....#', '##...##', '.#####.', '#o###o#', '#######', '.#+++#.', '.......'],
  sun: ['#..#..#', '.#####.', '.#+++#.', '##+++##', '.#+++#.', '.#####.', '#..#..#']
}

// pattern: noise | stars | stripes | waves | dots | checker | flow | rainbow | sculk
const RANK = [
  { id: 'vip', top: '#1f8a3d', bottom: '#0f4a20', border: '#0a2e14', accent: '#7dff9b', emblem: 'star', pattern: 'noise' },
  { id: 'premium', top: '#d79a18', bottom: '#7a4e06', border: '#3f2803', accent: '#fff2a8', emblem: 'diamond', pattern: 'dots' },
  { id: 'elite', top: '#1aa8c4', bottom: '#0a4d63', border: '#062a36', accent: '#b8fbff', emblem: 'gem', pattern: 'waves' },
  { id: 'legend', top: '#7b3fd6', bottom: '#2d1263', border: '#1a0a3a', accent: '#e3c6ff', emblem: 'flame', pattern: 'stars' },
  { id: 'titan', top: '#b31f2b', bottom: '#2a0508', border: '#120203', accent: '#ffd36b', emblem: 'crown', pattern: 'flow' },
  { id: 'helper', top: '#2f6fd6', bottom: '#12306b', border: '#0a1c40', accent: '#cfe2ff', emblem: 'cross', pattern: 'noise' },
  { id: 'moder', top: '#e06a1a', bottom: '#6b2a06', border: '#3a1603', accent: '#ffe0b8', emblem: 'shield', pattern: 'stripes' },
  { id: 'admin', top: '#22252b', bottom: '#050506', border: '#000000', accent: '#d4ff3a', emblem: 'bolt', pattern: 'checker' }
]

const FREE = [
  { id: 'creeper', top: '#4fb83c', bottom: '#2a6e1f', border: '#173d10', accent: '#0d1a0a', emblem: 'creeper', pattern: 'noise' },
  { id: 'ender', top: '#1b1029', bottom: '#060309', border: '#000000', accent: '#c36bff', emblem: 'eye', pattern: 'stars' },
  { id: 'nether', top: '#7a1c16', bottom: '#2e0807', border: '#160303', accent: '#ff8a2a', emblem: 'flame', pattern: 'flow' },
  { id: 'sculk', top: '#0b2a33', bottom: '#030d11', border: '#000506', accent: '#2fe6e6', emblem: 'skull', pattern: 'sculk' },
  { id: 'diamond', top: '#4fe0e0', bottom: '#1a7f8f', border: '#0c4049', accent: '#e8ffff', emblem: 'diamond', pattern: 'dots' },
  { id: 'emerald', top: '#18c45a', bottom: '#0a5e2a', border: '#053016', accent: '#c8ffd8', emblem: 'gem', pattern: 'dots' },
  { id: 'redstone', top: '#3a3d44', bottom: '#16171b', border: '#0a0a0c', accent: '#ff2a2a', emblem: 'bolt', pattern: 'waves' },
  { id: 'galaxy', top: '#151a4a', bottom: '#05061a', border: '#02030c', accent: '#ffffff', emblem: 'moon', pattern: 'stars' },
  { id: 'pumpkin', top: '#e8700e', bottom: '#7a2c04', border: '#2e1101', accent: '#ffe36b', emblem: 'jack', pattern: 'stripes' },
  { id: 'cherry', top: '#ffb6d5', bottom: '#d9619a', border: '#7a2a52', accent: '#ffffff', emblem: 'blossom', pattern: 'dots' },
  { id: 'ocean', top: '#2fa4e7', bottom: '#0b3d7a', border: '#062240', accent: '#d8f4ff', emblem: 'wave', pattern: 'waves' },
  { id: 'lava', top: '#ffb21c', bottom: '#c2280a', border: '#4a0d03', accent: '#fff3a0', emblem: 'sun', pattern: 'flow' },
  { id: 'frost', top: '#e6f6ff', bottom: '#7fbfe6', border: '#3d6f8f', accent: '#2a6fa8', emblem: 'snow', pattern: 'noise' },
  { id: 'bee', top: '#ffd21c', bottom: '#c99208', border: '#2a1e02', accent: '#2a1e02', emblem: 'bee', pattern: 'stripes' },
  { id: 'dragon', top: '#2a0f3d', bottom: '#09030f', border: '#000000', accent: '#e05cff', emblem: 'wing', pattern: 'stars' },
  { id: 'axolotl', top: '#ff9fc4', bottom: '#e0558f', border: '#7a1f47', accent: '#5a1430', emblem: 'axolotl', pattern: 'dots' },
  { id: 'rainbow', top: '#ffffff', bottom: '#ffffff', border: '#1a1a1a', accent: '#ffffff', emblem: 'heart', pattern: 'rainbow' },
  { id: 'tnt', top: '#d93a2b', bottom: '#8a1a10', border: '#2a0805', accent: '#ffffff', emblem: 'tnt', pattern: 'checker' },
  { id: 'warrior', top: '#5b6270', bottom: '#2a2e36', border: '#121418', accent: '#e8eef8', emblem: 'sword', pattern: 'noise' },
  { id: 'love', top: '#ff4a6b', bottom: '#a3122f', border: '#4a0614', accent: '#ffe3ea', emblem: 'heart', pattern: 'dots' }
]

const html = `<canvas id="c" width="64" height="32"></canvas><script>
const RAINBOW = ['#ff3b3b', '#ff9a2a', '#ffe02a', '#4fd65a', '#2ab0ff', '#7a5cff', '#d45cff']
function hex(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) }
function mix(a, b, t) {
  const [x, y] = [hex(a), hex(b)]
  return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',') + ')'
}
function draw(cape, emblem) {
  const c = document.getElementById('c')
  const g = c.getContext('2d')
  g.clearRect(0, 0, 64, 32)
  let seed = cape.id.split('').reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) & 0x7fffffff
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  function base(x, y, h) {
    const t = y / (h - 1)
    const p = cape.pattern
    if (p === 'rainbow') return RAINBOW[Math.floor((y / h) * RAINBOW.length)]
    let col = mix(cape.top, cape.bottom, t)
    if (p === 'noise' && rnd() < 0.18) col = mix(cape.top, cape.bottom, Math.min(1, t + 0.22))
    if (p === 'stars' && rnd() < 0.07) col = rnd() < 0.5 ? cape.accent : mix(cape.accent, cape.top, 0.5)
    if (p === 'stripes' && Math.floor((x + y) / 2) % 3 === 0) col = mix(cape.top, cape.bottom, Math.min(1, t + 0.3))
    if (p === 'waves' && (y + Math.round(Math.sin(x * 1.3) * 1.5)) % 4 === 0) col = mix(cape.accent, cape.top, 0.6)
    if (p === 'dots' && x % 3 === 1 && y % 3 === 1) col = mix(cape.accent, cape.top, 0.55)
    if (p === 'checker' && (x + y) % 2 === 0) col = mix(cape.top, cape.bottom, Math.min(1, t + 0.15))
    if (p === 'flow' && rnd() < 0.25) col = mix(cape.accent, cape.top, 0.3 + rnd() * 0.5)
    if (p === 'sculk' && rnd() < 0.1) col = mix(cape.accent, cape.bottom, 0.25 + rnd() * 0.4)
    return col
  }
  function face(ox, oy) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 10; x++) {
      let col = base(x, y, 16)
      if (x === 0 || x === 9 || y === 0) col = cape.border
      if (y === 13) col = cape.pattern === 'rainbow' ? '#ffffff' : cape.accent
      if (y >= 14) col = cape.border
      g.fillStyle = col
      g.fillRect(ox + x, oy + y, 1, 1)
    }
    // Подложка под эмблему, чтобы она читалась на любом узоре
    g.fillStyle = cape.pattern === 'rainbow' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.0)'
    g.fillRect(ox + 1, oy + 2, 8, 9)
    emblem.forEach((row, ey) => [...row].forEach((ch, ex) => {
      if (ch === '.' || ch === ' ') return
      g.fillStyle = ch === '+' ? '#ffffff' : ch === 'o' ? cape.border : cape.accent
      g.fillRect(ox + 2 + ex, oy + 3 + ey, 1, 1)
    }))
  }
  face(1, 1)   // внешняя сторона
  face(12, 1)  // внутренняя
  g.fillStyle = cape.border
  g.fillRect(0, 1, 1, 16); g.fillRect(11, 1, 1, 16)  // бока
  g.fillRect(1, 0, 10, 1); g.fillRect(11, 0, 10, 1)  // верх и низ
  // Элитры (22..45 × 0..21) — тот же узор с каймой
  for (let y = 0; y < 22; y++) for (let x = 22; x < 46; x++) {
    let col = base(x - 22, y, 22)
    if (y === 0 || x === 22 || x === 45 || y === 21) col = cape.border
    g.fillStyle = col
    g.fillRect(x, y, 1, 1)
  }
  return c.toDataURL('image/png')
}
</script>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,' + encodeURIComponent(html))
  const root = join(__dirname, '..', 'server-plugin', 'src', 'main', 'resources', 'capes')
  for (const [dir, list] of [['rank', RANK], ['free', FREE]]) {
    mkdirSync(join(root, dir), { recursive: true })
    for (const cape of list) {
      const url = await win.webContents.executeJavaScript(`draw(${JSON.stringify(cape)}, ${JSON.stringify(EMBLEMS[cape.emblem])})`)
      writeFileSync(join(root, dir, cape.id + '.png'), Buffer.from(url.split(',')[1], 'base64'))
    }
  }
  console.log(`capes: ${RANK.length} rank + ${FREE.length} free → ${root}`)
  app.quit()
})
