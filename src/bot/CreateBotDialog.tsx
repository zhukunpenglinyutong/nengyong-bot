import { motion } from 'motion/react'
import { useState } from 'react'
import { BOT_NAME_MAX, type Bot, PALETTE, PICKER_SHAPES } from '../../shared/bot'
import { Dialog } from '../ui/Dialog'
import { IconButton } from '../ui/IconButton'
import { BotAvatar } from './BotAvatar'
import { type Look, LookPicker } from './LookPicker'
import { strings } from '../../shared/strings'

interface Props {
  onCreate: (bot: Pick<Bot, 'name' | 'shape' | 'color'>) => void
  onClose: () => void
}

export function CreateBotDialog({ onCreate, onClose }: Props) {
  const words = strings().bot.create
  const [look, setLook] = useState<Look>(randomLook)
  const [name, setName] = useState('')
  const canCreate = name.trim() !== ''
  const preview: Bot = { id: 'preview', name: name || words.defaultName, ...look }

  const submit = () => {
    if (!canCreate) return
    onCreate({ name: name.trim(), ...look })
    onClose()
  }

  return (
    <Dialog
      labelledBy="create-bot-title"
      onClose={onClose}
      className="w-[450px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl bg-surface p-0"
    >
      <header className="flex h-16 items-center justify-between border-b border-line pr-4 pl-6">
        <h2 id="create-bot-title" className="text-lg font-semibold">
          {words.title}
        </h2>
        <IconButton icon="close" label={words.close} onClick={onClose} />
      </header>

      <div className="flex flex-col items-center px-6 pt-5 pb-6">
        {/* re-keyed on every pick so the preview pops into the new look */}
        <motion.span
          key={`${look.shape}${look.color}`}
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.45 }}
        >
          <BotAvatar bot={preview} size={96} />
        </motion.span>

        <input
          autoFocus
          aria-label={strings().bot.nameLabel}
          value={name}
          maxLength={BOT_NAME_MAX}
          placeholder={words.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
          className="mt-4 h-[50px] w-full rounded-lg border border-line px-4 text-center text-base outline-none placeholder:text-muted/70 focus:border-ink/20"
        />

        <div className="mt-6 w-full">
          <LookPicker look={look} onPick={setLook} />
        </div>
      </div>

      <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <button type="button" onClick={onClose} className="h-11 rounded-full border border-line bg-side px-5 text-base">
          {words.cancel}
        </button>
        <button
          type="button"
          disabled={!canCreate}
          onClick={submit}
          className="h-11 rounded-full bg-ink px-5 text-base text-canvas transition-colors disabled:bg-hover disabled:text-muted/70"
        >
          {words.create}
        </button>
      </footer>
    </Dialog>
  )
}

function randomLook(): Look {
  const colors = PALETTE.filter((color) => color.id !== 'ink')
  return {
    shape: PICKER_SHAPES[Math.floor(Math.random() * PICKER_SHAPES.length)],
    color: colors[Math.floor(Math.random() * colors.length)].value,
  }
}
