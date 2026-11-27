import type { Entry } from '../../shared/bridge'
import type { MiniApp } from '../../shared/miniApp'
import { strings } from '../../shared/strings'

const words = strings().demoApps

const MINUTE_MS = 60_000
const loadedAt = Date.now()
const minutesAgo = (minutes: number) => loadedAt - minutes * MINUTE_MS

export const DEMO_MINI_APP_BOT = 'content'

const STYLE = `<style>
  body { margin: 0; padding: 18px 16px 24px; background: #f6f6f8; color: #1d1d1f; font: 14px/1.5 -apple-system, "PingFang SC", sans-serif; }
  h1 { margin: 0; font-size: 24px; } .sub { margin: 2px 0 0; color: #8a8a8e; font-size: 13px; }
  .card { margin-top: 12px; padding: 14px; border-radius: 14px; background: #fff; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  button { font: inherit; border: 0; border-radius: 8px; background: #f0f0f2; padding: 4px 10px; cursor: pointer; }
  button[aria-pressed="true"] { background: #1d1d1f; color: #fff; }
</style>`

const REVENUE_DATA = {
  total: 12_840_000,
  weeks: [
    [words.revenue.week1, 3_460_000],
    [words.revenue.week2, 3_820_000],
    [words.revenue.week3, 5_560_000],
  ],
  months: [
    [words.revenue.august, 12_600_000],
    [words.revenue.september, 14_900_000],
    [words.revenue.october, 17_100_000],
    [words.revenue.november, 12_840_000],
  ],
  channels: [
    [words.revenue.sponsors, 6_800_000],
    [words.revenue.paidColumn, 3_260_000],
    [words.revenue.ads, 1_760_000],
    [words.revenue.tips, 1_020_000],
  ],
}

const revenuePage = (hasMonths: boolean) => `<!doctype html><html><head><meta charset="utf-8">${STYLE}
<style>
  .total { font-size: 30px; font-weight: 700; } .up { color: #1baf7a; font-size: 13px; }
  .bars { display: flex; align-items: flex-end; gap: 10px; height: 130px; margin-top: 20px; }
  .bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 11px; color: #6b6b70; }
  .bar i { display: block; width: 60%; border-radius: 6px 6px 0 0; background: #2f6fed; }
  .channel { padding: 10px 0; border-top: 1px solid #f0f0f2; } .channel:first-child { border-top: 0; }
</style></head><body>
  <h1>${words.revenue.title}</h1><p class="sub">${words.revenue.syncedAt}</p>
  <div class="card"><div class="total" id="total"></div><div class="up">${words.revenue.growth}</div></div>
  <div class="card"><div class="row"><b id="title">${words.revenue.weekly}</b>${hasMonths ? `<span><button id="week" aria-pressed="true">${words.revenue.byWeek}</button> <button id="month" aria-pressed="false">${words.revenue.byMonth}</button></span>` : ''}</div><div class="bars" id="bars"></div></div>
  <div class="card" id="channels"></div>
<script>
  let view = 'week'
  function render(data) {
    document.getElementById('total').textContent = '¥' + data.total.toLocaleString()
    const rows = view === 'week' ? data.weeks : data.months
    const max = Math.max(...rows.map((row) => row[1]))
    document.getElementById('title').textContent = view === 'week' ? '${words.revenue.weekly}' : '${words.revenue.monthly}'
    document.getElementById('bars').innerHTML = rows.map((row) => '<div class="bar">' + Number((row[1] / ${words.revenue.barDivisor}).toFixed(1)) + '${words.revenue.barUnit}<i style="height:' + (row[1] / max) * 80 + '%"></i>' + row[0] + '</div>').join('')
    document.getElementById('channels').innerHTML = data.channels.map((row) => '<div class="row channel"><span>' + row[0] + '</span><b>¥' + row[1].toLocaleString() + '</b></div>').join('')
  }
  for (const id of ['week', 'month']) {
    const button = document.getElementById(id)
    if (button) button.onclick = () => { view = id; document.querySelectorAll('[aria-pressed]').forEach((each) => each.setAttribute('aria-pressed', String(each.id === id))); render(nengyongbot.data) }
  }
  nengyongbot.onData(render)
  render(nengyongbot.data)
</script></body></html>`

const DAILY_DATA = {
  date: words.daily.date,
  kpis: [
    [words.daily.newFollowers, '+312'],
    [words.daily.reads, words.daily.readsCount],
    [words.daily.shares, '640'],
    [words.daily.revenue, '¥420,000'],
  ],
  done: [words.daily.sentWeekly, words.daily.answeredComments],
  decide: words.daily.decide,
  decision: null,
}

const DAILY_PAGE = `<!doctype html><html><head><meta charset="utf-8">${STYLE}
<style>
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
  .kpi { padding: 12px; border-radius: 14px; background: #fff; } .kpi b { display: block; font-size: 21px; }
  li { margin: 4px 0; } .decide { background: #fff7ef; }
</style></head><body>
  <h1 id="date"></h1><p class="sub">${words.daily.madeAt}</p>
  <div class="kpis" id="kpis"></div>
  <div class="card"><b>${words.daily.doneToday}</b><ul id="done"></ul></div>
  <div class="card decide"><b>${words.daily.yourCall}</b><p id="decide"></p><div id="choice"></div></div>
<script>
  function render(data) {
    document.getElementById('date').textContent = data.date
    document.getElementById('kpis').innerHTML = data.kpis.map((kpi) => '<div class="kpi">' + kpi[0] + '<b>' + kpi[1] + '</b></div>').join('')
    document.getElementById('done').innerHTML = data.done.map((line) => '<li>' + line + '</li>').join('')
    document.getElementById('decide').textContent = data.decide
    const choice = document.getElementById('choice')
    if (data.decision) { choice.textContent = ${JSON.stringify(words.daily.chose('%s'))}.replace('%s', data.decision); return }
    choice.innerHTML = ${JSON.stringify(`<button data-pick="${words.daily.addIt}">${words.daily.addIt}</button> <button data-pick="${words.daily.skipIt}">${words.daily.skipIt}</button>`)}
    choice.querySelectorAll('button').forEach((button) => button.onclick = () => {
      const decision = button.dataset.pick
      nengyongbot.save({ ...data, decision })
      nengyongbot.ask(${JSON.stringify(words.daily.ask('%s'))}.replace('%s', decision))
      render({ ...data, decision })
    })
  }
  nengyongbot.onData(render)
  render(nengyongbot.data)
</script></body></html>`

export const DEMO_MINI_APPS: MiniApp[] = [
  {
    id: 'revenue',
    name: words.revenue.name,
    icon: 'chart',
    color: 'sky',
    versions: [
      {
        version: 1,
        change: words.revenue.firstVersion,
        at: minutesAgo(3 * 24 * 60),
      },
      {
        version: 2,
        change: words.revenue.monthsVersion,
        at: minutesAgo(26 * 60),
      },
    ],
    dataAt: minutesAgo(80),
  },
  {
    id: 'daily',
    name: words.daily.name,
    icon: 'doc',
    color: 'tangerine',
    versions: [
      {
        version: 1,
        change: words.daily.firstVersion,
        at: minutesAgo(2 * 24 * 60),
      },
    ],
    dataAt: minutesAgo(81),
  },
]

/** What the demo serves for each mini app: its pages by version, and its data. */
export const DEMO_MINI_APP_FILES: Record<string, { pages: Record<number, string>; data: unknown }> = {
  revenue: { pages: { 1: revenuePage(false), 2: revenuePage(true) }, data: REVENUE_DATA },
  daily: { pages: { 1: DAILY_PAGE }, data: DAILY_DATA },
}

export const DEMO_MINI_APP_TRANSCRIPT: Entry[] = [
  {
    seq: 1,
    at: minutesAgo(27 * 60),
    kind: 'user',
    text: words.transcript.askMonths,
  },
  {
    seq: 2,
    at: minutesAgo(26 * 60),
    kind: 'bot',
    text: words.transcript.monthsDone,
  },
  {
    seq: 3,
    at: minutesAgo(81),
    kind: 'bot',
    text: words.transcript.dailyReady,
  },
]
