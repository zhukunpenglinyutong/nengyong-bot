// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HarnessEvent } from '../shared/bridge'
import type { SkillOffer } from '../shared/skill'
import { createSkills } from './skills'
import { createStore, type Store } from './store'

let dir: string
let events: HarnessEvent[]
let store: Store

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'))
  events = []
  store = createStore(path.join(dir, 'nengyongbot.db'))
  store.syncRoster([
    { id: 'chief', name: 'CEO' },
    { id: 'balance', name: '余额监控' },
    { id: 'release', name: '发版助理' },
  ])
})

const skillsDir = () => path.join(dir, 'skills')
const setup = () => createSkills({ dir: skillsDir(), store, emit: (event) => events.push(event) })

/** A skill folder on this computer, as the user would point a bot at it. */
function folder(name: string, version = '1.0.0', extra: Record<string, string> = {}): string {
  const root = path.join(dir, 'sources', `${name}-${version}`)
  const files = {
    'SKILL.md': `---\nname: ${name}\ndescription: Use ${name}.\nversion: ${version}\n---\n\n# ${name}\nDo it well.`,
    'scripts/run.py': 'print(1)',
    ...extra,
  }
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  return root
}

/** A folder of skills, as the user would point a bot at a collection: each name a skill folder in it. */
function shelf(...names: string[]): string {
  const root = fs.mkdtempSync(path.join(dir, 'shelf-'))
  for (const name of names) fs.cpSync(folder(name), path.join(root, name), { recursive: true })
  return root
}

const namesOf = (offer: SkillOffer) => offer.skills.map((skill) => skill.name)

async function install(skills: ReturnType<typeof setup>, botId: string, name: string, version = '1.0.0') {
  const offer = await skills.offer(botId, botId, folder(name, version))
  skills.answer(botId, offer.offer, [name])
}

describe('an install card', () => {
  it('offers what it read without installing it', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', folder('pdf'))
    expect(offer).toMatchObject({ botId: 'balance', skipped: [] })
    expect(offer.skills).toMatchObject([{ name: 'pdf', version: '1.0.0', scripts: ['scripts/run.py'], replaces: null }])
    expect(store.get().bots.balance?.skills).toEqual([])
    expect(fs.existsSync(path.join(skillsDir(), 'balance', 'pdf'))).toBe(false)
  })

  it('installs on yes: the files in the bot folder, the skill in its brain', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    expect(fs.readFileSync(path.join(skillsDir(), 'balance', 'pdf', 'scripts', 'run.py'), 'utf8')).toBe('print(1)')
    expect(store.get().bots.balance?.skills).toMatchObject([{ name: 'pdf', fileCount: 2, isUserInvoked: false }])
  })

  it('tells the panel of the bot and of the main bot, who sees every bot', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    expect(events.filter((event) => event.kind === 'skills').map((event) => event.botId)).toEqual(['balance', 'chief'])
  })

  it('installs nothing on no', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', folder('pdf'))
    skills.answer('balance', offer.offer, [])
    expect(store.get().bots.balance?.skills).toEqual([])
  })

  it('takes one answer only', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', folder('pdf'))
    skills.answer('balance', offer.offer, [])
    expect(() => skills.answer('balance', offer.offer, ['pdf'])).toThrow('失效')
  })

  it('is answered only in the chat it was shown in', async () => {
    const skills = setup()
    const offer = await skills.offer('chief', 'balance', folder('pdf'))
    expect(() => skills.answer('balance', offer.offer, ['pdf'])).toThrow('失效')
  })

  it('installs only skills it offered', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', folder('pdf'))
    expect(() => skills.answer('balance', offer.offer, ['xlsx'])).toThrow('xlsx')
    expect(store.get().bots.balance?.skills).toEqual([])
  })

  it('says which version it replaces, and replaces it on yes', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf', '1.0.0')
    const offer = await skills.offer('balance', 'balance', folder('pdf', '1.1.0'))
    expect(offer.skills[0]?.replaces).toBe('1.0.0')
    skills.answer('balance', offer.offer, ['pdf'])
    expect(store.get().bots.balance?.skills).toMatchObject([{ name: 'pdf', version: '1.1.0' }])
  })

  it('records a skill only the user calls on, as SKILL.md says', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', folder('grill', '1.0.0', { 'SKILL.md': GRILL }))
    skills.answer('balance', offer.offer, ['grill'])
    expect(store.get().bots.balance?.skills).toMatchObject([{ name: 'grill', isUserInvoked: true }])
  })
})

const GRILL = '---\nname: grill\ndescription: Interview the user.\ndisable-model-invocation: true\n---\nAsk.'

describe('a collection', () => {
  it('offers every skill in it on one card, installing none of them yet', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', shelf('pdf', 'xlsx'))
    expect(namesOf(offer)).toEqual(['pdf', 'xlsx'])
    expect(store.get().bots.balance?.skills).toEqual([])
  })

  it('installs the skills the user ticked, and only those', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', shelf('pdf', 'xlsx', 'docx'))
    skills.answer('balance', offer.offer, ['pdf', 'xlsx'])
    expect(store.get().bots.balance?.skills.map((skill) => skill.name)).toEqual(['pdf', 'xlsx'])
    expect(fs.readdirSync(path.join(skillsDir(), 'balance')).sort()).toEqual(['pdf', 'xlsx'])
  })

  it('lists the skills it cannot install, with why, and still offers the others', async () => {
    const skills = setup()
    const root = shelf('pdf')
    fs.mkdirSync(path.join(root, 'Broken'))
    fs.writeFileSync(path.join(root, 'Broken', 'SKILL.md'), '---\ndescription: x\n---\n')
    const offer = await skills.offer('balance', 'balance', root)
    expect(namesOf(offer)).toEqual(['pdf'])
    expect(offer.skipped).toEqual([{ folder: 'Broken', reason: expect.stringContaining('不合规范') }])
  })

  it('throws, with every reason, when none of its skills can be installed', async () => {
    const root = path.join(dir, 'broken')
    for (const name of ['A', 'B']) {
      fs.mkdirSync(path.join(root, name), { recursive: true })
      fs.writeFileSync(path.join(root, name, 'SKILL.md'), '---\ndescription: x\n---\n')
    }
    await expect(setup().offer('balance', 'balance', root)).rejects.toThrow(/A：.*\n- B：/)
  })

  it('leaves out the skills it marks internal', async () => {
    const root = shelf('pdf', 'helper')
    fs.writeFileSync(
      path.join(root, 'helper', 'SKILL.md'),
      '---\nname: helper\ndescription: x\nmetadata:\n  internal: true\n---\n',
    )
    expect(namesOf(await setup().offer('balance', 'balance', root))).toEqual(['pdf'])
  })

  it('keeps the first of two skills with one name', async () => {
    const root = shelf('pdf')
    fs.cpSync(folder('pdf', '2.0.0'), path.join(root, 'zz', 'pdf'), { recursive: true })
    const offer = await setup().offer('balance', 'balance', root)
    expect(offer.skills).toMatchObject([{ name: 'pdf', version: '1.0.0' }])
  })

  it('refuses more skills on one card than a bot may have', async () => {
    const names = [...Array(151).keys()].map((n) => `s${n}`)
    await expect(setup().offer('balance', 'balance', shelf(...names))).rejects.toThrow('最多 150 个')
  })

  it('installs no more than a bot may have, saying how many more fit', async () => {
    const skills = setup()
    const names = [...Array(149).keys()].map((n) => `s${n}`)
    const first = await skills.offer('balance', 'balance', shelf(...names))
    skills.answer('balance', first.offer, names)
    const second = await skills.offer('balance', 'balance', shelf('pdf', 'xlsx'))
    expect(() => skills.answer('balance', second.offer, ['pdf', 'xlsx'])).toThrow('还能装 1 个')
    expect(store.get().bots.balance?.skills).toHaveLength(149)
  })
})

describe('an upload in the panel', () => {
  it('offers the skills in what the user picked on one card', () => {
    const skills = setup()
    const offer = skills.upload('balance', shelf('pdf', 'xlsx'))
    expect(offer.botId).toBe('balance')
    expect(namesOf(offer)).toEqual(['pdf', 'xlsx'])
    expect(store.get().bots.balance?.skills).toEqual([])
  })

  it('installs the ones ticked without a word in the chat', () => {
    const skills = setup()
    const offer = skills.upload('balance', shelf('pdf', 'xlsx'))
    skills.answerUpload('balance', offer.offer, ['xlsx'])
    expect(store.get().bots.balance?.skills).toMatchObject([{ name: 'xlsx' }])
    expect(store.history('balance')).toEqual([])
  })

  it('is answered only in the panel of the bot it was uploaded to', () => {
    const skills = setup()
    const offer = skills.upload('balance', shelf('pdf'))
    expect(() => skills.answerUpload('release', offer.offer, ['pdf'])).toThrow('重新上传')
    expect(() => skills.answer('balance', offer.offer, ['pdf'])).toThrow('失效')
  })

  it('refuses a bot there is not', () => {
    expect(() => setup().upload('nobody', shelf('pdf'))).toThrow('nobody')
  })

  it('does not answer a card in the chat', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', folder('pdf'))
    expect(() => skills.answerUpload('balance', offer.offer, ['pdf'])).toThrow('重新上传')
  })
})

it('removes a skill and its folder', async () => {
  const skills = setup()
  await install(skills, 'balance', 'pdf')
  skills.remove('balance', ['pdf'])
  expect(store.get().bots.balance?.skills).toEqual([])
  expect(fs.existsSync(path.join(skillsDir(), 'balance', 'pdf'))).toBe(false)
})

it('removes a whole collection at once, and none of it when one of the names is not there', async () => {
  const skills = setup()
  const offer = await skills.offer('balance', 'balance', shelf('pdf', 'xlsx', 'docx'))
  skills.answer('balance', offer.offer, ['pdf', 'xlsx', 'docx'])
  expect(() => skills.remove('balance', ['pdf', 'nope'])).toThrow('nope')
  expect(store.get().bots.balance?.skills).toHaveLength(3)
  skills.remove('balance', ['pdf', 'xlsx'])
  expect(store.get().bots.balance?.skills.map((skill) => skill.name)).toEqual(['docx'])
  expect(fs.readdirSync(path.join(skillsDir(), 'balance'))).toEqual(['docx'])
})

it('records the folder the user pointed at as where a skill in it came from', async () => {
  const skills = setup()
  const root = shelf('pdf', 'xlsx')
  const offer = await skills.offer('balance', 'balance', root)
  expect(offer.skills.map((skill) => skill.source)).toEqual([
    { kind: 'local', root, path: path.join(root, 'pdf') },
    { kind: 'local', root, path: path.join(root, 'xlsx') },
  ])
})

it('clears what an install cut short left behind', () => {
  fs.mkdirSync(path.join(skillsDir(), '.installing-k1'), { recursive: true })
  setup()
  expect(fs.readdirSync(skillsDir())).toEqual([])
})

describe('the panel', () => {
  it('lists a bot its own skills, and the main bot every bot', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    await install(skills, 'chief', 'brand')
    expect(skills.views('balance').map((view) => `${view.botId}/${view.name}`)).toEqual(['balance/pdf'])
    expect(skills.views('chief').map((view) => `${view.botId}/${view.name}`)).toEqual(['chief/brand', 'balance/pdf'])
  })

  it('counts the times a task opened it, the main bot included', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    const task = { requestedBy: 'chief', source: { kind: 'chat' as const }, title: 't', status: 'done' as const }
    store.saveTask({ ...task, id: 't1', botId: 'balance', statusText: '', createdAt: 1 })
    store.saveTask({ ...task, id: 't2', botId: 'chief', statusText: '', createdAt: 2 })
    store.append('t1', { kind: 'tool', name: 'use_skill', input: { skill: 'pdf' }, output: { used: 'balance/pdf' } })
    store.append('t2', { kind: 'tool', name: 'use_skill', input: {}, output: { used: 'balance/pdf' } })
    expect(skills.views('balance')).toMatchObject([{ name: 'pdf', uses: 2, lastUsedAt: expect.any(Number) }])
  })
})

describe('use_skill', () => {
  it('gives a task the instructions without the front matter, and where the files are', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    expect(skills.use('balance', 'pdf')).toEqual({
      used: 'balance/pdf',
      folder: path.join(skillsDir(), 'balance', 'pdf'),
      instructions: '# pdf\nDo it well.',
      files: ['SKILL.md', 'scripts/run.py'],
    })
  })

  it('keeps a bot to its own skills, naming the ones it has', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    await install(skills, 'release', 'notes')
    expect(() => skills.use('release', 'balance/pdf')).toThrow('你能用的：notes')
  })

  it("lets the main bot open another bot's skill by its plain name when only one has it", async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    expect(skills.use('chief', 'pdf').used).toBe('balance/pdf')
  })

  it('asks the main bot to say whose, when several bots have the name', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    await install(skills, 'release', 'pdf')
    expect(() => skills.use('chief', 'pdf')).toThrow('release/pdf')
    expect(skills.use('chief', 'release/pdf').used).toBe('release/pdf')
  })
})

describe('the files dialog', () => {
  it('lists SKILL.md first', async () => {
    const skills = setup()
    const offer = await skills.offer('balance', 'balance', folder('pdf', '1.0.0', { 'a.md': 'a' }))
    const ref = { kind: 'offer' as const, offer: offer.offer, name: 'pdf' }
    expect(skills.files(ref).map((file) => file.path)).toEqual(['SKILL.md', 'a.md', 'scripts/run.py'])
    expect(skills.files(ref).find((file) => file.path === 'scripts/run.py')?.isScript).toBe(true)
  })

  it('reads a file as text, and nothing for a binary one', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    fs.writeFileSync(path.join(skillsDir(), 'balance', 'pdf', 'logo.png'), Buffer.from([137, 80, 0, 1]))
    const ref = { kind: 'installed' as const, botId: 'balance', name: 'pdf' }
    expect(skills.file(ref, 'scripts/run.py')).toBe('print(1)')
    expect(skills.file(ref, 'logo.png')).toBeNull()
  })

  it('reads only files the skill lists', async () => {
    const skills = setup()
    await install(skills, 'balance', 'pdf')
    const ref = { kind: 'installed' as const, botId: 'balance', name: 'pdf' }
    expect(() => skills.file(ref, '../../nengyongbot.db')).toThrow('没有')
  })
})
