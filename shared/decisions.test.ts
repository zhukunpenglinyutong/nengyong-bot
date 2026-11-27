import { expect, it } from 'vitest'
import type { Entry } from './bridge'
import { pendingDecisions } from './decisions'
import { SKILL_OFFER_TTL_MS } from './skill'

const NOW = Date.parse('2026-11-27T10:00:00+08:00')
const tool = (seq: number, name: string, output: unknown, at = NOW): Entry => ({
  seq,
  at,
  kind: 'tool',
  name,
  input: {},
  output,
})
const dutyCard = (seq: number, offer: string, botId = 'writer') =>
  tool(seq, 'propose_duty', {
    offer,
    botId,
    baseVersion: 0,
    plan: { purpose: '让公众号每周更新', objectives: [], outOfScope: [] },
    changes: [],
    isReviewOn: true,
  })
const installCard = (seq: number, offer: string, at = NOW) =>
  tool(
    seq,
    'install_skill',
    {
      offer,
      botId: 'writer',
      skills: [
        {
          name: 'xlsx',
          description: '读写 Excel',
          source: { kind: 'github', repo: 'a/b', path: 'xlsx', ref: 'main' },
          fileCount: 3,
          scripts: [],
          isUserInvoked: false,
          bytes: 100,
          replaces: null,
        },
      ],
      skipped: [],
    },
    at,
  )
const question = (seq: number) => tool(seq, 'ask_user', { question: '现在补一次吗？', answers: ['补', '不补'] })
const user = (seq: number): Entry => ({ seq, at: NOW, kind: 'user', text: '好' })
const seqs = (entries: Entry[]) => pendingDecisions(entries, NOW).map((decision) => decision.seq)

it('waits on a duty card until it is answered', () => {
  const answer: Entry = { seq: 2, at: NOW, kind: 'duty-answer', offer: 'd1', botId: 'writer', isAccepted: false }
  expect(seqs([dutyCard(1, 'd1')])).toEqual([1])
  expect(seqs([dutyCard(1, 'd1'), answer])).toEqual([])
})

it('drops a duty card once a newer one comes for the same bot, and keeps cards for other bots', () => {
  expect(seqs([dutyCard(1, 'd1'), dutyCard(2, 'd2'), dutyCard(3, 'd3', 'chief')])).toEqual([2, 3])
})

it('drops an install card once it is answered or too old to install', () => {
  const answer: Entry = { seq: 2, at: NOW, kind: 'skill-answer', offer: 'k1', botId: 'writer', names: [] }
  expect(seqs([installCard(1, 'k1')])).toEqual([1])
  expect(seqs([installCard(1, 'k1'), answer])).toEqual([])
  expect(seqs([installCard(1, 'k1', NOW - SKILL_OFFER_TTL_MS)])).toEqual([])
})

it('waits on a question until the user writes anything after it', () => {
  expect(seqs([user(1), question(2)])).toEqual([2])
  expect(seqs([question(1), user(2)])).toEqual([])
})

it('lists the asks oldest first whatever order the entries come in', () => {
  expect(seqs([question(5), dutyCard(2, 'd1'), installCard(3, 'k1')])).toEqual([2, 3, 5])
})

it('ignores tool records that are not asks, and asks whose output does not parse', () => {
  expect(seqs([tool(1, 'remember', { saved: 'u1' }), tool(2, 'ask_user', { error: '参数不对' })])).toEqual([])
})
