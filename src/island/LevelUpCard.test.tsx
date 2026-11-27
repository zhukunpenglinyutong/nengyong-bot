import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MAIN_BOT, secretary } from '../../shared/bot'
import { strings } from '../../shared/strings'
import { TIERS } from '../../shared/trust'
import { LevelUpCard } from './LevelUpCard'

afterEach(cleanup)

it('shows the outfits a level unlocks', () => {
  render(<LevelUpCard bot={secretary()} from={29} level={30} />)
  const outfits = screen.getByRole('list')
  expect(
    within(outfits)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['银冠', '领带'])
})

it('says nothing about outfits on a level that unlocks none', () => {
  render(<LevelUpCard bot={secretary()} from={30} level={31} />)
  expect(screen.queryByText('解锁新装扮')).not.toBeInTheDocument()
})

it('does not announce the gold crown to the main bot, which wore it from the start', () => {
  render(<LevelUpCard bot={MAIN_BOT} from={59} level={60} />)
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['单片眼镜'])
})

it('rolls over from the level the bot came from, which can be several below', () => {
  render(<LevelUpCard bot={secretary()} from={1} level={4} />)
  expect(screen.getByText('Lv.1')).toBeInTheDocument()
  expect(screen.queryByText('Lv.3')).not.toBeInTheDocument()
})

it('lists every outfit unlocked on the way when a bot skips past a tier start', () => {
  render(<LevelUpCard bot={secretary()} from={9} level={11} />)
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['铜冠', '墨镜'])
})

it('says the bot reached a new rank when it skipped past where that rank starts', () => {
  render(<LevelUpCard bot={secretary()} from={9} level={11} />)
  expect(screen.getByText(strings().island.levelUp.reachedRank(TIERS[1].name))).toBeInTheDocument()
})
