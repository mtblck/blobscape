/**
 * What's New (/whats-new/): the site's posts, newest first. A post is data: the day it is about, a title, a
 * summary for the list and for link previews, a picture, and a body written in the small Markdown that
 * `markdown.ts` reads (paragraphs, `##` headings, flat lists, bold, links; one entry of `body` per block).
 * Links to our own pages start with a slash, so they open in place.
 *
 * A new post goes first. Write one for each release (its `version` shows beside the date) and for anything
 * else worth telling: a new experiment, a new part of the lessons. CHANGELOG.md stays the full list of changes;
 * a post is the story of the ones that matter, in words for a visitor.
 */
export interface Post {
  /** The post's address: /whats-new/<id>/. Never change one that has been published. */
  id: string
  /** The day it is about, YYYY-MM-DD. */
  date: string
  title: string
  /** Two or three sentences: the list shows them, and so does a link preview. */
  summary: string
  /** A 16:10 picture from public/ (an experiment's cover, or one in public/news/), and what it shows. */
  image: { src: string; alt: string }
  /** The release this post is about, if it is about one. */
  version?: string
  /** The post, a block of Markdown per entry. */
  body: string[]
}

const CHANGES = 'https://github.com/mtblck/blobscape/blob/main/CHANGELOG.md'

export const POSTS: Post[] = [
  {
    id: 'dragon-breath',
    date: '2026-11-18',
    title: 'The dragon breathes for real',
    summary: 'The dragon on Splat Creatures used to puff a flame and pull it back in. Now its ribs fill, its throat glows, and the breath lights the hide, burns the floor and drifts away. Each of its three looks has a breath of its own.',
    image: { src: '/share/splat-creatures.jpg', alt: 'An ice dragon made of blobs breathing a stream of frost onto a stone floor.' },
    body: [
      'The dragon on [Splat Creatures](/experiments/creature/?creature=dragon) has had a breath move since its first day, but it was only a cone of flame that grew out of the mouth and shrank back in. This is that move done properly.',
      '## What happens now',
      '- **It breathes in first.** A new bone low in the trunk fills the ribs, and the throat and chest glow before anything leaves the mouth.\n- **The flame is a light.** It lights the dragon\'s own hide as it goes and, where the browser has WebGPU, casts shadows and glows as it would through a lens.\n- **It lands.** The dragon lunges and brings the flame down onto a floor of flagstones, where it runs along the ground, catches, spreads a little and leaves a scorch that fades.\n- **It leaves.** The breath used to shrink back into the mouth. Now its near end lets go and slides out along its own path while it thins away, with sparks off the end and smoke at the jaws after.',
      '## Three looks, three breaths',
      'The ice dragon breathes frost and leaves rime and clumps of ice on the stones. Ember breathes fire. Jade breathes a green venom. The colors are baked into the flame\'s blobs, so a look and its breath always go together.',
      'The dragon on the [engine page](/engine/) does the same. A sprite sheet or a downloaded file is still the dragon alone, with no floor and no lights, so it drops into a game as before.',
    ],
  },
  {
    id: 'release-0-4-0',
    date: '2026-11-18',
    version: '0.4.0',
    title: 'Water, daylight and one scene drawn four ways',
    summary: 'Three new experiments: a pond that ripples from real footfalls, a cabin and a city lit through a whole day, and one scene drawn by four different kinds of renderer at once. The sandbox became a workspace, and Sand, Snow and Goo was rebuilt.',
    image: { src: '/covers/wading-pond.webp', alt: 'An elf made of blobs standing in a shallow pond inside a ruin, lit by candles in a niche, with rings spreading on the water.' },
    body: [
      'Version 0.4.0 is the biggest release so far. Its theme, if it has one, is doing things for real instead of faking them.',
      '## Wading Pond',
      'In [Wading Pond](/experiments/wading-pond/) an elf wades through a shallow pond in a ruin at night. No ring on the water is drawn or spawned. The pond is a grid of heights stepped by the wave equation, and each foot going in moves its own volume of water. The rings spread, cross, bounce off the banks and die away. The water mirrors the ruin and every candle flame, and the picture is finished through a lens with glow and focus blur.',
      '## Day and Night',
      '[Day and Night](/experiments/day-and-night/) is a cabin in a clearing, or a few city blocks, with a slider for the hour. The sun and the moon follow their real paths for the latitude and season you pick. Shadows turn and stretch, the light reddens toward sunset, windows come on a few at a time, and fireflies and stars come out. Nothing is baked into the colors: it is all live light.',
      '## One Scene, Four Ways',
      '[One Scene, Four Ways](/experiments/four-ways/) answers a question: what do you get if you ask for the same scene with no engine at all, with three.js meshes, with Spark splats, or with Blobscape? All four draw a fox trotting through tall grass at the same moment, with the same pixel-art finish, and cards below say plainly what each one can and cannot do.',
      '## Also in this release',
      '- **The sandbox is a workspace.** It fills the screen, with five modes (Build, Select, Creatures, Effects, Scene) and only the open mode\'s tools beside the view. [Open the sandbox](/sandbox/).\n- **Sand, Snow and Goo is rebuilt.** Snow breaks into clumps and packs down, goo keeps its volume and flows, and you can drop a ball, a cube or a rock into any of them. [Try it](/experiments/sand-snow-goo/).\n- **Two new pixel scenes:** a koi pond in the rain, with real water, and the fox and wisp. [See Pixel Diorama](/experiments/pixel-diorama/).\n- **Skin that stretches.** The dragon\'s wings and the frog\'s legs used to tear as they moved. Blobs now stretch with the skin they are part of.\n- **Brush and Ink draws outlines,** as a pen and wash drawing has.\n- **Links preview with a picture** of the page they lead to.',
      `Every change is in the [changelog](${CHANGES}).`,
    ],
  },
  {
    id: 'release-0-3-0',
    date: '2026-11-18',
    version: '0.3.0',
    title: 'A photo becomes a scene, and blobs become brush marks',
    summary: 'The sandbox learned a lot at once: open a photo and walk round it, tap a thing to select all of it, paint grass and fur, mend holes, and fly a camera path. Brush and Ink draws splats as paint, and a creature now fits on any web page with one tag.',
    image: { src: '/covers/brush-and-ink.webp', alt: 'A windmill on a small island with trees and a pond, drawn as brush marks and pen strokes, half on dark ground and half on paper.' },
    body: [
      'Version 0.3.0 is mostly about the [sandbox](/sandbox/), which went from a place to spray blobs to a place to work on a scene.',
      '## New in the sandbox',
      '- **One photo to a scene.** Open a photo and it becomes a shallow scene, a blob for each pixel, set as far back as a depth model guesses. The model runs in the page and is served by this site, so the photo never leaves your device.\n- **Tap to select.** Click a mug, a leaf or a chair and everything that belongs to it is selected, the far side too.\n- **Brushes.** Paint grass that bends, fur that lies the way you drag, moss, stones that keep apart and leaves on sprigs.\n- **Fill and Stamp.** Fill grows blobs into a hole from its edge. Stamp copies what is round one place to another.\n- **A camera path.** Save a few views, play a smooth glide through them, and save it as an MP4 made on your device.\n- **Open a rigged model.** A .glb of triangles on bones, from Blender or a game kit, becomes blobs on its own bones and plays its own animations.',
      '## Brush and Ink',
      '[Brush and Ink](/experiments/brush-and-ink/) draws the same blobs as marks instead of soft dots: gouache, oil, ink and wash, or hatching. Every mark belongs to one blob, so the painting turns with the view and nothing swims.',
      '## A creature from one tag',
      'The engine now ships a custom element. One script and one tag put a moving creature on any web page, with no build step. Drag turns it, its head can follow the pointer, and it waits until it is near the screen before it starts. The [engine page](/engine/) shows one live beside its code.',
      '## Pixel Diorama',
      '[Pixel Diorama](/experiments/pixel-diorama/) settles each pixel from four samples, so edges are one thing or the other. Outlines take a darker tone of whatever they are round. And How it\'s made, under the view, walks through five steps from plain clay shapes to the finished picture.',
      `Every change is in the [changelog](${CHANGES}).`,
    ],
  },
  {
    id: 'release-0-2-0',
    date: '2026-11-17',
    version: '0.2.0',
    title: 'The engine is a package you can install',
    summary: 'The engine behind the experiments is on npm as @blobscape/engine, with docs and three new lessons that end in code you can copy. Sand, Snow and Goo arrives too: a box of blobs that flow.',
    image: { src: '/covers/sand-snow-goo.webp', alt: 'Three trays side by side, each holding a heap made of blobs: sand, snow and green goo.' },
    body: [
      'Until now the engine that draws the creatures, the forest, the dungeon and the pixel scenes lived inside this site. With version 0.2.0 it is a package for three.js that anyone can install:',
      '```\nnpm install @blobscape/engine three\n```',
      'It is version 0.x, so its API will still change. The [engine page](/engine/) says what it does, and the [docs](/engine/docs/) list everything it exports.',
      '## Build with the engine',
      'A fourth part of the [lessons](/lessons/) teaches the engine by using it. Each lesson ends with the code for whatever you made, to copy.',
      '- [Your first creature](/lessons/first-creature/): a slug of two shapes on two bones. Make its tail bend and close the crease where it joins.\n- [A scene written as data](/lessons/scene-data/): a cottage at dusk as a page of JSON you edit, with a checker that says what is wrong and where.\n- [Pixel art that holds still](/lessons/pixel-art/): the cottage drawn small in a few colors, and how to stop its pixels flickering.',
      '## Sand, Snow and Goo',
      '[Sand, Snow and Goo](/experiments/sand-snow-goo/) is a box of blobs where every blob is a particle in a small physics simulation. Sand runs into a heap, snow stands until it is hit, and goo spreads.',
      '## Loose parts swing',
      'The elf\'s cloak and plait, the fox\'s brush and the dragon\'s tail now swing after the body as cloth and settle when it stops, on [Splat Creatures](/experiments/creature/), in [Forest Walk](/experiments/forest-walk/) and in [Dungeon Run](/experiments/dungeon-run/).',
      `Every change is in the [changelog](${CHANGES}).`,
    ],
  },
  {
    id: 'release-0-1-0',
    date: '2026-11-17',
    version: '0.1.0',
    title: 'The first release: 21 lessons, nine experiments and an engine',
    summary: 'Blobscape gets its first version number, and its code is public under the MIT license. Here is what the site held on that day, and what had just been added: worlds with weather, feet that find the ground, and sandbox creatures that walk about.',
    image: { src: '/covers/forest-walk.webp', alt: 'An elf made of blobs, seen from behind, walking down a forest path between trees and tall grass.' },
    body: [
      'A week after the first experiment went up, Blobscape got a version number. Version 0.1.0 marks the site as it stood: 21 lessons in three parts, a sandbox, nine experiments, and the engine they run on. The code went public under the MIT license the day before.',
      '## What had just landed',
      '- **Worlds and weather.** Scenes written as data can now hold brick walls that crumble, crystals, trees grown by rule, worn canyons, and snow that falls, lands and drifts. Four new scenes in [Pixel Diorama](/experiments/pixel-diorama/) show them: a ruined chapel, a crystal cave, a desert canyon and a snowed-in cabin.\n- **Feet on the ground.** In the [lesson](/lessons/feet/) the elf walks over a dirt path, up stone steps, up a slope and over rocks, with a walk for each and every foot planned so it never goes through a step. In [Forest Walk](/experiments/forest-walk/) the elf and the fox walk on planted feet that never slide.\n- **Grass fire.** Forest Walk\'s grass can catch, burn across the meadow and grow back.\n- **Sandbox creatures with a life.** A creature in the [sandbox](/sandbox/) can wander round its spot and look at you as you move, and the whole scene saves as one file with every creature still moving.\n- **A new lesson,** [Why small blobs shimmer](/lessons/shimmer/): a wire fence that blinks in the distance, and the blur that stops it.',
      '## The engine gets a page',
      'The [engine page](/engine/) shows what the engine is with three live demos, and the draft [file spec](/engine/rigged-splats/) says how a rigged, moving splat is saved as a .glb. Every pixel scene also has a recorded loop in a gallery, for anyone who would sooner watch than load one.',
      `Every change is in the [changelog](${CHANGES}).`,
    ],
  },
  {
    id: 'fur-morphs-and-new-creatures',
    date: '2026-11-16',
    title: 'Fur, a pufferfish and a new cast of creatures',
    summary: 'Every creature was rebuilt with the same cutter that makes the pixel scenes. The fox grew fur, the monsters grew scales, and two new lessons teach morphs and fur. Shape Shifter turns any one of them into another.',
    image: { src: '/covers/shape-shifter.webp', alt: 'A creature made of blobs caught halfway as a frog turns into another creature, its head still that of a frog.' },
    body: [
      'The creatures were the oldest things on the engine, and they looked it. This was the day they caught up.',
      '## A new cast',
      'The dragon, the frog, the elf and the fox on [Splat Creatures](/experiments/creature/) are now cut the way the pixel scenes are: shapes carved into a grid of flat discs with light and shadow baked in, then hung on bones. Three more came across from the pixel scenes: a crocodile, a jellyfish and an owl.',
      '- **The fox has fur.** Each strand is one long, thin blob rooted in the skin, thousands of them.\n- **Monsters from a seed** now get fur, scales or smooth wet skin from the same number that picks their legs, and those legs no longer pass through each other.\n- **The elf\'s cloak** keeps clear of the legs as it walks.',
      '## Two lessons',
      '[Morphs](/lessons/morphs/) is a pufferfish with no moving bones that swells, bristles and swings its tail. [Fur and grass](/lessons/fur/) is a coat of five thousand strands and a lawn in the wind.',
      '## Shape Shifter',
      'In [Shape Shifter](/experiments/shape-shifter/) one creature turns into another. Every blob finds a partner in the other creature and travels to it, straight, in a swirl, through a puddle or out in a burst.',
      '## Dungeon Run heats up',
      '[Dungeon Run](/experiments/dungeon-run/) got fire and frost that spread across the floor, climb the walls and meet in steam, crates and barrels that break into their own pieces, and shadows from every torch and fireball.',
      'The site changed too: a clearer front page, a way to [get in touch](/contact/), and pages that show their real content from the first moment instead of a stand-in.',
    ],
  },
  {
    id: 'pixel-diorama',
    date: '2026-11-15',
    title: 'Pixel Diorama: pixel art cut from splats',
    summary: 'A new experiment that draws moving 3D scenes as pixel art: shapes cut into a grid of solid blobs, moved by bones, drawn small and snapped to a palette. It opened with a lighthouse and had more than a dozen scenes two days later.',
    image: { src: '/covers/pixel-diorama.webp', alt: 'A pixel-art lighthouse on a small island in a dark blue sea under a night sky with clouds.' },
    body: [
      'Splats are usually soft and see-through. [Pixel Diorama](/experiments/pixel-diorama/) uses them the other way: every blob is a small solid disc lying on a surface, with sun and shadow painted into its color. Draw that small, cut it to a palette, add an outline, and it reads as pixel art that you can turn.',
      'It began with one scene, a lighthouse at dusk written in code. Three things made it grow quickly.',
      '## Scenes as data',
      'A scene is a description: a list of shapes, paints, bones and moves, with no code in it. The site checks a description, says where it is wrong, and builds it. That made new scenes cheap to write, and within two days there were more than a dozen: a campfire, a red dragon over lava, a bee in a forest, a stone hand, a jellyfish reef, a storm octopus, sky islands, a snail house and more.',
      '## Pixels that hold still',
      'Moving 3D drawn as pixel art tends to crawl: pixels between two colors flip back and forth as lights flicker and the view swings. A day later came steady pixels, which let a pixel keep its color unless another is clearly closer, and a Motion choice that can hold the pose at 12 or 8 frames a second, as hand-drawn animation does.',
      '## One layout for every experiment',
      'With this many options it was time to tidy up. Every experiment now has the same page: the preview on the left, the options in tabs on the right. The [Experiments](/experiments/) page lists them like posts, each with the day it was published, newest first.',
    ],
  },
  {
    id: 'four-experiments-and-real-captures',
    date: '2026-11-12',
    title: 'A forest, a dungeon, a watch and a scan',
    summary: 'Four experiments in two days, each one asking the new engine for something more: a whole world, a game, a mechanism and a real capture. The lessons grew a third part about splats made from photos.',
    image: { src: '/covers/dungeon-run.webp', alt: 'An elf hero made of blobs raising a sword among yellow, red, purple and green slimes in a torchlit dungeon hall.' },
    body: [
      'With an engine that could move one creature, the next question was what else it could carry.',
      '- **[Forest Walk](/experiments/forest-walk/)** is a whole world. Steer the elf down an endless forest path while trees, ferns, flowers and mushrooms grow out of the ground as you come. The elf, the fox and every plant are one scene, sorted once.\n- **[Dungeon Run](/experiments/dungeon-run/)** is a game. A sword and magic against five colors of slime that burst into splats, in a hall lit by live torchlight.\n- **[Clockwork](/experiments/clockwork/)** is a mechanism. A watch movement keeping the real time, every wheel a bone turning by a real watch\'s tooth counts.\n- **[Scan Studio](/experiments/scan-studio/)** is for real captures. Open a splat scan from a phone, level it, cut away the floor and the floaters, and relight it.',
      'Splat Creatures also learned to make a monster from a number, and to hand any creature over as a pixel-art sprite sheet.',
      '## Real things from photos',
      'Splats were invented to capture real places from photographs, so the lessons got a third part about that:',
      '- [Photo shoot](/lessons/shoot/): photograph a toy bird and train blobs to match.\n- [Fuzzy things](/lessons/fuzzy/): grass and fluff as splats and as a mesh, and which keeps what.\n- [Floaters and cleanup](/lessons/floaters/): what a rushed capture leaves in the air, and what no cut can fix.\n- [Lighting is baked](/lessons/lighting/): a scan keeps the light it was shot in.',
    ],
  },
  {
    id: 'an-engine-of-our-own',
    date: '2026-11-11',
    title: 'An engine of our own, and creatures that walk',
    summary: 'Existing splat renderers draw still scenes well, but none could give a splat bones. So Blobscape got its own small engine for splats that move, five lessons on rigs, and a page of creatures to download as animated 3D models.',
    image: { src: '/covers/splat-creatures.webp', alt: 'Three foxes made of blobs trotting in a row: a white one, a red one and a gray one.' },
    body: [
      'The first lessons were drawn with Spark, a renderer for splats, and it draws still scenes very well. But the plan was creatures that walk, and for that a blob has to follow a bone the way the skin of a game character does.',
      '## The engine',
      'So this was the day Blobscape got its own engine, built on three.js. It holds every blob of every creature in one world. On WebGPU, each frame it bends the blobs to their bones, works out where each lands on screen, sorts them all once and draws them. Where a browser has only WebGL it does the same job more slowly. Before going further, a prototype had to pass a hard test: a walking creature of 200,000 blobs at a smooth 60 frames a second on a phone. It did.',
      'It also saves what it draws. A rigged, animated splat goes out as a .glb file, using a draft rule for how a blob should turn and stretch with its bones.',
      '## Rigs and 3D models',
      'A second part of the [lessons](/lessons/) teaches how that works: [One bone](/lessons/one-bone/), [Weights](/lessons/weights/), [Twist without tearing](/lessons/twist/), [Walk cycle](/lessons/walk/) and [Blobs to a model](/lessons/model/).',
      '## Splat Creatures',
      '[Splat Creatures](/experiments/creature/) opened with a fox, then a frog, an elf and an ice dragon. Watch one move, see the bones under the blobs, and download it as a rigged model for Blender or a game engine. The same creatures can be dropped into the [sandbox](/sandbox/), where they move about in your scene.',
    ],
  },
  {
    id: 'blobscape-opens',
    date: '2026-11-11',
    title: 'Blobscape opens: eight lessons and a sandbox',
    summary: 'The lessons that give the site its name: start with one blob, learn what each of its numbers does, then pile up thousands. With a sandbox for your own captures, and a home of its own at blobscape.dev.',
    image: { src: '/news/first-lessons.webp', alt: 'The first lesson, One blob: a single soft blob in a dark display case, with sliders for its numbers below.' },
    body: [
      'A Gaussian splat is a 3D scene made of nothing but soft, see-through, colored blobs. That is easy to say and hard to picture, so Blobscape teaches it by letting you pull the thing apart.',
      '## Eight lessons',
      'Each lesson is a question with a few goals to tick, a display case to look into and a desk of controls.',
      '- [One blob](/lessons/one-blob/): the 14 numbers that make one Gaussian.\n- [Footprint](/lessons/footprint/): how a 3D blob lands on screen as a 2D ellipse.\n- [Order matters](/lessons/order/): why see-through blobs must be drawn back to front.\n- [Many make a shape](/lessons/many/): from one blob to twenty thousand.\n- [Color by angle](/lessons/angle/): a blob that changes color as you walk round it.\n- [Paint](/lessons/paint/): spray blobs by hand.\n- [Splat files](/lessons/formats/): the same scene saved three ways.\n- [Break it](/lessons/break/): blow the scene apart and put it back.',
      'The goals point, and never give the answer. Progress is kept only in your browser.',
      '## A sandbox',
      'The [sandbox](/sandbox/) is the lessons with the rails off. Spray blobs, select them with a box or a lasso, recolor them, run effects on them, or open your own capture. Nothing is uploaded.',
      '## A home of its own',
      'Blobscape started as one page among a few experiments. On this day it moved to blobscape.dev, with its own look and a real address for every page.',
    ],
  },
  {
    id: 'two-tools-to-start',
    date: '2026-11-10',
    title: 'Two tools to start: Splat to Sprite and Fit a Picture',
    summary: 'Before there were lessons, there were two small tools. One turns a 3D splat into a pixel-art sprite sheet. The other shows the training loop that makes a splat, in two dimensions, slowly enough to watch.',
    image: { src: '/covers/splat-to-sprite.webp', alt: 'A round flask shown half as a soft 3D splat and half as the pixel-art sprite made from it.' },
    body: [
      'This is where it began: two tools built in a day, each a first try at one half of what Blobscape became.',
      '## Splat to Sprite',
      '[Splat to Sprite](/experiments/splat-to-sprite/) takes a Gaussian splat, looks at it from four sides, and draws each view small with a short palette. Out comes a sprite sheet a 2D game can use. It was the first sign that splats and pixel art get along.',
      '## Fit a Picture',
      '[Fit a Picture](/experiments/fit-a-picture/) is the other end of the story: where splats come from. Give it a picture and it trains a few hundred 2D blobs to match, moving, stretching and recoloring them step by step while you watch the error fall. It runs on your device, with the math written out by hand.',
      'Both are still here, and both still work the way they did on day one.',
    ],
  },
]

/** The post with an id, if there is one. */
export const postById = (id: string): Post | undefined => POSTS.find((p) => p.id === id)

/** The posts either side of one: `newer` is the one above it in the list, `older` the one below. */
export function neighbors(id: string): { newer?: Post; older?: Post } {
  const i = POSTS.findIndex((p) => p.id === id)
  return i < 0 ? {} : { newer: POSTS[i - 1], older: POSTS[i + 1] }
}

/** The What's New page's intro, shared with its prerendered HTML and its description. */
export const NEWS = {
  title: "What's new",
  intro: 'What has been added to Blobscape and why, newest first: new experiments, new lessons, each release of the engine, and how the whole thing got here.',
  path: '/whats-new/',
  feed: '/whats-new/feed.xml',
} as const

/** The post's body as one Markdown text. */
export const postText = (p: Post) => p.body.join('\n\n')
