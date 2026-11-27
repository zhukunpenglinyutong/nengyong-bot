import type { SkillSource } from '../../shared/skill'
import { strings } from '../../shared/strings'

/** Where a skill came from, as its install card and its page say it: a GitHub repo, or a folder on this computer. */
export const sourceLabel = (source: SkillSource) =>
  source.kind === 'github' ? strings().skills.source.gitHub(source.repo) : strings().skills.source.folder
