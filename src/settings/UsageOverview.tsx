import { use } from 'react'
import { MeasureContext } from './measure'
import { ModelSwatch } from './ModelSwatch'
import { byPeriod, type Periods } from './periods'
import { UsageChart } from './UsageChart'
import { dayLabel, tokenLabel } from './usageFormat'
import {
  changeOf,
  type Dimension,
  groupBy,
  inStackOrder,
  KEY_OF,
  type Measured,
  type MeasuredView,
  type Range,
  totalsOf,
  type UsageNames,
} from './usageStats'
import { strings } from '../../shared/strings'

interface Props {
  view: MeasuredView
  range: Range
  periods: Periods
  records: Measured[] // of the range
  colors: Map<string, string>
  hasSeveralModels: boolean // the range used more than one model
  dimension: Dimension
  pointed: string | null
  names: UsageNames
  onFillPrice: (model: string) => void
}

/** The range at a glance: its total in the measure, a day (or an hour of today) on average, its tokens; then those, stacked by model. */
export function UsageOverview({
  view,
  range,
  periods,
  records,
  colors,
  hasSeveralModels,
  onFillPrice,
  ...chart
}: Props) {
  const measure = use(MeasureContext)
  const totals = totalsOf(records)
  const counted = byPeriod(periods, records).filter((part) => part.period.isCounted)
  const amounts = counted.map((part) => part.totals.amount)
  const peak = Math.max(...amounts)
  const peakName = counted[amounts.indexOf(peak)]?.period.name ?? ''
  const unpriced = view.prices.find((entry) => !entry.price && records.some((record) => record.model === entry.model))
  const cachedShare = `${totals.input ? Math.round((totals.cached / totals.input) * 100) : 0}%`
  return (
    <div className="mt-6 rounded-xl border border-line bg-surface px-6 pt-5 pb-4">
      <div className="flex items-start gap-10">
        <Figure
          label={measure.lead(periods.span)}
          value={measure.format(totals.amount)}
          note={changeNote(view, range)}
          isLead
        />
        <Figure
          label={periods.average}
          value={measure.format(totals.amount / Math.max(counted.length, 1))}
          note={strings().usage.overview.peak(peakName, measure.format(peak))}
        />
        {measure.kind === 'tokens' ? (
          <Figure
            label={strings().usage.overview.cacheHits}
            value={cachedShare}
            note={strings().usage.overview.inputOutput(tokenLabel(totals.input), tokenLabel(totals.output))}
          />
        ) : (
          <Figure
            label={strings().usage.measure.tokens}
            value={tokenLabel(totals.tokens)}
            note={strings().usage.overview.cachedShare(cachedShare)}
          />
        )}
      </div>
      {unpriced && totals.unpriced > 0 && (
        <button
          type="button"
          onClick={() => onFillPrice(unpriced.model)}
          className="mt-3.5 h-6 rounded-sm bg-warning/15 px-2 text-xs text-ink"
        >
          {strings().usage.overview.unpriced(tokenLabel(totals.unpriced), unpriced.model)}
        </button>
      )}
      {hasSeveralModels && <Legend records={records} colors={colors} />}
      <UsageChart periods={periods} records={records} colors={colors} hasSeveralModels={hasSeveralModels} {...chart} />
    </div>
  )
}

function changeNote(view: MeasuredView, range: Range): string {
  const change = changeOf(view, range)
  if (view.since !== null && view.since > view.today - range + 1)
    return strings().usage.overview.since(dayLabel(view.since))
  if (change === null) return ''
  const percent = Math.round(Math.abs(change) * 100)
  if (percent === 0) return strings().usage.overview.flat(range)
  return strings().usage.overview.change(range, change > 0, percent)
}

function Figure({ label, value, note, isLead }: { label: string; value: string; note: string; isLead?: boolean }) {
  return (
    <div data-lead={isLead || undefined} className="group">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-xl leading-tight font-semibold tracking-tight tabular-nums group-data-lead:mt-1 group-data-lead:text-2xl">
        {value}
      </div>
      <div className="mt-1 min-h-5 text-xs whitespace-nowrap text-muted tabular-nums">{note}</div>
    </div>
  )
}

/** Which colour is which model, in stacking order. */
function Legend({ records, colors }: { records: Measured[]; colors: Map<string, string> }) {
  const measure = use(MeasureContext)
  const models = inStackOrder(groupBy(records, KEY_OF.model), colors)
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-soft">
      {models.map((model) => (
        <span key={model.key} className="inline-flex items-center gap-1.5">
          <ModelSwatch color={colors.get(model.key)} />
          <span className="font-mono">{model.key}</span>
          <span className="ml-1 font-medium text-ink tabular-nums">
            {colors.has(model.key) ? measure.format(model.amount) : strings().usage.tip.priceUnknown}
          </span>
        </span>
      ))}
    </div>
  )
}

const GHOST_HEIGHTS = [35, 60, 45, 80, 50, 30, 65] // percent: a sketch of a week, behind the empty state

/** Before the first model call: a sketch of the chart, and what will fill it. */
export function EmptyUsage() {
  return (
    <div className="mt-6 rounded-xl border border-line bg-surface px-6 pt-9 pb-6 text-center">
      <div className="text-md font-medium">{strings().usage.overview.empty}</div>
      <p className="mt-1 text-sm text-muted">{strings().usage.overview.emptyHint}</p>
      <div className="mt-6 flex h-20 items-end justify-around border-b border-line">
        {GHOST_HEIGHTS.map((height) => (
          <span key={height} className="w-[9%] rounded-t-sm bg-bubble" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  )
}
