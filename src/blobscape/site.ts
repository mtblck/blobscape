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

/** The Experiments page's intro, shared with its prerendered HTML so the page doesn't shift when the app takes over. */
export const EXPERIMENTS_INTRO = "Small tools built from the same blobs as the lessons: creatures that move on our own splat engine, a forest that grows as you walk it, a dungeon full of slimes, a watch that keeps time, the training loop that makes a splat, and a way to turn one into pixel art. New ones land here as they're made."

/** The splat experiments: the Experiments page, the front page and the menu (the footer lists only `NEWEST_EXPERIMENTS`). `needs` is what the browser must have. */
export const EXPERIMENTS = [
  {
    id: 'creature',
    title: 'Splat Creatures',
    url: '/experiments/creature/',
    cover: '/covers/splat-creatures.webp',
    needs: 'WebGPU or WebGL 2',
    body: 'A frog, a fox, an elf and a fire-breathing ice dragon, made of blobs and moving on our own splat engine. See their bones, then take one away as a rigged 3D model for Blender or a game engine, or as a pixel-art sprite sheet.',
  },
  {
    id: 'forest',
    title: 'Forest Walk',
    url: '/experiments/forest-walk/',
    cover: '/covers/forest-walk.webp',
    needs: 'WebGPU or WebGL 2',
    body: 'Walk the elf down a forest path that never ends, while trees, ferns, flowers and mushrooms made of blobs grow out of the ground as you come.',
  },
  {
    id: 'dungeon',
    title: 'Dungeon Run',
    url: '/experiments/dungeon-run/',
    cover: '/covers/dungeon-run.webp',
    needs: 'WebGPU or WebGL 2',
    body: 'The elf takes a sword and a hand full of magic into a torchlit dungeon. Slimes in five colours hop in, wave after wave, and burst into splats.',
  },
  {
    id: 'scan',
    title: 'Scan Studio',
    url: '/experiments/scan-studio/',
    cover: '/covers/scan-studio.webp',
    needs: 'WebGPU or WebGL 2',
    body: 'Bring in a splat scan of an object from your phone, cut away the table and the stray floaters, relight it with live lamps, and take it into the sandbox.',
  },
  {
    id: 'clockwork',
    title: 'Clockwork',
    url: '/experiments/clockwork/',
    cover: '/covers/clockwork.webp',
    needs: 'WebGPU or WebGL 2',
    body: 'A watch movement made of blobs, keeping the real time: every wheel turns by a real watch\'s ratios and the balance ticks five times a second. Slow it down to see one tick.',
  },
  {
    id: 'diorama',
    title: 'Pixel Diorama',
    url: '/experiments/pixel-diorama/',
    cover: '/covers/pixel-diorama.webp',
    needs: 'WebGPU or WebGL 2',
    body: 'A lighthouse, a dragon over lava, a bee in a forest and more, built from shapes and drawn as moving pixel art. It is real 3D underneath, so you can turn it, swap the palette, or switch the pixels off to see the blobs.',
  },
  {
    id: 'fit',
    title: 'Fit a Picture',
    url: '/experiments/fit-a-picture/',
    cover: '/covers/fit-a-picture.webp',
    needs: 'any modern browser',
    body: 'Watch a few hundred blobs start as noise and train themselves into a picture, live in your browser. It is the same loop that turns photos into a splat, in 2D.',
  },
  {
    id: 'sprite',
    title: 'Splat to Sprite',
    url: '/experiments/splat-to-sprite/',
    cover: '/covers/splat-to-sprite.webp',
    needs: 'WebGL 2',
    body: 'Frame a splat like a game camera and bake it into palette-locked pixel-art sprite sheets, walking in four directions.',
  },
] as const

/** The footer's short list: the three newest, newest first. The rest are one click away on the Experiments page (and in the menu and the sitemap), so the column stays the same length. A new experiment goes first and the last one drops off. */
const NEWEST: (typeof EXPERIMENTS)[number]['id'][] = ['diorama', 'scan', 'dungeon']
export const NEWEST_EXPERIMENTS = NEWEST.map((id) => EXPERIMENTS.find((e) => e.id === id)!)
