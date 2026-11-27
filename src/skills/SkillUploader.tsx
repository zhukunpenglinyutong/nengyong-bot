import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import type { SkillUploadKind } from '../../shared/skill'
import { strings } from '../../shared/strings'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { Icon } from '../ui/Icon'

interface Props {
  botName: string
  isMain: boolean
  isPicking: boolean
  onPick: (kind: SkillUploadKind) => void
}

/** The skills tab's 上传技能 button: a menu of what to upload from this computer, a skill folder or an archive. */
export function SkillUploader({ botName, isMain, isPicking, onPick }: Props) {
  const words = strings().skills.upload
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const items: MenuEntry[] = [
    ...(isMain ? [{ note: [words.forMain(botName)] }] : []),
    { label: words.folder, icon: 'folder', onSelect: () => onPick('folder') },
    { label: words.archive, icon: 'file', detail: words.archiveTypes, onSelect: () => onPick('archive') },
  ]
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        disabled={isPicking}
        onClick={(event) => {
          const { left, bottom } = event.currentTarget.getBoundingClientRect()
          setMenu({ x: left, y: bottom + 4 })
        }}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-sm text-soft disabled:opacity-40"
      >
        <Icon name="upload" size={15} />
        {words.title}
      </button>
      <AnimatePresence>
        {menu && (
          <ContextMenu
            key={`${menu.x},${menu.y}`}
            x={menu.x}
            y={menu.y}
            items={items}
            label={words.title}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
