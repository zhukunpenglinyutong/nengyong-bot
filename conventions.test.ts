// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

// AGENTS.md「目录」: shared ← harness ← electron, shared ← src
const ALLOWED_IMPORTS: Record<string, string[]> = {
  shared: [],
  harness: ['shared'],
  electron: ['harness', 'shared'],
  src: ['shared'],
}

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.join(dir, file))
}

it('keeps imports pointing one way between the top-level directories', () => {
  const violations = Object.entries(ALLOWED_IMPORTS).flatMap(([dir, allowed]) =>
    sourceFiles(dir).flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/from '(\.[^']*)'|import\('(\.[^']*)'\)/g)].flatMap((match) => {
        const target = path.relative('.', path.resolve(path.dirname(file), match[1] ?? match[2])).split(path.sep)[0]
        return target === dir || allowed.includes(target) ? [] : [`${file} imports ${target}/`]
      }),
    ),
  )
  expect(violations).toEqual([])
})

// AGENTS.md「样式」: colours, font sizes, radii and shadows come from @theme in src/index.css
it('keeps arbitrary colours, font sizes, radii and shadows out of the components', () => {
  const violations = sourceFiles('src')
    // the avatar and its outfit, the desk on the back of the badge and the makers' marks are illustration; tests hold bot colours as data
    .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
    .filter((file) => !['BotAvatar.tsx', 'OutfitPiece.tsx', 'ModelLogo.tsx'].some((name) => file.endsWith(name)))
    .filter((file) => !file.startsWith(path.join('src', 'bot', 'desk', '')))
    .flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:text|rounded|shadow)-\[[^\]]+\]/g)].map(
        (match) => `${file}: ${match[0]}`,
      ),
    )
  expect(violations).toEqual([])
})

// AGENTS.md「样式」: the cursor, hover tint and press reaction of a clickable come from the base layer in src/index.css
it('leaves the clickable feedback to src/index.css', () => {
  const violations = sourceFiles('src')
    .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
    .flatMap((file) =>
      [
        ...fs
          .readFileSync(file, 'utf8')
          .matchAll(/\bcursor-(?:pointer|default|auto)\b|(?<![\w-])(?:hover|focus|focus-visible):bg-[\w/-]+/g),
      ].map(
        (match) =>
          `${file}: ${match[0]} — drop it; a <button> already gets cursor, hover tint and press, disabled or aria-disabled turns them off`,
      ),
    )
  expect(violations).toEqual([])
})

// the press scale makes a button the containing block of its ::after: a stretched one shrinks back to the button, so a click released over the rest of the card is lost
it('keeps a button stretched over its card from shrinking when pressed', () => {
  const violations = sourceFiles('src')
    .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
    .flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/className="([^"]*\bafter:inset-0\b[^"]*)"/g)]
        .filter((match) => !/\bactive:scale-none\b/.test(match[1]))
        .map(
          (match) =>
            `${file}: ${match[1]} — add active:scale-none to the button, and has-[button:active]:scale-97 to the card for the press`,
        ),
    )
  expect(violations).toEqual([])
})

// AGENTS.md「样式」: a copy says on the spot whether it copied; useCopy is the one way to the clipboard
it('copies only through useCopy', () => {
  const violations = sourceFiles('src')
    .filter((file) => !/\.test\.tsx?$/.test(file) && !file.endsWith(path.join('ui', 'useCopy.ts')))
    .filter((file) => /navigator\.clipboard|execCommand\(\s*'copy'/.test(fs.readFileSync(file, 'utf8')))
  expect(
    violations,
    'copy with useCopy from src/ui/useCopy.ts, or give a menu item `copy: text`: both say 已复制 where the user clicked',
  ).toEqual([])
})

// a Chinese input method confirms a candidate with Enter and drops it with Escape: acting on them submits half-typed pinyin
it('leaves the Enter and Escape of an input method to the input method', () => {
  const violations = sourceFiles('src')
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /key [!=]== '(?:Enter|Escape)'/.test(line) && !line.includes('isComposing') ? [`${file}:${index + 1}`] : [],
        ),
    )
  expect(
    violations,
    'on the same line, also check `!event.nativeEvent.isComposing` (a React event) or `!event.isComposing` (a DOM event)',
  ).toEqual([])
})

// AGENTS.md「React」: effects and timers need judgment to get right; they live only in the named hooks of src/ui and in useHarness
it('keeps effects and timers out of components and domain hooks', () => {
  const violations = sourceFiles('src')
    .filter((file) => !/\.test\.tsx?$/.test(file) && !file.startsWith(path.join('src', 'ui', '')))
    .filter((file) => file !== path.join('src', 'useHarness.ts'))
    .filter(
      (file) =>
        file.endsWith('.tsx') ||
        /^use[A-Z]/.test(path.basename(file)) ||
        /\bfrom 'react'/.test(fs.readFileSync(file, 'utf8')),
    )
    .flatMap((file) =>
      [
        ...fs
          .readFileSync(file, 'utf8')
          .matchAll(/\b(?:useEffect|useLayoutEffect|setTimeout|setInterval|requestAnimationFrame)\b/g),
      ].map((match) => `${file}: ${match[0]}`),
    )
  expect(
    violations,
    'derive it while rendering, do it in the event handler, reset state with a key, or sync through a named hook in src/ui',
  ).toEqual([])
})

// AGENTS.md「文件与函数」: only export what another file uses; an export nobody reads is dead code that looks alive
it('exports only what another file uses', () => {
  const files = Object.keys(ALLOWED_IMPORTS).flatMap((dir) => sourceFiles(dir))
  const texts = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]))
  const violations = files
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .flatMap((file) =>
      [...(texts.get(file) ?? '').matchAll(/^export (?:async )?(?:function\*?|const|let|interface|type) (\w+)/gm)]
        .map((match) => match[1])
        .filter(
          (name) => !files.some((other) => other !== file && new RegExp(`\\b${name}\\b`).test(texts.get(other) ?? '')),
        )
        .map((name) => `${file}: ${name}`),
    )
  expect(violations, 'drop the export, or delete it when the file does not use it either').toEqual([])
})

// AGENTS.md「文件与函数」: a file over the limit holds two concepts and has to be split
const MAX_FILE_LINES = 500

it('keeps every non-test source file within the line limit', () => {
  const violations = Object.keys(ALLOWED_IMPORTS)
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => fs.readFileSync(file, 'utf8').trimEnd().split('\n').length > MAX_FILE_LINES)
  expect(violations).toEqual([])
})

// AGENTS.md「边界与错误」: the sandboxed preload can require only 'electron'; a module it shares with main.ts is split
// into a chunk it cannot load, and the window silently falls back to the demo
it('keeps the preload free of runtime imports other than electron', () => {
  const imports = [
    ...fs.readFileSync('electron/preload.ts', 'utf8').matchAll(/^import (?!type )[^\n]* from '([^']+)'/gm),
  ]
    .map((match) => match[1])
    .filter((source) => source !== 'electron')
  expect(imports, 'inline it in preload.ts or import it with `import type`').toEqual([])
})

// AGENTS.md「发版」: the version in package.json has its release notes, first in the list
it('has release notes for the version in package.json', async () => {
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const { RELEASES } = await import('./src/settings/releases')
  expect(RELEASES[0]?.version, `在 src/settings/releases.ts 最前面写上 ${version} 的更新记录`).toBe(version)
})

// AGENTS.md「语言」: the interface's words live in shared/strings, one file per language and domain; only text the model alone
// reads (harness/) stays in the code
it('keeps the Chinese of the interface in shared/strings/zh', () => {
  const violations = ['src', 'shared', 'electron']
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => !/\.test\.tsx?$/.test(file) && !file.startsWith(path.join('shared', 'strings', 'zh', '')))
    // each language is named in itself in the language picker
    .filter((file) => file !== path.join('shared', 'language.ts'))
    .flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8')
      const lines = chineseOutsideComments(source).map((offset) => source.slice(0, offset).split('\n').length)
      return [...new Set(lines)].map((line) => `${file}:${line}`)
    })
  expect(
    violations,
    'add the words to shared/strings/zh/<domain>.ts and shared/strings/en/<domain>.ts, and read them with strings().<domain>.<key>',
  ).toEqual([])
})

const CHINESE = /[\p{Script=Han}　-〿！-～]/u

/** Where `source` has Chinese outside its comments. */
function chineseOutsideComments(source: string): number[] {
  const offsets: number[] = []
  // code up to the } that closes a template's ${, or to the end; returns where it stopped
  const code = (start: number): number => {
    let index = start
    let depth = 0
    while (index < source.length) {
      const char = source[index]
      if (source.startsWith('//', index)) index = endOf(source.indexOf('\n', index))
      else if (source.startsWith('/*', index)) index = endOf(source.indexOf('*/', index)) + 2
      else if (char === "'" || char === '"' || char === '`') index = literal(index)
      else if (char === '}' && depth === 0) return index + 1
      else {
        if (char === '{') depth++
        if (char === '}') depth--
        if (CHINESE.test(char)) offsets.push(index)
        index++
      }
    }
    return index
  }
  // a quote in JSX text (Don't) is not a string: a quoted string ends at the line's end at the latest
  const literal = (start: number): number => {
    const quote = source[start]
    let index = start + 1
    while (index < source.length && source[index] !== quote && (quote === '`' || source[index] !== '\n')) {
      if (source[index] === '\\') index += 2
      else if (quote === '`' && source.startsWith('${', index)) index = code(index + 2)
      else {
        if (CHINESE.test(source[index])) offsets.push(index)
        index++
      }
    }
    return index + 1
  }
  const endOf = (found: number) => (found === -1 ? source.length : found)
  code(0)
  return offsets
}
