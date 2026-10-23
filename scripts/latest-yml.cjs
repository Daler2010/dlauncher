// Пишет dist/latest.yml для electron-updater по готовому установщику.
// Нужен, если electron-builder собрал установщик, но публикация в GitHub оборвалась.
// Запуск: node scripts/latest-yml.cjs
const { createHash } = require('crypto')
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const { version } = require('../package.json')
const name = `DLauncher-Setup-${version}.exe`
const file = readFileSync(join(__dirname, '..', 'dist', name))
const sha512 = createHash('sha512').update(file).digest('base64')
const yml = [
  `version: ${version}`,
  'files:',
  `  - url: ${name}`,
  `    sha512: ${sha512}`,
  `    size: ${file.length}`,
  `path: ${name}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  ''
].join('\n')
writeFileSync(join(__dirname, '..', 'dist', 'latest.yml'), yml)
console.log(yml)
