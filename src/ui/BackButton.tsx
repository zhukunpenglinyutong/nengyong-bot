import { Icon } from './Icon'

interface Props {
  label?: string // read out instead of the text, where the text alone does not say it goes back
  onClick: () => void
  children: string
}

/** A chevron and where it goes back to, in the text colour of whatever it sits in. */
export function BackButton({ label, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-ml-1.5 flex items-center rounded-md py-0.5 pr-2 text-sm"
    >
      <span className="rotate-180">
        <Icon name="chevron" size={16} />
      </span>
      {children}
    </button>
  )
}
