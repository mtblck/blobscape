/**
 * The words of the engine page (/engine/), kept as data so the page (Engine.tsx)
 * and its prerendered HTML (scripts/prerender.ts) say the same thing.
 */
export const ENGINE = {
  title: 'The Blobscape engine',
  lede: 'A small engine for Gaussian splats that move. Everything on this site that walks, grows, ticks or burns is drawn by it: creatures on bones, whole worlds in one sort, and scenes turned into pixel art.',
  note: 'It is built on three.js and runs on WebGPU, with a WebGL 2 fallback.',
} as const

/** The three live demos, in the order of their chips. */
export const DEMOS = [
  {
    id: 'creature',
    label: 'A creature',
    title: 'A dragon on 44 bones',
    body: 'Tens of thousands of blobs, each moved by its bones on the graphics card every frame. Its scales, shading and shadows are baked into the blobs. The fire is made of bones that grow out of its mouth, and it gives light: it warms the hide, casts shadows and burns the floor it lands on.',
    link: { label: 'Open Splat Creatures', href: '/experiments/creature/' },
    about: 'An ember dragon made of Gaussian splats, rearing back and breathing fire onto the stone in front of it',
  },
  {
    id: 'world',
    label: 'A world',
    title: 'A forest that grows as you walk',
    body: 'The elf, the path and every tree, fern and flower are one world: each plant is its own small rig, and all of their blobs are sorted and drawn together. Here the elf walks alone. In Forest Walk you steer.',
    link: { label: 'Open Forest Walk', href: '/experiments/forest-walk/' },
    about: 'An elf made of Gaussian splats walking down a forest path, seen from behind, while plants grow up on both sides',
  },
  {
    id: 'pixel',
    label: 'A pixel scene',
    title: 'Pixel art that is still 3D',
    body: 'The same blobs, drawn small, snapped to a palette and scaled up in whole pixels, with outlines, glow and live lights. Drag to turn it: the pixels hold steady while the view moves.',
    link: { label: 'Open Diorama', href: '/experiments/diorama/' },
    about: 'A great owl in a wizard hat watching a cauldron of glowing potion, drawn as moving pixel art',
  },
] as const

export type DemoId = (typeof DEMOS)[number]['id']

/** The strip of recorded pixel scenes under the demos (loops from diorama/loops.ts). */
export const PIXEL_STRIP = {
  title: 'Pixel scenes, written as data',
  body: 'Each of these is a short description of shapes, paints, bones and moves, cut into blobs and drawn as pixel art by the engine. These loops were recorded from Diorama, where every one of them plays live.',
  link: { label: 'See all of them in Diorama', href: '/experiments/diorama/' },
} as const

/** The creature element: one script and one tag on any page. The code is what the page shows and what a visitor copies. */
export const ONE_TAG = {
  title: 'One tag on any page',
  body: 'A creature saved from Splat Creatures plays on any web page from one script and one element, with no build step. It is an ordinary .glb, so the same file opens in Blender and three.js.',
  try: 'Drag to turn the fox. It watches your pointer, and a tap makes it stop and look round.',
  alt: 'A fox made of Gaussian splats, trotting on the spot',
  script: 'https://blobscape.dev/embed/blobscape-creature.js',
  file: '/rigged-splats/fox.glb',
  poster: '/rigged-splats/fox.png',
  code: `<script type="module" src="https://blobscape.dev/embed/blobscape-creature.js"></script>

<blobscape-creature
  src="https://blobscape.dev/rigged-splats/fox.glb"
  move="trot" tap="idle" look="pointer"
  alt="A fox trotting"></blobscape-creature>`,
  link: { label: 'Every attribute, in the docs', href: '/engine/docs/#on-any-page-with-one-tag' },
} as const

export const FEATURES = [
  { title: 'Bones for blobs', body: 'Every blob follows up to four bones, blended on the graphics card. Bones turn, slide and grow, so a tongue shoots out, a tree sprouts and a slime bursts.' },
  { title: 'One world, one sort', body: 'Every actor shares one set of blobs, sorted together each frame. A hero, forty slimes and the hall round them overlap the way they should.' },
  { title: 'Made, not captured', body: 'Creatures and scenes are written as shapes and cut into blobs, with sun and shadows baked in. A whole scene can be plain data, with no code.' },
  { title: 'Live lights', body: 'Up to sixteen point lights shade the baked colors by distance and facing: torches, a turning lamp, a spell in flight.' },
  { title: 'Pixel mode', body: 'Draws the scene small and turns it into pixel art: palette, dither, outlines, glow and pixels that stay put as the camera swings. Sprite sheets come from the same pass.' },
  { title: 'Files that travel', body: 'A rigged, animated splat saves as one .glb, written to the glTF splat extension plus ordinary skins and animation. three.js opens it as a still splat; with our reader it moves.' },
] as const

/** How it sits beside Spark, the splat renderer the lessons and the sandbox use. */
export const BESIDE = {
  title: 'Where it sits',
  intro: 'Most splat renderers are made to show a place that was captured with a camera. This one is for things that are made and that move. On this site the two work side by side.',
  ours: { title: 'Use this engine for', items: ['Characters and props on bones', 'Worlds of many moving things', 'Pixel art and sprite sheets from 3D', 'Rigged splats saved as .glb'] },
  spark: { title: 'Use Spark for', items: ['Captured rooms and places', 'Very large scans', 'Editing a capture', 'Headsets and portals'] },
  note: 'They trade files, not a renderer: a scene is drawn by one or the other.',
} as const

/** Three ways in, from no code to code. */
export const DOORS = [
  { title: 'Use the tools', body: 'No code. Make a creature, a monster or a pixel scene in the experiments and take it away as a model, a sprite sheet or a picture.', link: { label: 'See the experiments', href: '/experiments/' } },
  { title: 'Use the files', body: 'Download a rigged creature as a .glb from Splat Creatures and open it in your own three.js project. The file rule is written up as a draft spec.', link: { label: 'Read the rigged-splat spec', href: '/engine/rigged-splats/' } },
  { title: 'Use the code', body: 'A package for three.js, @blobscape/engine, with the Build with the engine lessons as its guides and docs with every export. Install it with npm install @blobscape/engine three.', link: { label: 'Read the docs', href: '/engine/docs/' } },
] as const

/** Ids of the experiments (site.ts) drawn by the engine: each links here, and this page lists them. */
export const ENGINE_BUILT: readonly string[] = ['bouquet', 'fourways', 'daynight', 'pond', 'brush', 'flow', 'shift', 'diorama', 'scan', 'dungeon', 'clockwork', 'forest', 'creature']

/** The link an engine experiment's page carries. */
export const BUILT_ON = 'Built on the Blobscape engine'
