import { NewsCard, useNews } from './Home'

export function News(): React.JSX.Element {
  const news = useNews()
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="label">launchercontent.mojang.com</div>
          <h1 style={{ marginTop: 8 }}>Новости</h1>
        </div>
      </div>
      {news === null ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : news.length === 0 ? (
        <div className="empty">
          <b>Новости не загрузились</b>
          Проверь интернет и зайди сюда ещё раз.
        </div>
      ) : (
        <>
          <NewsCard item={news[0]} lead />
          <div className="news-grid">
            {news.slice(1).map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
