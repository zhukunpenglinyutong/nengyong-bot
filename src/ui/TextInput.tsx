import type { ComponentProps } from 'react'

/** A one-line input with the app's border and focus ring; `className` sets its size, corners and font. */
export function TextInput({ className, ...input }: ComponentProps<'input'> & { className: string }) {
  return (
    <input
      spellCheck={false}
      {...input}
      className={`border border-line bg-surface text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-sans placeholder:text-muted/70 focus:border-ink/20 focus:ring-3 focus:ring-ink/5 aria-invalid:border-danger ${className}`}
    />
  )
}
