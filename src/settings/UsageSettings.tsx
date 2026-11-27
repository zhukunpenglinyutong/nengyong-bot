import { type ReactNode, Suspense, use, useState } from 'react'
import type { Bot } from '../../shared/bot'
import type { NengyongBotBridge } from '../../shared/bridge'
import type { Price, UsageView } from '../../shared/usage'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { Segmented } from '../ui/Segmented'
import { usePersistentState } from '../ui/usePersistentState'
import { MEASURE_IDS, MEASURES, MeasureContext, MeasureId } from './measure'
import { PickerButton } from './PickerButton'
import { periodsOf } from './periods'
import { UsageBreakdown } from './UsageBreakdown'
import { EmptyUsage, UsageOverview } from './UsageOverview'
import { UsagePrices } from './UsagePrices'
import { type Dimension, type MeasuredView, modelColors, namesOf, type Range, totalsOf } from './usageStats'
import { strings } from '../../shared/strings'

interface Props {
  bridge: Pick<NengyongBotBridge, 'usage' | 'setModelPrice'>
  bots: Bot[]
}

type Loaded = { kind: 'loaded'; view: UsageView } | { kind: 'failed'; message: string }

const RANGES = [
  { id: 1, label: strings().usage.page.today },
  { id: 7, label: strings().usage.page.days7 },
  { id: 30, label: strings().usage.page.days30 },
] as const

/** 用量: what the bots' model calls cost, how many tokens and runs they took, by day (today by hour), bot, source and model. Read once per visit. */
export function UsageSettings({ bridge, bots }: Props) {
  const [loading] = useState(() =>
    bridge.usage().then(
      (view): Loaded => ({ kind: 'loaded', view }),
      (error): Loaded => ({ kind: 'failed', message: ipcErrorMessage(error) }),
    ),
  )
  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-10 pt-9 pb-8">
      <Suspense fallback={<Heading />}>
        <LoadedUsage loading={loading} onSetPrice={bridge.setModelPrice} bots={bots} />
      </Suspense>
    </div>
  )
}

interface LoadedProps {
  loading: Promise<Loaded>
  onSetPrice: Props['bridge']['setModelPrice']
  bots: Bot[]
}

function LoadedUsage({ loading, ...rest }: LoadedProps) {
  const loaded = use(loading)
  if (loaded.kind === 'failed')
    return (
      <>
        <Heading />
        <p className="mt-6 text-sm text-danger">{loaded.message}</p>
      </>
    )
  if (loaded.view.since === null)
    return (
      <>
        <Heading />
        <EmptyUsage />
      </>
    )
  return <Usage initial={loaded.view} {...rest} />
}

function Usage({ initial, onSetPrice, bots }: Omit<LoadedProps, 'loading'> & { initial: UsageView }) {
  const [stored, setView] = useState(initial)
  const [measureId, setMeasureId] = usePersistentState('usageMeasure', MeasureId)
  const measure = MEASURES[measureId]
  const view: MeasuredView = {
    ...stored,
    records: stored.records.map((record) => ({ ...record, amount: measure.amountOf(record) })),
  }
  const [range, setRange] = useState<Range>(7)
  const [dimension, setDimension] = useState<Dimension>('bot')
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const periods = periodsOf(view, range)
  const records = view.records.filter((record) => record.day >= view.today - range + 1)
  const colors = modelColors(view.records)
  const names = namesOf(bots, view)
  const models = new Set(records.map((record) => record.model))
  const dimensions: Dimension[] = models.size > 1 ? ['bot', 'source', 'model'] : ['bot', 'source']
  const shown = dimensions.includes(dimension) ? dimension : 'bot'
  const pointed = hovered ?? selected
  const chooseDimension = (next: Dimension) => {
    setDimension(next)
    setSelected(null)
    setHovered(null)
  }
  const savePrice = async (model: string, price: Price) => {
    setView(await onSetPrice(model, price))
    setEditing(null)
  }
  return (
    <MeasureContext value={measure}>
      <Heading>
        <PickerButton
          menuLabel={strings().usage.page.measure}
          items={MEASURE_IDS.map((id) => ({
            label: MEASURES[id].label,
            checked: id === measureId,
            onSelect: () => setMeasureId(id),
          }))}
        >
          <span className="px-1">{measure.label}</span>
        </PickerButton>
        <Segmented label={strings().usage.page.range} options={RANGES} value={range} onChange={setRange} />
      </Heading>
      <UsageOverview
        view={view}
        range={range}
        periods={periods}
        records={records}
        colors={colors}
        dimension={shown}
        pointed={pointed}
        names={names}
        onFillPrice={setEditing}
      />
      <UsageBreakdown
        records={records}
        periods={periods}
        dimensions={dimensions}
        dimension={shown}
        onDimension={chooseDimension}
        selected={selected}
        onSelect={setSelected}
        pointed={pointed}
        onPoint={setHovered}
        colors={colors}
        names={names}
      />
      <UsagePrices
        prices={view.prices.filter((entry) => models.has(entry.model))}
        tokensOf={(model) => totalsOf(records.filter((record) => record.model === model)).tokens}
        editing={editing}
        onEdit={setEditing}
        onSave={savePrice}
      />
    </MeasureContext>
  )
}

function Heading({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <h2 id="settings-title" className="text-xl font-semibold tracking-tight">
          {strings().usage.page.title}
        </h2>
        <p className="mt-1 text-sm text-balance text-muted">{strings().usage.page.intro}</p>
      </div>
      {children && <div className="mr-3 flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}
