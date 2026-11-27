import type { ReactNode } from 'react'
import { Icon } from '../ui/Icon'

interface PageProps {
  title: string // names the settings window too
  intro?: string
  actions?: ReactNode // at the right of the title
  children?: ReactNode
}

/** A settings page: its title, what it is for, then its sections, all scrolling together. */
export function SettingsPage({ title, intro, actions, children }: PageProps) {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-10 pt-9 pb-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h2 id="settings-title" className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {intro && <p className="mt-1 text-sm text-balance text-muted">{intro}</p>}
        </div>
        {actions && <div className="mr-3 flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  )
}

/** A card of rows, titled unless the page's tab already names it; the building block of every settings page. */
export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      {title && <h3 className="mb-2 px-1 text-sm text-muted">{title}</h3>}
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">{children}</div>
    </section>
  )
}

interface RowProps {
  id?: string
  label: string
  hint?: ReactNode
  children: ReactNode
}

export function SettingsRow({ id, label, hint, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-8 px-5 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-md text-ink">
          {label}
        </label>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

interface SelectProps<Id extends string> {
  id: string // the row's label points here
  value: Id
  options: readonly { id: Id; label: string }[]
  onChange: (value: Id) => void
}

/** A native select dressed as the row's pill; the menu that opens is the system's own. */
export function SettingsSelect<Id extends string>({ id, value, options, onChange }: SelectProps<Id>) {
  return (
    <span className="relative shrink-0">
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const picked = options.find((option) => option.id === event.target.value)
          if (picked) onChange(picked.id)
        }}
        className="h-8 appearance-none rounded-md border border-line bg-surface pr-8 pl-3 text-sm text-ink outline-none"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted">
        <Icon name="down" size={14} />
      </span>
    </span>
  )
}
