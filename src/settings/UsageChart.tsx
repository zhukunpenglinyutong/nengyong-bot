import { use, useRef, useState } from 'react'
import { useElementSize } from '../ui/useElementSize'
import { ColumnTip } from './ColumnTip'
import { MeasureContext } from './measure'
import { byPeriod, type Period, type Periods } from './periods'
import {
  type Dimension,
  KEY_OF,
  type Measured,
  type Segment,
  segmentsOf,
  type Totals,
  type UsageNames,
} from './usageStats'
import { strings } from '../../shared/strings'

const HEIGHT_PX = 196
const TOP_PX = 12
const BOTTOM_PX = 26 // the day labels
const RIGHT_PX = 44 // the scale's ticks
const GAP_PX = 2 // the surface left between stacked segments
const RADIUS_PX = 5
const WEEK_DAYS = 7

interface Props {
  periods: Periods
  records: Measured[] // of these periods
  colors: Map<string, string>
  hasSeveralModels: boolean // then a column's tip splits it by model
  dimension: Dimension
  pointed: string | null // a key of `dimension`
  names: UsageNames
}

export interface Column {
  period: Period
  records: Measured[]
  totals: Totals
  segments: Segment[]
}

/** The measure per day, or per hour of today, each column stacked by model; while a row of the list is pointed at, its part keeps its colours and the rest fades. */
export function UsageChart({ periods, records, colors, hasSeveralModels, dimension, pointed, names }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementSize(ref)?.width ?? 0
  const [hovered, setHovered] = useState<number | null>(null)
  const isPointed = pointed === null ? null : (record: Measured) => KEY_OF[dimension](record) === pointed
  const columns = byPeriod(periods, records).map(
    (part): Column => ({ ...part, segments: segmentsOf(part.records, colors, isPointed) }),
  )
  const layout = layoutOf(columns, width)
  const column = hovered === null ? undefined : columns[hovered]
  return (
    <div ref={ref} className="relative mt-4 h-[196px]">
      {width > 0 && <Plot columns={columns} layout={layout} periods={periods} hovered={hovered} onHover={setHovered} />}
      {column && hovered !== null && (
        <ColumnTip
          column={column}
          place={tipPlace(hovered, layout)}
          lineDimension={hasSeveralModels ? 'model' : dimension}
          dimension={dimension}
          pointed={pointed}
          colors={colors}
          names={names}
        />
      )}
    </div>
  )
}

interface Layout {
  plotWidth: number
  slot: number
  barWidth: number
  y: (amount: number) => number
  step: number
  ticks: number[]
  average: number
  averageFrom: number
  averageTo: number
}

function layoutOf(columns: Column[], width: number): Layout {
  const plotWidth = Math.max(width - RIGHT_PX, 0)
  const bottom = HEIGHT_PX - BOTTOM_PX
  const step = niceStep(Math.max(...columns.map((column) => column.totals.amount), 0.01) / 3)
  const ceiling = Math.ceil(Math.max(...columns.map((column) => column.totals.amount), 0.01) / step) * step
  const y = (amount: number) => bottom - (amount / ceiling) * (bottom - TOP_PX)
  const slot = plotWidth / columns.length
  const counted = columns.filter((column) => column.period.isCounted)
  const average = counted.reduce((sum, column) => sum + column.totals.amount, 0) / Math.max(counted.length, 1)
  const ticks = Array.from({ length: Math.round(ceiling / step) }, (_, index) => (index + 1) * step)
  return {
    plotWidth,
    slot,
    barWidth: columns.length <= WEEK_DAYS ? Math.min(36, slot * 0.44) : Math.max(4, slot * 0.56),
    y,
    step,
    ticks: ticks.filter((tick) => Math.abs(y(tick) - y(average)) > 18), // the 日均 label takes their place nearby
    average,
    averageFrom: columns.findIndex((column) => column.period.isCounted) * slot,
    averageTo: (columns.findLastIndex((column) => column.period.isCounted) + 1) * slot,
  }
}

// the tip sits beside the column, on whichever side has room
function tipPlace(index: number, layout: Layout) {
  const isLeft = (index + 0.5) * layout.slot > layout.plotWidth / 2
  return isLeft
    ? { right: layout.plotWidth + RIGHT_PX - index * layout.slot + 6, top: TOP_PX - 8 }
    : { left: (index + 1) * layout.slot + 6, top: TOP_PX - 8 }
}

interface PlotProps {
  columns: Column[]
  layout: Layout
  periods: Periods
  hovered: number | null
  onHover: (index: number | null) => void
}

function Plot({ columns, layout, periods, hovered, onHover }: PlotProps) {
  const measure = use(MeasureContext)
  const { plotWidth, slot, y } = layout
  const bottom = y(0)
  return (
    <svg
      width={plotWidth + RIGHT_PX}
      height={HEIGHT_PX}
      role="img"
      aria-label={strings().usage.chart.average(
        periods.each,
        measure.label,
        periods.average,
        measure.format(layout.average),
      )}
      className="block overflow-visible"
      onPointerLeave={() => onHover(null)}
    >
      {hovered !== null && (
        <rect
          x={hovered * slot + 2}
          y={TOP_PX - 6}
          width={slot - 4}
          height={bottom - TOP_PX + 6}
          rx={6}
          className="fill-bubble"
        />
      )}
      {layout.ticks.map((tick) => (
        <g key={tick}>
          <line x1={0} x2={plotWidth} y1={y(tick)} y2={y(tick)} strokeDasharray="2 3" className="stroke-line" />
          <text x={plotWidth + 8} y={y(tick) + 4} className="fill-muted text-xs tabular-nums">
            {measure.tick(tick, layout.step)}
          </text>
        </g>
      ))}
      <line x1={0} x2={plotWidth} y1={bottom} y2={bottom} className="stroke-line" />
      {columns.map((column, index) => (
        <ColumnBar
          key={column.period.id}
          column={column}
          x={index * slot + (slot - layout.barWidth) / 2}
          width={layout.barWidth}
          y={y}
        />
      ))}
      {layout.average > 0 && (
        <g>
          <line
            x1={layout.averageFrom}
            x2={layout.averageTo}
            y1={y(layout.average)}
            y2={y(layout.average)}
            strokeDasharray="4 3"
            className="stroke-soft opacity-70"
          />
          <text x={plotWidth + 8} y={y(layout.average) + 4} className="fill-soft text-xs">
            {periods.average}
          </text>
        </g>
      )}
      {columns.map(({ period }, index) =>
        period.axisLabel === null ? null : (
          <text
            key={period.id}
            x={(index + 0.5) * slot}
            y={HEIGHT_PX - 6}
            textAnchor="middle"
            className="fill-muted text-xs data-now:fill-ink"
            data-now={period.isNow || undefined}
          >
            {period.axisLabel}
          </text>
        ),
      )}
      {columns.map((column, index) => (
        <rect
          key={column.period.id}
          x={index * slot}
          y={0}
          width={slot}
          height={HEIGHT_PX}
          fill="transparent"
          onPointerEnter={() => onHover(index)}
        />
      ))}
    </svg>
  )
}

function ColumnBar({
  column,
  x,
  width,
  y,
}: {
  column: Column
  x: number
  width: number
  y: (amount: number) => number
}) {
  const base = y(0)
  // a day spent only on models with no price still happened: a dashed stub says so instead of an empty slot
  if (!column.totals.amount && column.totals.unpriced)
    return (
      <rect
        x={x + 0.5}
        y={base - 14}
        width={width - 1}
        height={13.5}
        rx={4}
        fill="none"
        strokeDasharray="3 2"
        className="stroke-muted"
      />
    )
  const visible = column.segments.filter((segment) => base - y(segment.amount) >= 0.5)
  const tops = visible.reduce<number[]>(
    (list, segment) => [...list, (list.at(-1) ?? base) - (base - y(segment.amount))],
    [],
  )
  return (
    <g>
      {visible.map((segment, index) => {
        const height = Math.max(base - y(segment.amount) - (index ? GAP_PX : 0), 1)
        const fill = segment.isFaded ? `color-mix(in srgb, ${segment.color} 24%, var(--color-surface))` : segment.color
        const key = `${segment.model}-${segment.isFaded}`
        return index === visible.length - 1 ? (
          <path key={key} d={roundedTop(x, tops[index], width, height)} style={{ fill }} />
        ) : (
          <rect key={key} x={x} y={tops[index]} width={width} height={height} style={{ fill }} />
        )
      })}
    </g>
  )
}

function roundedTop(x: number, y: number, width: number, height: number) {
  const radius = Math.min(RADIUS_PX, width / 2, height)
  return `M${x},${y + height}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${y + height}Z`
}

function niceStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map((multiple) => multiple * power).find((candidate) => candidate >= raw) ?? raw
}
