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

/** The skills tab's 上传技能 icon button: a menu of what to upload from this computer, a skill folder or an archive. */
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
      aria-label={words.title}
      title={words.title}
      disabled={isPicking}
      className="grid size-7 shrink-0 place-items-center rounded-full text-soft disabled:opacity-40"
    >
      <Icon name="upload" size={15} />
    </MenuButton>
  )
}
