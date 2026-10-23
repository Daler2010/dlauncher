import { useState } from 'react'
import { cleanError, useApp } from '../store'
import { Icon } from './Icon'
import { Button, Field, Modal } from './ui'

export function AccountModal({ onClose, required }: { onClose(): void; required?: boolean }): React.JSX.Element {
  const { accounts, setAccounts, game, notify } = useApp()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const busy = game.status !== 'idle'
  const active = accounts.accounts.find((a) => a.id === accounts.activeId)

  const act = async (fn: () => Promise<typeof accounts>, close = false): Promise<void> => {
    try {
      await setAccounts(await fn())
      setError('')
      if (close) onClose()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const add = (): void => {
    void act(() => window.dl.accounts.add(name), true).then(() => setName(''))
  }

  return (
    <Modal onClose={() => !required && onClose()}>
      <div>
        <div className="label">{required ? (accounts.accounts.length ? 'выбери аккаунт' : 'первый запуск') : 'офлайн-аккаунты'}</div>
        <h3 style={{ marginTop: 6 }}>{required && !accounts.accounts.length ? 'Как тебя зовут в игре?' : 'Аккаунты'}</h3>
      </div>

      {accounts.accounts.length > 0 && (
        <div className="account-list">
          {accounts.accounts.map((a) => {
            const isActive = a.id === accounts.activeId
            return (
              <div
                key={a.id}
                className={'account-row' + (isActive ? ' on' : '')}
                onClick={() => !isActive && void act(() => window.dl.accounts.select(a.id), true)}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="t">{a.name}</div>
                  <div className="m">{isActive ? 'играешь под этим ником' : 'нажми, чтобы войти'}</div>
                </div>
                {isActive && <span className="chip lime">активный</span>}
                <Button
                  variant="ghost"
                  size="sm"
                  icon
                  title="Удалить аккаунт"
                  disabled={busy && isActive}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!confirm(`Удалить аккаунт «${a.name}» из лаунчера? Вещи на сервере не пропадут — можно добавить ник снова.`)) return
                    void act(() => window.dl.accounts.remove(a.id)).then(() => notify(`Аккаунт ${a.name} удалён`))
                  }}
                >
                  <Icon name="trash" size={15} />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <Field label="Добавить ник" hint="3–16 символов: латиница, цифры, _. Тот же ник, что на сервере — сохранятся вещи и регистрация.">
        <input
          className="input"
          autoFocus
          maxLength={16}
          value={name}
          placeholder="Daler_qq"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && add()}
        />
      </Field>
      {error && <div className="error-text">{error}</div>}

      <div className="actions">
        {active && (
          <Button
            variant="danger"
            disabled={busy}
            title={busy ? 'Сначала закрой игру' : ''}
            onClick={() => void act(() => window.dl.accounts.logout()).then(() => notify('Ты вышел из аккаунта'))}
            style={{ marginRight: 'auto' }}
          >
            <Icon name="external" size={15} /> Выйти
          </Button>
        )}
        {!required && (
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        )}
        <Button variant="lime" onClick={add} disabled={!name.trim()}>
          <Icon name="plus" size={15} /> {accounts.accounts.length ? 'Добавить' : 'Поехали'}
        </Button>
      </div>
    </Modal>
  )
}
