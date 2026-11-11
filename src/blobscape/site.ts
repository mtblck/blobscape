/**
 * Facts about the site that the menu, footer, front page and page titles
 * share. When Blobscape moves to its own domain, `origin` and the experiment
 * links change here and nowhere else.
 */
export const SITE = {
  name: 'Blobscape',
  tagline: 'Learn 3D Gaussian splats by taking them apart',
  /** Where the page lives now; becomes https://blobscape.dev/ after the move. */
  origin: 'https://mattblack.space/experiments/blobscape/',
  author: { name: 'Matt Black', url: 'https://mattblack.space/' },
  tip: 'https://ko-fi.com/mtblck',
} as const

/** The other splat experiments, shown on the front page and in the menu and footer. */
export const EXPERIMENTS = [
  {
    id: 'creature',
    title: 'Creature',
    url: '#/creature',
    body: 'A fox made of blobs that trots on our own splat engine. Make it big or small, then take it away as a rigged 3D model for Blender or a game engine.',
  },
  {
    id: 'fit',
    title: 'Fit a Picture',
    url: '/experiments/fit-a-picture/',
    body: 'Watch a few hundred blobs start as noise and train themselves into a picture, live in your browser. It is the same loop that turns photos into a splat, in 2D.',
  },
  {
    id: 'sprite',
    title: 'Splat to Sprite',
    url: '/experiments/splat-to-sprite/',
    body: 'Frame a splat like a game camera and bake it into palette-locked pixel-art sprite sheets, walking in four directions.',
  },
] as const

export const ALL_EXPERIMENTS_URL = '/experiments/'
