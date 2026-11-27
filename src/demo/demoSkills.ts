import { OfferedSkill, type SkillOffer, type SkillView } from '../../shared/skill'
import { strings } from '../../shared/strings'

const HOUR_MS = 60 * 60_000

// skills come as their authors wrote them, which is English for most of what is on GitHub
const PDF_SKILL = `---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files: read or extract text and tables, merge or split them, fill PDF forms.
license: Complete terms in LICENSE.txt
---

# PDF Processing Guide

First tell a text PDF from a scanned one, then pick the path.

## Defaults

| Task | How |
| --- | --- |
| Extract text | \`pypdf\`, page by page |
| Extract tables | \`pdfplumber\`, one CSV per table |
| Fill a form | run \`scripts/extract_form_field_info.py\` first |

## Filling forms

- A fillable form: read FORMS.md
- Anything else: convert to images, mark the fields on them
`

const CHANGELOG_SKILL = `---
name: changelog-writer
description: Writes the release notes in the team's format from git log and the pull requests merged since the last tag.
---

# Release notes

1. Run \`scripts/collect_prs.sh\` to list the pull requests since the last tag.
2. Group them: new, fixed, other.
3. One line each, the user-facing change first.
`

const DOCX_SKILL = `---
name: docx
description: Use this skill whenever the user wants to create, read or edit Word documents (.docx), including tracked changes and comments.
---

# DOCX creation and editing

Read with \`pandoc\`, write with \`docx\`; keep the document's own styles.
`

const XLSX_SKILL = `---
name: xlsx
description: Use this skill any time a spreadsheet is the input or the output: create, edit or analyse .xlsx and .csv files, keeping formulas and formatting.
---

# XLSX creation, editing and analysis

Keep formulas as formulas, then run \`scripts/recalc.py\` so every value is current.
`

/** The files of each demo skill, by its name: what its files dialog shows. */
export const DEMO_SKILL_FILES: Record<string, Record<string, string>> = {
  pdf: {
    'SKILL.md': PDF_SKILL,
    'FORMS.md': '# Forms\n\nRead the fields first, then fill them.',
    'LICENSE.txt': 'Complete terms of the license.',
    'scripts/convert_pdf_to_images.py': 'import sys\nfrom pdf2image import convert_from_path\n',
    'scripts/extract_form_field_info.py': 'import json, sys\nfrom pypdf import PdfReader\n',
    'scripts/fill_fillable_fields.py': 'import json, sys\nfrom pypdf import PdfReader, PdfWriter\n',
  },
  'changelog-writer': {
    'SKILL.md': CHANGELOG_SKILL,
    'scripts/collect_prs.sh': '#!/bin/sh\ngit log --merges --oneline "$(git describe --tags --abbrev=0)"..HEAD\n',
  },
  docx: {
    'SKILL.md': DOCX_SKILL,
  },
  xlsx: {
    'SKILL.md': XLSX_SKILL,
    'scripts/recalc.py': 'import sys\nfrom openpyxl import load_workbook\n',
  },
}

const scriptsOf = (name: string) =>
  Object.keys(DEMO_SKILL_FILES[name] ?? {}).filter((path) => path.startsWith('scripts/'))
const fileCountOf = (name: string) => Object.keys(DEMO_SKILL_FILES[name] ?? {}).length

/** The skills the demo starts with, by the bot that has them. */
export function demoSkills(now: number): Record<string, SkillView[]> {
  return {
    repo: [
      {
        botId: 'repo',
        name: 'pdf',
        description:
          'Use this skill whenever the user wants to do anything with PDF files: read or extract text and tables, merge or split them, fill PDF forms.',
        version: '1.3.0',
        source: { kind: 'github', repo: 'anthropics/skills', path: 'skills/pdf', ref: 'e4bb5d9' },
        installedAt: now - 48 * HOUR_MS,
        fileCount: fileCountOf('pdf'),
        scripts: scriptsOf('pdf'),
        isUserInvoked: false,
        uses: 4,
        lastUsedAt: now - 3 * HOUR_MS,
      },
      {
        botId: 'repo',
        name: 'docx',
        description:
          'Use this skill whenever the user wants to create, read or edit Word documents (.docx), including tracked changes and comments.',
        version: '1.0.2',
        source: { kind: 'github', repo: 'anthropics/skills', path: 'skills/docx', ref: 'e4bb5d9' },
        installedAt: now - 48 * HOUR_MS,
        fileCount: fileCountOf('docx'),
        scripts: scriptsOf('docx'),
        isUserInvoked: false,
        uses: 0,
        lastUsedAt: null,
      },
    ],
    release: [
      {
        botId: 'release',
        name: 'changelog-writer',
        description:
          'Writes the release notes in the team’s format from git log and the pull requests merged since the last tag.',
        source: { kind: 'local', root: '~/skills/changelog-writer', path: '~/skills/changelog-writer' },
        installedAt: now - 120 * HOUR_MS,
        fileCount: fileCountOf('changelog-writer'),
        scripts: scriptsOf('changelog-writer'),
        isUserInvoked: false,
        uses: 6,
        lastUsedAt: now - 26 * HOUR_MS,
      },
    ],
  }
}

const XLSX_OFFERED: OfferedSkill = {
  name: 'xlsx',
  description:
    'Use this skill any time a spreadsheet is the input or the output: create, edit or analyse .xlsx and .csv files, keeping formulas and formatting.',
  version: '1.1.0',
  source: { kind: 'github', repo: 'anthropics/skills', path: 'skills/xlsx', ref: 'e4bb5d9' },
  fileCount: fileCountOf('xlsx'),
  scripts: scriptsOf('xlsx'),
  isUserInvoked: false,
  bytes: 4096,
  replaces: null,
}

/** What a demo bot offers when the user sends it a GitHub link: the spreadsheet skill, for that bot. */
export function demoOffer(botId: string, offer: string): SkillOffer {
  return { offer, botId, skills: [XLSX_OFFERED], skipped: [] }
}

/** What a demo upload reads, whatever the user picked: a collection of the spreadsheet skill and the demo's others. */
export function demoUpload(botId: string, offer: string, now: number): SkillOffer {
  const others = Object.values(demoSkills(now))
    .flat()
    .map((skill) => OfferedSkill.parse({ ...skill, bytes: 4096, replaces: null }))
  return {
    offer,
    botId,
    skills: [XLSX_OFFERED, ...others],
    skipped: [{ folder: 'notes', reason: strings().harness.skills.noDescription }],
  }
}
