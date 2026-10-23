import { useEffect, useRef } from 'react'
import { Button } from '../components/ui'
import { useApp } from '../store'

function lineClass(stream: string, text: string): string {
  if (stream === 'launcher') return 'launcher'
  if (stream === 'err' || /\b(ERROR|FATAL|Exception)\b/.test(text)) return 'err'
  if (/\bWARN\b/.test(text)) return 'warn'
  return ''
}

export function Console(): React.JSX.Element {
  const { log, lastExit, game } = useApp()
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [log])

  return (
    <div className="page">
      <div className="console-wrap">
        <div className="page-head">
          <div>
            <div className="label">{log.length} строк</div>
            <h1 style={{ marginTop: 8 }}>Логи</h1>
          </div>
          <span className="spacer" />
          <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(log.map((l) => l.text).join('\n'))}>
            Скопировать
          </Button>
          {game.status === 'running' && (
            <Button variant="danger" size="sm" onClick={() => void window.dl.game.kill()}>
              Завершить процесс
            </Button>
          )}
        </div>

        {lastExit?.crashed ? (
          <div className="card crash">
            <h3>Игра завершилась с ошибкой (код {lastExit.code ?? '—'})</h3>
            <p>{lastExit.crashReport ? lastExit.crashReport.split('\n').slice(0, 6).join(' ') : 'Причина — в последних красных строках лога.'}</p>
            {lastExit.crashReportLocation && (
              <Button size="sm" style={{ marginTop: 12 }} onClick={() => void window.dl.game.openPath(lastExit.crashReportLocation!)}>
                Открыть crash-report
              </Button>
            )}
          </div>
        ) : (
          <div />
        )}

        <div
          ref={box}
          className="console"
          style={{ height: 'calc(100vh - 230px)' }}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
        >
          {log.length === 0 && <div className="empty-log">Здесь появится лог игры после запуска.</div>}
          {log.map((l, i) => (
            <div key={i} className={lineClass(l.stream, l.text)}>
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
