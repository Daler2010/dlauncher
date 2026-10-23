import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'lime' | 'ghost' | 'outline' | 'danger' | 'done'
  size?: 'md' | 'sm'
  icon?: boolean
}

export function Button({ variant = 'default', size = 'md', icon, className = '', ...rest }: BtnProps): React.JSX.Element {
  const cls = ['btn', variant !== 'default' && variant, size === 'sm' && 'sm', icon && 'icon', className].filter(Boolean).join(' ')
  return <button className={cls} {...rest} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Range(props: { min: number; max: number; step: number; value: number; display: string; onChange(v: number): void }): React.JSX.Element {
  const { min, max, step, value, display, onChange } = props
  return (
    <div className="range">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="value">{display}</span>
    </div>
  )
}

export function Toggle({ on, onChange, title }: { on: boolean; onChange(v: boolean): void; title?: string }): React.JSX.Element {
  return (
    <div
      className={'toggle' + (on ? ' on' : '')}
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!on)
      }}
    />
  )
}

export function Switch(props: { checked: boolean; label: string; hint?: string; onChange(v: boolean): void }): React.JSX.Element {
  const { checked, label, hint, onChange } = props
  return (
    <div className="switch" onClick={() => onChange(!checked)}>
      <div className="text">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <Toggle on={checked} onChange={onChange} />
    </div>
  )
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange(v: NoInfer<T>): void }): React.JSX.Element {
  return (
    <div className="segmented">
      {props.options.map((o) => (
        <button key={o.value} className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>(props: { value: T; tabs: { value: T; label: string; count?: number }[]; onChange(v: NoInfer<T>): void }): React.JSX.Element {
  return (
    <div className="tabs">
      {props.tabs.map((t) => (
        <button key={t.value} className={t.value === props.value ? 'on' : ''} onClick={() => props.onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value, indeterminate }: { value: number; indeterminate?: boolean }): React.JSX.Element {
  return (
    <div className={'progress' + (indeterminate ? ' indeterminate' : '')}>
      <div className="fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

/*
 * Модалки и шторки рендерим порталом в body: если они окажутся внутри верхней панели
 * (-webkit-app-region: drag), Windows заберёт клики под перетаскивание окна.
 */
export function Modal({ children, onClose }: { children: ReactNode; onClose(): void }): React.JSX.Element {
  return createPortal(
    <>
      <div className="backdrop" onMouseDown={onClose} />
      <div className="modal">{children}</div>
    </>,
    document.body
  )
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose(): void }): React.JSX.Element {
  return createPortal(
    <>
      <div className="backdrop" onMouseDown={onClose} />
      <div className="sheet">{children}</div>
    </>,
    document.body
  )
}

export function Spinner(): React.JSX.Element {
  return <div className="spinner" />
}
