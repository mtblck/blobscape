import type { PaintDoc, SpeckDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * Day and Night's seasons. A season is a day of the year for the sun's path and a few changes to a scene's
 * description: what the leafy trees wear, what the grass looks like, and what falls. Data only.
 */
export type Season = 'spring' | 'summer' | 'fall' | 'winter'

/** The seasons in order, each with the day of the year its sun follows (the equinoxes and solstices). */
export const SEASONS: { id: Season; label: string; day: number }[] = [
  { id: 'spring', label: 'Spring', day: 80 },
  { id: 'summer', label: 'Summer', day: 172 },
  { id: 'fall', label: 'Fall', day: 266 },
  { id: 'winter', label: 'Winter', day: 355 },
]

/** A season from the address (`?season=fall`), or summer. */
export const seasonFrom = (text: string | null): Season => SEASONS.find((s) => s.id === text)?.id ?? 'summer'

export const SNOW = '#f4f8ff', SNOW_SHADE = '#d4e0f0'

/** What a leafy tree's crown wears: blossom in spring, green in summer, turned leaves in fall. Winter has no crown. */
export const CROWN: Record<Exclude<Season, 'winter'>, PaintDoc> = {
  spring: { kind: 'faces', top: { kind: 'speckle', size: 0.05, colors: ['#f8c8dc', '#fde8f0', '#f2a0c0', '#a8d470', '#fde8f0'] }, side: { kind: 'speckle', size: 0.05, colors: ['#f2a0c0', '#f8c8dc', '#8cc45c', '#e888b0'] } },
  summer: { kind: 'faces', top: { kind: 'speckle', size: 0.06, colors: ['#6aa84a', '#7fbc54', '#5a9844'] }, side: { kind: 'speckle', size: 0.06, colors: ['#4a8a3c', '#5a9844', '#3f7a38'] } },
  fall: { kind: 'faces', top: { kind: 'speckle', size: 0.06, colors: ['#f0b030', '#e8862a', '#f6cc48', '#d85a28'] }, side: { kind: 'speckle', size: 0.06, colors: ['#d87024', '#c44a22', '#e8a02c', '#a83a20'] } },
}

/** The grass of a clearing or a park. */
export const GRASS: Record<Season, string[]> = {
  spring: ['#6ab04c', '#7cc058', '#7cc058', '#9ad468'],
  summer: ['#5a9844', '#6aa84a', '#6aa84a', '#8cc45c'],
  fall: ['#8a9a44', '#9aa24a', '#b09a48', '#c48a3a', '#8a9a44'],
  winter: [SNOW, SNOW, SNOW_SHADE],
}

/** What falls through the air in a box `from` to `to`: petals in spring, leaves in fall, snow in winter; `share` scales how many and `scale` how big (a park's trees are small). */
export function falling(season: Season, from: [number, number, number], to: [number, number, number], share = 1, scale = 1): SpeckDoc[] {
  const n = (count: number) => Math.max(4, Math.round(count * share))
  if (season === 'spring') return [{ kind: 'leaves', count: n(26), from, to, colors: ['#fde8f0', '#f8c8dc', '#f2a0c0'], size: 0.009 * scale, land: true, wind: [0.25, 0.1] }]
  if (season === 'fall') return [{ kind: 'leaves', count: n(110), from, to, colors: ['#f0b030', '#e8862a', '#d85a28', '#f6cc48'], size: 0.011 * scale, land: true, wind: [0.35, 0.12] }]
  if (season === 'winter') return [{ kind: 'snow', count: n(170), from, to, colors: [SNOW, SNOW_SHADE], size: 0.009 * scale, land: true, wind: [0.3, 0.09] }]
  return []
}
