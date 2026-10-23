import { useEffect } from 'react'
import { Rail, TaskDock, Toast, TopBar } from './components/Shell'
import { Console } from './pages/Console'
import { Discover } from './pages/Discover'
import { Home } from './pages/Home'
import { InstancePage } from './pages/InstancePage'
import { Library } from './pages/Library'
import { News } from './pages/News'
import { Settings } from './pages/Settings'
import { Skins } from './pages/Skins'
import { useApp } from './store'

function CurrentPage(): React.JSX.Element {
  const page = useApp((s) => s.page)
  const openInstanceId = useApp((s) => s.openInstanceId)
  const preset = useApp((s) => s.discoverPreset)
  switch (page) {
    case 'home':
      return <Home />
    case 'library':
      return <Library />
    case 'instance':
      return <InstancePage key={openInstanceId} />
    case 'discover':
      // Новый пресет — новый экземпляр каталога с нужными фильтрами
      return <Discover key={`${preset?.type}-${preset?.instanceId}`} />
    case 'skins':
      return <Skins />
    case 'news':
      return <News />
    case 'settings':
      return <Settings />
    case 'console':
      return <Console />
  }
}

export function App(): React.JSX.Element {
  const ready = useApp((s) => s.settings !== null)
  const init = useApp((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="app">
      <TopBar />
      <Rail />
      <main className="main">
        {ready && <CurrentPage />}
        <TaskDock />
      </main>
      <Toast />
    </div>
  )
}
