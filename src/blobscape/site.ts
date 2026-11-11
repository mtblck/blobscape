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

/** The splat experiments: the Experiments page, the front page, the menu and the footer. `needs` is what the browser must have. */
export const EXPERIMENTS = [
  {
    id: 'creature',
    title: 'Creature',
    url: '/creature/',
    needs: 'WebGPU or WebGL 2',
    body: 'A fox made of blobs that trots on our own splat engine. Make it big or small, then take it away as a rigged 3D model for Blender or a game engine.',
  },
  {
    id: 'fit',
    title: 'Fit a Picture',
    url: '/tools/fit-a-picture/',
    needs: 'any modern browser',
    body: 'Watch a few hundred blobs start as noise and train themselves into a picture, live in your browser. It is the same loop that turns photos into a splat, in 2D.',
  },
  {
    id: 'sprite',
    title: 'Splat to Sprite',
    url: '/tools/splat-to-sprite/',
    needs: 'WebGL 2',
    body: 'Frame a splat like a game camera and bake it into palette-locked pixel-art sprite sheets, walking in four directions.',
  },
] as const

