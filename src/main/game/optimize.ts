import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * Моды производительности для Fabric (slug в Modrinth). Ставятся только те,
 * что вышли под версию сборки — недоступные молча пропускаем.
 */
export const PERF_MODS: { slug: string; title: string }[] = [
  { slug: 'fabric-api', title: 'Fabric API' },
  { slug: 'sodium', title: 'Sodium — новый движок рендера' },
  { slug: 'lithium', title: 'Lithium — оптимизация логики мира' },
  { slug: 'ferrite-core', title: 'FerriteCore — меньше памяти' },
  { slug: 'modernfix', title: 'ModernFix — быстрый запуск' },
  { slug: 'immediatelyfast', title: 'ImmediatelyFast — быстрый интерфейс и текст' },
  { slug: 'entityculling', title: 'EntityCulling — не рисует скрытых мобов' },
  { slug: 'dynamic-fps', title: 'Dynamic FPS — экономия, когда окно свёрнуто' },
  { slug: 'krypton', title: 'Krypton — оптимизация сети' }
]

/**
 * Настроенный G1 GC для клиента: короткие паузы сборщика = меньше фризов.
 * Флаги безопасны и для Java 8, и для 17/21.
 */
export function optimizedJvmFlags(): string[] {
  return [
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+UseG1GC',
    '-XX:G1NewSizePercent=20',
    '-XX:G1ReservePercent=20',
    '-XX:MaxGCPauseMillis=50',
    '-XX:G1HeapRegionSize=32M',
    '-XX:+ParallelRefProcEnabled',
    '-XX:+DisableExplicitGC',
    '-XX:+PerfDisableSharedMem',
    '-XX:-UsePerfData',
    '-Dfile.encoding=UTF-8'
  ]
}

/**
 * Лёгкие настройки графики и русский язык при первом запуске сборки.
 * Если options.txt уже есть (игрок что-то менял), не трогаем.
 */
export async function writeDefaultOptions(gameDir: string): Promise<void> {
  const file = join(gameDir, 'options.txt')
  if (existsSync(file)) return
  const options = [
    'lang:ru_ru',
    'renderDistance:10',
    'simulationDistance:6',
    'maxFps:260',
    'enableVsync:false',
    'graphicsMode:0',
    'renderClouds:"fast"',
    'entityShadows:false',
    'particles:1',
    'biomeBlendRadius:1',
    'mipmapLevels:2',
    'entityDistanceScaling:0.75',
    'prioritizeChunkUpdates:0'
  ]
  await writeFile(file, options.join('\n') + '\n', 'utf8')
}
