// Рисует иконку DLauncher (куб-логотип на тёмной плашке) и сохраняет build/icon.png + build/icon.ico.
// Запуск: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

const SIZES = [256, 128, 64, 48, 32, 16]

const html = `<canvas id="c"></canvas><script>
function draw(size) {
  const c = document.getElementById('c')
  c.width = c.height = size
  const g = c.getContext('2d')
  const s = size / 24
  const r = size * 0.22
  g.fillStyle = '#0d0f12'
  g.beginPath()
  g.roundRect(0, 0, size, size, r)
  g.fill()
  g.save()
  g.translate(size * 0.14, size * 0.14)
  g.scale(s * 0.72, s * 0.72)
  const faces = [['M12 2 21 7 12 12 3 7z', '#e3ff7a'], ['M3 7l9 5v10l-9-5z', '#d4ff3a'], ['M21 7l-9 5v10l9-5z', '#8fb01c']]
  for (const [d, color] of faces) { g.fillStyle = color; g.fill(new Path2D(d)) }
  g.restore()
  return c.toDataURL('image/png')
}
</script>`

function ico(pngs) {
  // ICO с PNG внутри: заголовок, каталог, данные
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length)
  let offset = 6 + dir.length
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,' + encodeURIComponent(html))
  const out = join(__dirname, '..', 'build')
  mkdirSync(out, { recursive: true })
  const pngs = []
  for (const size of [512, ...SIZES]) {
    const url = await win.webContents.executeJavaScript(`draw(${size})`)
    const data = Buffer.from(url.split(',')[1], 'base64')
    if (size === 512) writeFileSync(join(out, 'icon.png'), data)
    else pngs.push({ size, data })
  }
  writeFileSync(join(out, 'icon.ico'), ico(pngs))
  console.log('icon written to', out)
  app.quit()
})
