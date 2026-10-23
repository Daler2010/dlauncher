import type { NewsItem } from '@shared/types'

const BASE = 'https://launchercontent.mojang.com'

interface MojangNews {
  entries: {
    id: string
    title: string
    text: string
    date: string
    tag: string
    category: string
    readMoreLink: string
    newsType: string[]
    newsPageImage?: { url: string }
    playPageImage?: { url: string }
  }[]
}

let cache: { at: number; items: NewsItem[] } | null = null

/** Новости Java Edition из того же источника, что и официальный лаунчер */
export async function listNews(): Promise<NewsItem[]> {
  if (cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.items
  const res = await fetch(`${BASE}/v2/news.json`)
  if (!res.ok) throw new Error(`Новости недоступны (${res.status})`)
  // Ответ начинается с BOM, JSON.parse на нём падает
  const data = JSON.parse((await res.text()).replace(/^﻿/, '')) as MojangNews
  const items = data.entries
    .filter((e) => e.newsType.includes('Java'))
    .slice(0, 24)
    .map((e) => ({
      id: e.id,
      title: e.title.trim(),
      text: e.text.trim(),
      date: e.date,
      tag: e.category,
      url: e.readMoreLink,
      image: BASE + (e.newsPageImage?.url ?? e.playPageImage?.url ?? '')
    }))
  cache = { at: Date.now(), items }
  return items
}
