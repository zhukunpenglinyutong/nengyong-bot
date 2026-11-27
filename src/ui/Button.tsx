import type { ComponentProps } from 'react'

/** A secondary button: at the right end of a row, or beside the one that goes ahead. */
export function Button(props: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className="h-8 shrink-0 rounded-md border border-line bg-surface px-3 text-sm disabled:opacity-40"
    />
  )
}

/** The one button of a row, card or form that goes ahead. */
export function PrimaryButton(props: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className="h-8 shrink-0 rounded-md bg-ink px-3.5 text-sm text-canvas disabled:opacity-40"
    />
  )
}
