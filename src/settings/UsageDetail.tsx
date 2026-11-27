import { type ReactNode, use } from 'react'
import type { UsageRecord } from '../../shared/usage'
import { type Measure, MeasureContext } from './measure'
import { ModelSwatch } from './ModelSwatch'
import { tokenLabel, valueLabel } from './usageFormat'
import { type Dimension, type Group, groupBy, type UsageNames } from './usageStats'
import { strings } from '../../shared/strings'

interface Props {
  group: Group
  dimension: Dimension
  colors: Map<string, string>
  names: UsageNames
}

const sourceKey = (record: UsageRecord) => JSON.stringify(record.source)

/** What an open row went on: a bot's sources, and its models when it used several; a source's bots; a model's bots. */
export function UsageDetail({ group, dimension, colors, names }: Props) {
  const measure = use(MeasureContext)
  return (
    <div className="flex flex-col gap-0.5 pr-4 pb-3.5 pl-[62px]">
      {linesOf(group, dimension, colors, names, measure)}
    </div>
  )
}

function linesOf(
  group: Group,
  dimension: Dimension,
  colors: Map<string, string>,
  names: UsageNames,
  measure: Measure,
): ReactNode {
  const botName = (id: string) => names.nameOf('bot', id)
  switch (dimension) {
    case 'bot':
      return (
        <>
          {groupBy(group.records, sourceKey).map((part) => (
            <Line key={part.key} group={part} {...botSourceLabel(part, botName, measure)} />
          ))}
          <ModelLines group={group} colors={colors} />
        </>
      )
    case 'source':
      return groupBy(group.records, (record) => `${record.botId}|${sourceKey(record)}`).map((part) => (
        <Line key={part.key} group={part} {...sourceBotLabel(part, botName)} />
      ))
    case 'model':
      return groupBy(group.records, (record) => record.botId).map((part) => (
        <Line
          key={part.key}
          group={part}
          label={botName(part.key)}
          meta={strings().usage.format.tokens(tokenLabel(part.tokens))}
        />
      ))
    default:
      return dimension satisfies never
  }
}

function botSourceLabel(
  part: Group,
  botName: (id: string) => string,
  measure: Measure,
): { label: string; meta: string } {
  const source = part.records[0]?.source ?? { kind: 'chat' }
  switch (source.kind) {
    case 'chat':
      return { label: strings().usage.detail.chat, meta: strings().usage.counts.turns(part.runs) }
    case 'routine': {
      const each = part.amount && measure.kind !== 'runs' ? measure.format(part.amount / part.runs) : null
      return {
        label: strings().usage.detail.routine(source.name),
        meta: strings().usage.detail.routineRuns(part.runs, each),
      }
    }
    case 'bot':
      return {
        label: strings().usage.detail.fromBot(botName(source.from)),
        meta: strings().usage.counts.tasksShort(part.runs),
      }
    default:
      return source satisfies never
  }
}

function sourceBotLabel(part: Group, botName: (id: string) => string): { label: string; meta: string } {
  const record = part.records[0]
  if (!record) return { label: '', meta: '' }
  const { botId, source } = record
  switch (source.kind) {
    case 'chat':
      return { label: botName(botId), meta: strings().usage.counts.turns(part.runs) }
    case 'routine':
      return {
        label: strings().usage.detail.routineOfBot(source.name, botName(botId)),
        meta: strings().usage.counts.runs(part.runs),
      }
    case 'bot':
      return {
        label: `${botName(source.from)} → ${botName(botId)}`,
        meta: strings().usage.counts.tasksShort(part.runs),
      }
    default:
      return source satisfies never
  }
}

/** A bot on more than one model: what each of them cost it. */
function ModelLines({ group, colors }: { group: Group; colors: Map<string, string> }) {
  const models = groupBy(group.records, (record) => record.model)
  if (models.length < 2) return null
  return (
    <>
      <div className="mt-2.5 border-t border-line pt-2.5 text-xs text-muted">
        {strings().usage.detail.modelCount(models.length)}
      </div>
      {models.map((model) => (
        <Line
          key={model.key}
          group={model}
          label={
            <span className="flex items-center gap-1.5">
              <ModelSwatch color={colors.get(model.key)} />
              <span className="font-mono">{model.key}</span>
            </span>
          }
          meta={strings().usage.format.tokens(tokenLabel(model.tokens))}
        />
      ))}
    </>
  )
}

function Line({ group, label, meta }: { group: Group; label: ReactNode; meta: string }) {
  const measure = use(MeasureContext)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_76px] items-baseline gap-3.5 py-1 text-sm text-soft">
      <span className="truncate">{label}</span>
      <span className="text-xs text-muted tabular-nums">{meta}</span>
      <span className="text-right text-ink tabular-nums">{valueLabel(group, measure)}</span>
    </div>
  )
}
