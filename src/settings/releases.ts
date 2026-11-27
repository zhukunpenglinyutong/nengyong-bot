import { strings } from '../../shared/strings'
import desk from './releases/1.0.0-beta.1/desk.webp'
import deskStill from './releases/1.0.0-beta.1/desk-still.webp'
import flow from './releases/1.0.0-beta.1/flow.webp'
import flowStill from './releases/1.0.0-beta.1/flow-still.webp'
import miniApp from './releases/1.0.0-beta.1/mini-app.webp'
import miniAppStill from './releases/1.0.0-beta.1/mini-app-still.webp'
import models from './releases/1.0.0-beta.1/models.webp'
import phone from './releases/1.0.0-beta.1/phone.webp'
import status from './releases/1.0.0-beta.1/status.webp'
import avatar from './releases/1.0.0-beta.2/avatar.webp'
import outfit from './releases/1.0.0-beta.2/outfit.webp'
import skills from './releases/1.0.0-beta.3/skills.webp'

export type ReleaseMedia =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'animation'; src: string; still: string; alt: string } // still: shown instead when motion is reduced

interface Highlight {
  title: string
  text: string
  media: ReleaseMedia
}

export interface Release {
  version: string
  date: string
  title: string
  highlights: Highlight[]
  others: string[]
}

const words = strings().releases

/** Newest first; the first one is the version running now. */
export const RELEASES: Release[] = [
  {
    version: '1.0.0-beta.3',
    date: '2026-11-26',
    ...words.versions['1.0.0-beta.3'],
    highlights: [image(words.highlights.skills, skills)],
  },
  {
    version: '1.0.0-beta.2',
    date: '2026-11-25',
    ...words.versions['1.0.0-beta.2'],
    highlights: [image(words.highlights.avatar, avatar), image(words.highlights.outfit, outfit)],
  },
  {
    version: '1.0.0-beta.1',
    date: '2026-11-23',
    ...words.versions['1.0.0-beta.1'],
    highlights: [
      animation(words.highlights.flow, flow, flowStill),
      animation(words.highlights.miniApp, miniApp, miniAppStill),
      image(words.highlights.status, status),
      animation(words.highlights.desk, desk, deskStill),
      image(words.highlights.phone, phone),
      image(words.highlights.models, models),
    ],
  },
]

interface HighlightWords {
  title: string
  text: string
  alt: string
}

function image(words: HighlightWords, src: string): Highlight {
  return { title: words.title, text: words.text, media: { kind: 'image', src, alt: words.alt } }
}

function animation(words: HighlightWords, src: string, still: string): Highlight {
  return { title: words.title, text: words.text, media: { kind: 'animation', src, still, alt: words.alt } }
}
