/**
 * Facts about the site that the menu, footer, front page, page titles and the
 * prerendered pages share.
 */
export const SITE = {
  name: 'Blobscape',
  tagline: 'Learn 3D Gaussian splats by taking them apart',
  /** The canonical address, no trailing slash: page paths start with one. */
  origin: 'https://blobscape.dev',
  author: { name: 'Matt Black', url: 'https://mattblack.space/' },
  tip: 'https://ko-fi.com/mtblck',
} as const

/** The Get in touch page's intro, shared with its prerendered HTML. */
export const CONTACT_INTRO = 'A question about splats, a bug, an idea for a lesson or an experiment, or just a hello: send a note and it comes straight to me.'

/** The Experiments page's intro, shared with its prerendered HTML so the page doesn't shift when the app takes over. */
export const EXPERIMENTS_INTRO = "Small tools built from the same blobs as the lessons: creatures that move on our own splat engine, a forest that grows as you walk it, a dungeon full of slimes, a watch that keeps time, the training loop that makes a splat, and a way to turn one into pixel art. New ones land here as they're made."

/**
 * The splat experiments, newest first: the Experiments page, the front page and the menu (the footer lists only `NEWEST_EXPERIMENTS`).
 * `needs` is what the browser must have. `published` is the day it first went live and `updated` the day it last changed in a way a
 * visitor would see (a new scene, a new feature), both as YYYY-MM-DD; site-wide work such as a new layout is not an update. A new
 * experiment goes first, with both dates the same.
 */
export const EXPERIMENTS = [
  {
    id: 'diorama',
    title: 'Pixel Diorama',
    url: '/experiments/pixel-diorama/',
    cover: '/covers/pixel-diorama.webp',
    needs: 'WebGPU or WebGL 2',
    published: '2026-11-15',
    updated: '2026-11-16',
    body: 'A lighthouse, a dragon over lava, a bee in a forest and more, built from shapes and drawn as moving pixel art. It is real 3D underneath, so you can turn it, swap the palette, or switch the pixels off to see the blobs.',
  },
  {
    id: 'scan',
    title: 'Scan Studio',
    url: '/experiments/scan-studio/',
    cover: '/covers/scan-studio.webp',
    needs: 'WebGPU or WebGL 2',
    published: '2026-11-12',
    updated: '2026-11-12',
    body: 'Bring in a splat scan of an object from your phone, cut away the table and the stray floaters, relight it with live lamps, and take it into the sandbox.',
  },
  {
    id: 'dungeon',
    title: 'Dungeon Run',
    url: '/experiments/dungeon-run/',
    cover: '/covers/dungeon-run.webp',
    needs: 'WebGPU or WebGL 2',
    published: '2026-11-12',
    updated: '2026-11-12',
    body: 'The elf takes a sword and a hand full of magic into a torchlit dungeon. Slimes in five colors hop in, wave after wave, and burst into splats.',
  },
  {
    id: 'clockwork',
    title: 'Clockwork',
    url: '/experiments/clockwork/',
    cover: '/covers/clockwork.webp',
    needs: 'WebGPU or WebGL 2',
    published: '2026-11-12',
    updated: '2026-11-12',
    body: 'A watch movement made of blobs, keeping the real time: every wheel turns by a real watch\'s ratios and the balance ticks five times a second. Slow it down to see one tick.',
  },
  {
    id: 'forest',
    title: 'Forest Walk',
    url: '/experiments/forest-walk/',
    cover: '/covers/forest-walk.webp',
    needs: 'WebGPU or WebGL 2',
    published: '2026-11-11',
    updated: '2026-11-11',
    body: 'Walk the elf down a forest path that never ends, while trees, ferns, flowers and mushrooms made of blobs grow out of the ground as you come.',
  },
  {
    id: 'creature',
    title: 'Splat Creatures',
    url: '/experiments/creature/',
    cover: '/covers/splat-creatures.webp',
    needs: 'WebGPU or WebGL 2',
    published: '2026-11-11',
    updated: '2026-11-12',
    body: 'A frog, a fox, an elf and a fire-breathing ice dragon, made of blobs and moving on our own splat engine. See their bones, then take one away as a rigged 3D model for Blender or a game engine, or as a pixel-art sprite sheet.',
  },
  {
    id: 'fit',
    title: 'Fit a Picture',
    url: '/experiments/fit-a-picture/',
    cover: '/covers/fit-a-picture.webp',
    needs: 'any modern browser',
    published: '2026-11-10',
    updated: '2026-11-10',
    body: 'Watch a few hundred blobs start as noise and train themselves into a picture, live in your browser. It is the same loop that turns photos into a splat, in 2D.',
  },
  {
    id: 'sprite',
    title: 'Splat to Sprite',
    url: '/experiments/splat-to-sprite/',
    cover: '/covers/splat-to-sprite.webp',
    needs: 'WebGL 2',
    published: '2026-11-10',
    updated: '2026-11-10',
    body: 'Frame a splat like a game camera and bake it into palette-locked pixel-art sprite sheets, walking in four directions.',
  },
] as const

export type Experiment = (typeof EXPERIMENTS)[number]

/** A card's title link on the Experiments page (shared with its prerendered HTML): it covers the whole card, and the focus ring goes round the card with it. */
export const CARD_LINK = '-mt-2 font-display text-2xl text-ink no-underline after:absolute after:inset-0 after:rounded-2xl hover:text-accent focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent'

/** Experiments by the day they were published. Ones from the same day keep the list's order (newest first), turned round with the rest. */
export function byPublished(order: 'newest' | 'oldest'): Experiment[] {
  const newest = EXPERIMENTS.map((e, i) => ({ e, i })).sort((a, b) => (a.e.published < b.e.published ? 1 : a.e.published > b.e.published ? -1 : a.i - b.i)).map((x) => x.e)
  return order === 'newest' ? newest : newest.reverse()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Nov 15, 2026" for "2026-11-15": written out by hand so the prerendered page and every browser agree. */
export function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** The experiment that lives at a path, if one does. */
export const experimentAt = (path: string): Experiment | undefined => EXPERIMENTS.find((e) => e.url === path)

/** The footer's short list: the three newest. The rest are one click away on the Experiments page (and in the menu and the sitemap), so the column stays the same length. */
export const NEWEST_EXPERIMENTS = byPublished('newest').slice(0, 3)
