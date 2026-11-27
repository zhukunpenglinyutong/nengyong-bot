import type { ComponentProps } from 'react'

interface Props extends ComponentProps<'button'> {
  accent?: string // the colour of the user's bubbles; without one they are ink
  isPrimary?: boolean // the bot's pick, listed first: filled; the rest are tinted
  isLarge?: boolean // at the foot of a card
}

/** A button on an ask: clicking an answer says it for the user, so it wears the colour of their bubbles. */
export function AskButton({ accent, isPrimary = false, isLarge = false, ...props }: Props) {
  const color = accent ?? 'var(--color-ink)'
  const tint = {
    background: `color-mix(in srgb, ${color} 11%, var(--color-surface))`,
    color: `color-mix(in srgb, ${color} 72%, var(--color-ink))`,
  }
  return (
    <button
      type="button"
      {...props}
      data-primary={isPrimary || undefined}
      data-tinted={accent !== undefined || undefined}
      data-large={isLarge || undefined}
      style={isPrimary ? { background: accent } : tint}
      className="inline-flex h-[30px] shrink-0 items-center gap-0.5 rounded-full px-3.5 text-sm whitespace-nowrap disabled:opacity-40 data-large:h-9 data-large:px-[18px] data-large:text-md data-primary:bg-ink data-primary:text-canvas data-primary:data-tinted:text-white"
    />
  )
}
