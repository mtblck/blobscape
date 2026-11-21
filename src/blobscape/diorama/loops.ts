/**
 * The recorded loops of the Diorama scenes (public/loops/), shown as a
 * gallery under Diorama and on the engine page. Kept apart from
 * scenes.ts so a page that only shows the loops doesn't load every scene;
 * loops.test.ts holds the two lists in step.
 *
 * Each loop is the engine's own pixel art, one image pixel per art pixel, one
 * pass of the scene at 12 frames a second, recorded from the production
 * build by scripts/record-loops.mjs: `<id>.webp` plays, `<id>.png` is its
 * first frame for anyone who asks for less motion. Record again after a
 * scene changes in a way you'd see.
 */
export const LOOPS: readonly { id: string; label: string }[] = [
  { id: 'lighthouse', label: 'Lighthouse' },
  { id: 'campfire', label: 'Campfire' },
  { id: 'dragon', label: 'Lava dragon' },
  { id: 'bee', label: 'Forest bee' },
  { id: 'hand', label: 'Stone hand' },
  { id: 'reef', label: 'Jellyfish reef' },
  { id: 'octopus', label: 'Storm octopus' },
  { id: 'owl', label: 'Owl and cauldron' },
  { id: 'isles', label: 'Sky islands' },
  { id: 'harvest', label: 'Pumpkin watch' },
  { id: 'lab', label: 'Sprout lab' },
  { id: 'croc', label: 'Garden crocodile' },
  { id: 'grove', label: 'Lantern grove' },
  { id: 'hut', label: 'Heron hut' },
  { id: 'window', label: 'Sunrise window' },
  { id: 'spider', label: 'Lantern spider' },
  { id: 'snail', label: 'Snail house' },
  { id: 'windmill', label: 'Windmill' },
  { id: 'ruin', label: 'Ruined chapel' },
  { id: 'cave', label: 'Crystal cave' },
  { id: 'canyon', label: 'Desert canyon' },
  { id: 'cabin', label: 'Snowed-in cabin' },
  { id: 'koi', label: 'Koi pond in the rain' },
  { id: 'whales', label: 'Space whales' },
  { id: 'turkey', label: 'Turkey Run' },
  { id: 'henge', label: 'White witch at the henge' },
  { id: 'meadow', label: 'Fox and wisp' },
  { id: 'fishing', label: 'Fishing for the moon' },
]

/** Every loop's size in art pixels (the recorder's page is always the same size). */
export const LOOP_SIZE = { width: 410, height: 307 } as const

/** The scenes the engine page shows: a spread of subjects and colors, kept to the lighter loops (about 5 MB together). */
export const ENGINE_LOOPS: readonly string[] = ['owl', 'dragon', 'grove', 'croc', 'spider', 'campfire']

export const loopSrc = (id: string, still = false) => `/loops/${id}.${still ? 'png' : 'webp'}`
