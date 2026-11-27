import { use } from 'react'
import type { UsageRecord } from '../../shared/usage'
import { BotAvatar } from '../bot/BotAvatar'
import { Icon } from '../ui/Icon'
import { Segmented } from '../ui/Segmented'
import { MeasureContext } from './measure'
import { ModelLogo } from './ModelLogo'
import { ModelSwatch } from './ModelSwatch'
import { byPeriod, type Periods } from './periods'
import { UsageDetail } from './UsageDetail'
import { shareLabel, tokenLabel, valueLabel } from './usageFormat'
import {
  type Dimension,
  type Group,
  groupBy,
  isUnpricedOnly,
  KEY_OF,
  type Measured,
  SOURCES,
  type Totals,
  totalsOf,
  type UsageNames,
} from './usageStats'
import { strings } from '../../shared/strings'

const DIMENSION_LABELS: Record<Dimension, string> = {
  bot: strings().usage.breakdown.bot,
  source: strings().usage.breakdown.source,
  model: strings().usage.breakdown.model,
}

interface Props {
  records: Measured[] // of the range
  periods: Periods
  dimensions: Dimension[]
  dimension: Dimension
  onDimension: (dimension: Dimension) => void
  selected: string | null // the open row
  onSelect: (key: string | null) => void
  pointed: string | null
  onPoint: (key: string | null) => void
  colors: Map<string, string>
  names: UsageNames
}

/** Where it went: a row per bot, source or model, the largest first; a row opens to what it went on. */
export function UsageBreakdown({ records, dimensions, dimension, onDimension, selected, onSelect, ...rows }: Props) {
  const total = totalsOf(records)
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm text-muted">{strings().usage.breakdown.title}</h3>
        <Segmented
          label={strings().usage.breakdown.byWhat}
          options={dimensions.map((id) => ({ id, label: DIMENSION_LABELS[id] }))}
          value={dimension}
          onChange={onDimension}
        />
      </div>
      <ul className="overflow-hidden rounded-lg border border-line bg-surface">
        {groupBy(records, KEY_OF[dimension]).map((group) => (
          <Row
            key={group.key}
            group={group}
            total={total}
            dimension={dimension}
            isOpen={selected === group.key}
            onToggle={() => onSelect(selected === group.key ? null : group.key)}
            {...rows}
          />
        ))}
      </ul>
    </section>
  )
}

interface RowProps extends Pick<Props, 'periods' | 'pointed' | 'onPoint' | 'colors' | 'names' | 'dimension'> {
  group: Group
  total: Totals
  isOpen: boolean
  onToggle: () => void
}

function Row({ group, total, dimension, isOpen, onToggle, periods, pointed, onPoint, colors, names }: RowProps) {
  const measure = use(MeasureContext)
  const isOn = pointed === group.key
  const color = dimension === 'model' ? colors.get(group.key) : undefined
  return (
    <li className="not-first:border-t not-first:border-line">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        onPointerEnter={() => onPoint(group.key)}
        onPointerLeave={() => onPoint(null)}
        onFocus={() => onPoint(group.key)}
        onBlur={() => onPoint(null)}
        className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto_minmax(76px,auto)] items-center gap-x-3.5 px-4 py-2.5 text-left"
      >
        <RowIcon dimension={dimension} rowKey={group.key} names={names} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-md">
            {dimension === 'model' && <ModelSwatch color={color} />}
            <span className="truncate data-mono:font-mono" data-mono={dimension === 'model' || undefined}>
              {names.nameOf(dimension, group.key)}
            </span>
          </span>
          <span className="block truncate text-xs text-muted tabular-nums">{rowSub(group, dimension)}</span>
        </span>
        <Spark group={group} periods={periods} color={isOn ? (color ?? 'var(--color-accent)') : undefined} />
        <span className="text-right whitespace-nowrap tabular-nums">
          <span className="block text-md font-medium">{valueLabel(group, measure)}</span>
          <span className="block text-xs text-muted">
            {isUnpricedOnly(group) ? strings().usage.tip.priceUnknown : shareLabel(group.amount, total.amount)}
          </span>
        </span>
      </button>
      {isOpen && <UsageDetail group={group} dimension={dimension} colors={colors} names={names} />}
    </li>
  )
}

function RowIcon({ dimension, rowKey, names }: { dimension: Dimension; rowKey: string; names: UsageNames }) {
  switch (dimension) {
    case 'bot':
      return <BotAvatar bot={names.botOf(rowKey)} size={32} />
    case 'model':
      return <ModelLogo model={rowKey} />
    case 'source':
      return (
        <span className="grid size-8 place-items-center rounded-full bg-bubble text-soft">
          <Icon name={SOURCES[rowKey].icon} size={16} />
        </span>
      )
    default:
      return dimension satisfies never
  }
}

function rowSub(group: Group, dimension: Dimension): string {
  const runsOf = (kind: UsageRecord['source']['kind']) =>
    group.records.filter((record) => record.source.kind === kind).reduce((sum, record) => sum + record.runs, 0)
  const bots = new Set(group.records.map((record) => record.botId)).size
  switch (dimension) {
    case 'bot':
      return [
        [runsOf('chat'), strings().usage.breakdown.chatTurns(runsOf('chat'))],
        [runsOf('routine'), strings().usage.breakdown.routineRuns(runsOf('routine'))],
        [runsOf('bot'), strings().usage.breakdown.tasksForBots(runsOf('bot'))],
      ]
        .flatMap(([count, label]) => (count ? [label] : []))
        .join(' · ')
    case 'source':
      return `${SOURCES[group.key].runs(group.runs)} · ${strings().usage.breakdown.bots(bots)}`
    case 'model':
      return strings().usage.breakdown.modelSub(tokenLabel(group.tokens), bots)
    default:
      return dimension satisfies never
  }
}

/** The row's own day-by-day (or hour-by-hour) rhythm, scaled to its own busiest one: its shape, not its size. */
function Spark({ group, periods, color }: { group: Group; periods: Periods; color: string | undefined }) {
  const bars = byPeriod(periods, group.records).map(({ period, totals }) => ({
    period,
    value: isUnpricedOnly(group) ? totals.tokens : totals.amount,
  }))
  const max = Math.max(...bars.map((bar) => bar.value)) || 1
  const [barWidth, gap, height] = bars.length <= 7 ? [6, 4, 22] : [2, 1, 22]
  return (
    <svg width={bars.length * (barWidth + gap) - gap} height={height} aria-hidden="true">
      {bars.map(({ period, value }, index) =>
        !period.isCounted ? null : (
          <rect
            key={period.id}
            x={index * (barWidth + gap)}
            y={height - (value ? Math.max((value / max) * height, 2) : 1)}
            width={barWidth}
            height={value ? Math.max((value / max) * height, 2) : 1}
            rx={Math.min(barWidth / 2, 1.5)}
            className="fill-muted/35 transition-colors"
            style={color ? { fill: color } : undefined}
          />
        ),
      )}
    </svg>
  )
}
