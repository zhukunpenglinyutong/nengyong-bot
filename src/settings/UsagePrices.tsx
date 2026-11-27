import { type FormEvent, use, useState } from 'react'
import { type ModelPrice, Price } from '../../shared/usage'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { CNY_PER_USD, MEASURES, MeasureContext } from './measure'
import { ModelLogo } from './ModelLogo'
import { Button, PrimaryButton } from '../ui/Button'
import { SettingsSection } from './SettingsSection'
import { tokenLabel, unitPrice } from './usageFormat'
import { strings } from '../../shared/strings'

interface Props {
  prices: ModelPrice[] // of the models the range used
  tokensOf: (model: string) => number
  editing: string | null // the model whose price form is open
  onEdit: (model: string | null) => void
  onSave: (model: string, price: Price) => Promise<void>
}

const PRICE_FIELDS = [
  { name: 'input', label: strings().usage.prices.input, placeholder: '0.11' },
  { name: 'cached', label: strings().usage.prices.cached, placeholder: strings().usage.prices.sameAsInput },
  { name: 'output', label: strings().usage.prices.output, placeholder: '0.28' },
] as const

/** The price of every model the range used, which is how the spend is estimated; one the catalog does not list can be filled in. */
export function UsagePrices({ prices, tokensOf, editing, onEdit, onSave }: Props) {
  const words = strings().usage.prices
  const measure = use(MeasureContext)
  return (
    <>
      <SettingsSection title={words.title}>
        {prices.map((entry) => (
          <div key={entry.model}>
            <PriceRow
              entry={entry}
              tokens={tokensOf(entry.model)}
              isEditing={editing === entry.model}
              onEdit={() => onEdit(entry.model)}
            />
            {editing === entry.model && (
              <PriceForm
                model={entry.model}
                price={entry.isCustom ? entry.price : null}
                onCancel={() => onEdit(null)}
                onSave={onSave}
              />
            )}
          </div>
        ))}
      </SettingsSection>
      <p className="mt-2 px-1 text-xs text-muted">
        {words.unit}
        {measure === MEASURES.CNY && words.cnyRate(CNY_PER_USD)}
        {words.source}
      </p>
    </>
  )
}

interface RowProps {
  entry: ModelPrice
  tokens: number
  isEditing: boolean
  onEdit: () => void
}

function PriceRow({ entry: { model, price, isCustom }, tokens, isEditing, onEdit }: RowProps) {
  const words = strings().usage.prices
  const origin = isCustom ? words.custom : words.fromCatalog
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3.5 px-4 py-3">
      <ModelLogo model={model} />
      <span className="min-w-0">
        <span className="block truncate font-mono text-sm">{model}</span>
        <span className="block text-xs text-muted">{price ? origin : words.notInCatalog(tokenLabel(tokens))}</span>
      </span>
      <span className="flex items-center gap-4 text-sm text-muted tabular-nums">
        {price &&
          PRICE_FIELDS.map((field) => (
            <span key={field.name}>
              {field.label} <span className="font-medium text-ink">{unitPrice(price[field.name])}</span>
            </span>
          ))}
        {(!price || isCustom) && !isEditing && <Button onClick={onEdit}>{price ? words.edit : words.fill}</Button>}
      </span>
    </div>
  )
}

// a stable function, so it focuses the field once when the form opens (which also scrolls it into view), not on every render
const focusOnMount = (input: HTMLInputElement | null) => input?.focus()

interface FormProps {
  model: string
  price: Price | null // the one filled in before, to change
  onCancel: () => void
  onSave: (model: string, price: Price) => Promise<void>
}

function PriceForm({ model, price, onCancel, onSave }: FormProps) {
  const words = strings().usage.prices
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const [input, cached, output] = PRICE_FIELDS.map((field) => String(form.get(field.name) ?? '').trim())
    const parsed =
      input && output
        ? Price.safeParse({ input: Number(input), cached: Number(cached || input), output: Number(output) })
        : null
    if (!parsed?.success) return setError(words.invalid)
    try {
      await onSave(model, parsed.data)
    } catch (failure) {
      setError(ipcErrorMessage(failure))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 pr-4 pb-3.5 pl-[62px]">
      <div className="flex flex-wrap items-center gap-3.5">
        {PRICE_FIELDS.map((field, index) => (
          <label key={field.name} className="flex items-center gap-1.5 text-sm text-soft">
            {field.label}
            <input
              ref={index === 0 ? focusOnMount : undefined}
              name={field.name}
              inputMode="decimal"
              placeholder={field.placeholder}
              defaultValue={price?.[field.name]}
              className="h-8 w-[76px] rounded-sm border border-line bg-surface px-2 font-mono text-sm text-ink outline-none focus:border-accent"
            />
          </label>
        ))}
        <span className="ml-auto flex gap-1.5">
          <Button onClick={onCancel}>{words.cancel}</Button>
          <PrimaryButton type="submit">{words.save}</PrimaryButton>
        </span>
      </div>
      <p className="text-xs text-muted">{words.formHint}</p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
