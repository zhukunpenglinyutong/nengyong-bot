import { z } from 'zod'

export const OUTFIT_SLOTS = ['head', 'face', 'neck'] as const
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number]

export const OutfitId = z.enum([
  'partyHat',
  'bronzeCrown',
  'silverCrown',
  'goldCrown',
  'halo',
  'rainbowCrown',
  'roundGlasses',
  'sunglasses',
  'monocle',
  'bowTie',
  'tie',
  'medal',
])
export type OutfitId = z.infer<typeof OutfitId>

/** Where each piece is worn and the trust level that unlocks it: always the first level of a tier. */
export const OUTFITS: Record<OutfitId, { slot: OutfitSlot; from: number }> = {
  partyHat: { slot: 'head', from: 1 },
  bronzeCrown: { slot: 'head', from: 10 },
  silverCrown: { slot: 'head', from: 30 },
  goldCrown: { slot: 'head', from: 60 },
  halo: { slot: 'head', from: 90 },
  rainbowCrown: { slot: 'head', from: 99 },
  roundGlasses: { slot: 'face', from: 1 },
  sunglasses: { slot: 'face', from: 10 },
  monocle: { slot: 'face', from: 60 },
  bowTie: { slot: 'neck', from: 1 },
  tie: { slot: 'neck', from: 30 },
  medal: { slot: 'neck', from: 90 },
}

/** What the main bot wears from the start, and can always put back on whatever its level. */
export const MAIN_BOT_OUTFIT: OutfitId[] = ['goldCrown']

export const wornOn = (outfit: OutfitId[], slot: OutfitSlot) => outfit.find((id) => OUTFITS[id].slot === slot)

export const takeOff = (outfit: OutfitId[], slot: OutfitSlot) => outfit.filter((id) => OUTFITS[id].slot !== slot)

/** Puts a piece on in place of whatever its slot held; the piece already worn comes off instead. */
export function toggleOutfit(outfit: OutfitId[], id: OutfitId): OutfitId[] {
  if (outfit.includes(id)) return outfit.filter((worn) => worn !== id)
  return [...takeOff(outfit, OUTFITS[id].slot), id]
}

export const isUnlocked = (id: OutfitId, level: number, isMainBot: boolean) =>
  level >= OUTFITS[id].from || (isMainBot && MAIN_BOT_OUTFIT.includes(id))

/** The pieces a bot gets going up from one level to another. */
export const unlockedBetween = (from: number, to: number) =>
  OutfitId.options.filter((id) => OUTFITS[id].from > from && OUTFITS[id].from <= to)
