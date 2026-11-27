import { describe, expect, it } from 'vitest'
import { checkPackage, checkRelativePath, frontmatter, isJunk, skillBody } from './skillPackage'

const skillMd = (head: string, body = '# Guide') => Buffer.from(`---\n${head}\n---\n\n${body}\n`)

describe('frontmatter', () => {
  it('reads plain values', () => {
    expect(frontmatter('---\nname: pdf\ndescription: Use it for PDFs.\n---\n# x')).toEqual({
      name: 'pdf',
      description: 'Use it for PDFs.',
    })
  })

  it('unquotes a double-quoted value and its escapes', () => {
    expect(frontmatter('---\ndescription: "Say \\"hi\\" \\\\ there"\n---\n').description).toBe('Say "hi" \\ there')
  })

  it('unquotes a single-quoted value', () => {
    expect(frontmatter("---\ndescription: 'it''s fine'\n---\n").description).toBe("it's fine")
  })

  it('keeps the lines of a literal block', () => {
    const text = '---\nname: x\ndescription: |-\n  First line.\n  Second line.\nlicense: MIT\n---\n'
    expect(frontmatter(text)).toEqual({ name: 'x', description: 'First line.\nSecond line.', license: 'MIT' })
  })

  it('folds the lines of a folded block into one', () => {
    const text = '---\ndescription: >\n  Stop and check\n  this skill first.\n---\n'
    expect(frontmatter(text).description).toBe('Stop and check this skill first.')
  })

  it('reads one level of nesting as parent.key', () => {
    expect(frontmatter('---\nname: x\nmetadata:\n  version: "1.2.0"\n---\n')['metadata.version']).toBe('1.2.0')
  })

  it('reads past the byte order mark some editors save', () => {
    expect(frontmatter('\uFEFF---\nname: pdf\n---\n').name).toBe('pdf')
  })

  it('leaves the comment off a plain value', () => {
    expect(frontmatter('---\nname: pdf # the short name\n---\n').name).toBe('pdf')
  })

  it('is empty without front matter', () => {
    expect(frontmatter('# Just a heading')).toEqual({})
  })
})

it('drops the front matter from the instructions', () => {
  expect(skillBody('---\nname: x\n---\n\n# Steps\n1. Do it')).toBe('# Steps\n1. Do it')
})

describe('checkPackage', () => {
  it('reads the name, description, version and scripts', () => {
    const files = new Map([
      ['SKILL.md', skillMd('name: pdf\ndescription: For PDFs.\nversion: 1.3.0')],
      ['scripts/fill.py', Buffer.from('print(1)')],
      ['reference.md', Buffer.from('ref')],
    ])
    expect(checkPackage(files, 'folder')).toEqual({
      name: 'pdf',
      description: 'For PDFs.',
      version: '1.3.0',
      fileCount: 3,
      scripts: ['scripts/fill.py'],
      isUserInvoked: false,
      isInternal: false,
      bytes: expect.any(Number),
    })
  })

  it('reads that only the user calls on it, and that it is internal', () => {
    const head = 'name: pdf\ndescription: For PDFs.\ndisable-model-invocation: true\nmetadata:\n  internal: true'
    const files = new Map([['SKILL.md', skillMd(head)]])
    expect(checkPackage(files, 'pdf')).toMatchObject({ isUserInvoked: true, isInternal: true })
  })

  it('takes the folder name when SKILL.md names none', () => {
    const files = new Map([['SKILL.md', skillMd('description: For PDFs.')]])
    expect(checkPackage(files, 'pdf-tools').name).toBe('pdf-tools')
  })

  it('refuses a folder without SKILL.md', () => {
    expect(() => checkPackage(new Map([['README.md', Buffer.from('x')]]), 'x')).toThrow('没有 SKILL.md')
  })

  it('refuses a name that is not lowercase letters, digits and dashes', () => {
    const files = new Map([['SKILL.md', skillMd('name: My Skill\ndescription: x')]])
    expect(() => checkPackage(files, 'x')).toThrow('不合规范')
  })

  it('refuses a skill that does not say when to use it', () => {
    expect(() => checkPackage(new Map([['SKILL.md', skillMd('name: pdf')]]), 'x')).toThrow('description')
  })

  it('refuses two files a case-insensitive disk would write as one', () => {
    const files = new Map([
      ['SKILL.md', skillMd('name: pdf\ndescription: x')],
      ['skill.md', skillMd('name: pdf\ndescription: something else')],
    ])
    expect(() => checkPackage(files, 'x')).toThrow('只差大小写')
  })

  it('cuts a description longer than the spec allows', () => {
    const files = new Map([['SKILL.md', skillMd(`name: pdf\ndescription: ${'a'.repeat(2000)}`)]])
    expect(checkPackage(files, 'x').description).toHaveLength(1024)
  })
})

describe('checkRelativePath', () => {
  it('lets a nested path through', () => {
    expect(() => checkRelativePath('scripts/fill.py')).not.toThrow()
  })

  it.each(['../outside.md', 'a/../../b', '/etc/passwd', 'C:/x', 'a\\b', 'a//b'])('refuses %s', (file) => {
    expect(() => checkRelativePath(file)).toThrow('不安全')
  })
})

it('treats version control, caches and macOS litter as junk', () => {
  expect(['.git', '.DS_Store', '._SKILL.md', '__MACOSX', 'node_modules', '__pycache__'].every(isJunk)).toBe(true)
  expect(isJunk('scripts')).toBe(false)
})
