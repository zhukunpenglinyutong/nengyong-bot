import { describe, expect, it } from 'vitest'
import { isUnlocked, OUTFITS, OutfitId, toggleOutfit, unlockedBetween } from './outfit'
import { TIERS } from './trust'

describe('toggleOutfit', () => {
  it('puts a piece on in place of the one its slot held', () => {
    expect(toggleOutfit(['partyHat', 'sunglasses'], 'bronzeCrown')).toEqual(['sunglasses', 'bronzeCrown'])
  })

  it('takes off the piece that is already worn', () => {
    expect(toggleOutfit(['partyHat', 'sunglasses'], 'partyHat')).toEqual(['sunglasses'])
  })
})

describe('isUnlocked', () => {
  it('unlocks a piece from its level on', () => {
    expect(isUnlocked('silverCrown', 29, false)).toBe(false)
    expect(isUnlocked('silverCrown', 30, false)).toBe(true)
  })

  it('lets the main bot wear its gold crown at any level, and nothing else early', () => {
    expect(isUnlocked('goldCrown', 1, true)).toBe(true)
    expect(isUnlocked('silverCrown', 1, true)).toBe(false)
  })
})

it('unlocks pieces only where a tier starts, so each new tier brings some', () => {
  const tierStarts: number[] = TIERS.map((tier) => tier.from)
  expect(OutfitId.options.filter((id) => !tierStarts.includes(OUTFITS[id].from))).toEqual([])
  expect(tierStarts.filter((level) => unlockedBetween(level - 1, level).length === 0)).toEqual([])
})

it('lists what going up from one level to another unlocks', () => {
  expect(unlockedBetween(29, 30)).toEqual(['silverCrown', 'tie'])
  expect(unlockedBetween(30, 31)).toEqual([])
  expect(unlockedBetween(9, 11)).toEqual(['bronzeCrown', 'sunglasses'])
})
