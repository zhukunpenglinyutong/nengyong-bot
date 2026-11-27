import type { SkillUploadKind } from '../../shared/skill'
import { strings } from '../../shared/strings'
import type { MenuEntry } from '../ui/ContextMenu'
import { Icon } from '../ui/Icon'
import { MenuButton } from '../ui/MenuButton'

interface Props {
  botName: string
  isMain: boolean
  isPicking: boolean
  onPick: (kind: SkillUploadKind) => void
}

/** The skills tab's 上传技能 button: a menu of what to upload from this computer, a skill folder or an archive. */
export function SkillUploader({ botName, isMain, isPicking, onPick }: Props) {
  const words = strings().skills.upload
  const items: MenuEntry[] = [
    ...(isMain ? [{ note: [words.forMain(botName)] }] : []),
    { label: words.folder, icon: 'folder', onSelect: () => onPick('folder') },
    { label: words.archive, icon: 'file', detail: words.archiveTypes, onSelect: () => onPick('archive') },
  ]
  return (
    <MenuButton
      menuLabel={words.title}
      items={items}
      disabled={isPicking}
      className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-sm text-soft disabled:opacity-40"
    >
      <Icon name="upload" size={15} />
      {words.title}
    </MenuButton>
  )
}
