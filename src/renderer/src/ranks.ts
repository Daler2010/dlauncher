/** Ранги сервера (группы LuckPerms): подпись и цвет в лаунчере */
export const RANKS: Record<string, { label: string; color: string }> = {
  default: { label: 'Игрок', color: '#8d919a' },
  vip: { label: 'VIP', color: '#55e07a' },
  premium: { label: 'PREMIUM', color: '#ffc53d' },
  elite: { label: 'ELITE', color: '#3fd0ec' },
  legend: { label: 'LEGEND', color: '#b07cff' },
  titan: { label: 'TITAN', color: '#ff5a4e' },
  helper: { label: 'Хелпер', color: '#6fb8ff' },
  moder: { label: 'Модератор', color: '#ff9a3d' },
  admin: { label: 'Админ', color: '#d4ff3a' }
}

export function rankOf(group: string): { label: string; color: string } {
  return RANKS[group.toLowerCase()] ?? { label: group.toUpperCase(), color: '#8d919a' }
}

/** Названия плащей из каталога сервера */
export const CAPE_NAMES: Record<string, string> = {
  creeper: 'Крипер',
  ender: 'Эндер',
  nether: 'Незер',
  sculk: 'Скалк',
  diamond: 'Алмаз',
  emerald: 'Изумруд',
  redstone: 'Редстоун',
  galaxy: 'Галактика',
  pumpkin: 'Тыква',
  cherry: 'Сакура',
  ocean: 'Океан',
  lava: 'Лава',
  frost: 'Мороз',
  bee: 'Пчела',
  dragon: 'Дракон',
  axolotl: 'Аксолотль',
  rainbow: 'Радуга',
  tnt: 'Динамит',
  warrior: 'Воин',
  love: 'Сердце'
}

export const capeName = (id: string): string => CAPE_NAMES[id] ?? id

/** Ранги, за которые выдаётся плащ — для подсказки игрокам без плаща */
export const CAPE_RANKS = ['vip', 'premium', 'elite', 'legend', 'titan']
