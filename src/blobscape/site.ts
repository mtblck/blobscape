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
export const EXPERIMENTS_INTRO = "Small tools built from the same blobs as the lessons: creatures that move on our own splat engine, the training loop that makes a splat, and a way to turn one into pixel art. New ones land here as they're made."

/** The splat experiments: the Experiments page, the front page, the menu and the footer. `needs` is what the browser must have. */
export const EXPERIMENTS = [
  {
    id: 'creature',
    title: 'Creature',
    url: '/experiments/creature/',
    needs: 'WebGPU or WebGL 2',
    body: 'A frog, a fox, an elf and a fire-breathing ice dragon, made of blobs and moving on our own splat engine. See their bones, then take one away as a rigged 3D model for Blender or a game engine.',
  },
  {
    id: 'fit',
    title: 'Fit a Picture',
    url: '/experiments/fit-a-picture/',
    needs: 'any modern browser',
    body: 'Watch a few hundred blobs start as noise and train themselves into a picture, live in your browser. It is the same loop that turns photos into a splat, in 2D.',
  },
  {
    id: 'sprite',
    title: 'Splat to Sprite',
    url: '/experiments/splat-to-sprite/',
    needs: 'WebGL 2',
    body: 'Frame a splat like a game camera and bake it into palette-locked pixel-art sprite sheets, walking in four directions.',
  },
] as const

