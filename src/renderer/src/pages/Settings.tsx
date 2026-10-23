import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Button, Field, Range, Switch } from '../components/ui'
import { useApp } from '../store'

export function Settings(): React.JSX.Element {
  const { settings, updateSettings } = useApp()
  const [totalMb, setTotalMb] = useState(8192)
  const [jvmArgs, setJvmArgs] = useState(settings?.jvmArgs ?? '')
  const [javaPath, setJavaPath] = useState(settings?.javaPath ?? '')

  useEffect(() => {
    void window.dl.system.totalMemoryMb().then(setTotalMb)
  }, [])

  if (!settings) return <div />
  // Оставляем системе минимум 2 ГБ
  const maxMem = Math.max(2048, Math.floor((totalMb - 2048) / 512) * 512)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="label">dlauncher</div>
          <h1 style={{ marginTop: 8 }}>Опции</h1>
        </div>
      </div>
      <div className="settings">
        <section>
          <div>
            <h3>Производительность</h3>
            <p>Общие значения для всех сборок. У сборки можно задать свою память.</p>
          </div>
          <div className="fields">
            <Field label="Память для игры" hint={`В системе ${(totalMb / 1024).toFixed(1)} ГБ. Ванилле и лёгким сборкам хватает 3–4 ГБ, тяжёлым модпакам — 6–8 ГБ.`}>
              <Range
                min={1024}
                max={maxMem}
                step={512}
                value={Math.min(settings.memoryMb, maxMem)}
                display={`${(settings.memoryMb / 1024).toFixed(1)} ГБ`}
                onChange={(memoryMb) => void updateSettings({ memoryMb })}
              />
            </Field>
            <Switch
              checked={settings.optimizeJvm}
              label="Оптимизация Java"
              hint="Настроенный G1 GC без фризов, вся память выделяется сразу, приоритет процесса выше среднего"
              onChange={(optimizeJvm) => void updateSettings({ optimizeJvm })}
            />
            <Switch
              checked={settings.hideOnLaunch}
              label="Прятать лаунчер во время игры"
              hint="Окно вернётся, когда закроешь игру"
              onChange={(hideOnLaunch) => void updateSettings({ hideOnLaunch })}
            />
          </div>
        </section>

        <section>
          <div>
            <h3>Окно игры</h3>
          </div>
          <div className="fields">
            <div className="row-2">
              <Field label="Ширина">
                <input className="input" type="number" min={640} value={settings.width} onChange={(e) => void updateSettings({ width: Number(e.target.value) || 1280 })} />
              </Field>
              <Field label="Высота">
                <input className="input" type="number" min={480} value={settings.height} onChange={(e) => void updateSettings({ height: Number(e.target.value) || 720 })} />
              </Field>
            </div>
            <Switch checked={settings.fullscreen} label="Полный экран" onChange={(fullscreen) => void updateSettings({ fullscreen })} />
            <Switch checked={settings.showSnapshots} label="Показывать снапшоты" hint="В списке версий при создании сборки" onChange={(showSnapshots) => void updateSettings({ showSnapshots })} />
          </div>
        </section>

        <section>
          <div>
            <h3>Java</h3>
            <p>По умолчанию DLauncher сам скачивает нужную Java (8, 17 или 21) под каждую версию.</p>
          </div>
          <div className="fields">
            <Field label="Путь к java.exe">
              <input className="input" value={javaPath} placeholder="Автоматически" onChange={(e) => setJavaPath(e.target.value)} onBlur={() => void updateSettings({ javaPath })} />
            </Field>
            <Field label="Дополнительные аргументы JVM">
              <input className="input mono" value={jvmArgs} onChange={(e) => setJvmArgs(e.target.value)} onBlur={() => void updateSettings({ jvmArgs })} />
            </Field>
          </div>
        </section>

        <section>
          <div>
            <h3>Файлы</h3>
            <p>Версии, библиотеки, Java и все сборки.</p>
          </div>
          <div className="fields">
            <div>
              <Button onClick={() => void window.dl.system.openDataFolder()}>
                <Icon name="folder" size={16} /> Открыть папку DLauncher
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
