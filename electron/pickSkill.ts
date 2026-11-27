import { type BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import { SKILL_ARCHIVE_EXTENSIONS, type SkillUploadKind } from '../shared/skill'
import { strings } from '../shared/strings'

/**
 * Asks for a skill folder or archive to upload; null when the user cancels. Two kinds, not one dialog for both:
 * Windows and Linux cannot pick a file and a folder in the same dialog.
 */
export async function pickSkill(parent: BrowserWindow | null, kind: SkillUploadKind): Promise<string | null> {
  const words = strings().skills.upload
  const options: OpenDialogOptions =
    kind === 'folder'
      ? { title: words.pickFolder, buttonLabel: words.pickButton, properties: ['openDirectory'] }
      : {
          title: words.pickArchive,
          buttonLabel: words.pickButton,
          properties: ['openFile'],
          filters: [{ name: words.archiveFilter, extensions: SKILL_ARCHIVE_EXTENSIONS }],
        }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}
