# Changelog

What changed on blobscape.dev, newest first. Releases follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add entries under [Unreleased] as work lands; `npm run release -- x.y.z` moves them under a new version, and
merging that PR makes the tag and the GitHub release (see docs/releasing.md).

## [Unreleased]

- The support button opens two ways to support: Buy me a coffee (Ko-fi) and Star on GitHub, in a plain card.

- A simpler header: Engine opens a list with its overview, the docs, the file spec and the package on npm and GitHub; the theme has its own button; and wide screens no longer have a Menu button. The support button is on every page, as a small circle where a page has controls. The engine page has a Read the docs button at the top.

- Tap to select in the sandbox: turn on "A click with Select takes the whole thing" in the Selection tab and a click on a mug, a leaf or a chair selects everything that belongs to it, the far side too. A small model (a slimmed Segment Anything, 14 MB, served by this site) looks at the view on your device.

- The sandbox works with an assistant in the browser: where the browser has WebMCP (Chrome is trying it out), the sandbox offers its actions as tools, so an assistant can look at the scene, build one from a scene description, add a creature, cut, recolor, paint with a brush, save and undo. Other browsers see no change.

- One photo to a scene in the sandbox: open a photo in the Scene tab (or drop one on the view) and it becomes a shallow scene, a blob for each pixel set as far back as a depth model guesses. The model runs in the page and is served by this site, so the photo stays on your device.

- The engine docs are in parts: Core (Stage, the world, the camera, bones) comes first, and the specialist pieces sit under Movement, Creatures, Shapes and scenes, Pixels and sprites, Simulation, Picking, detail and edits, and Files and models. The contents list opens a part when you ask or read into it.

- A camera path in the sandbox: save a few views as stops in the Scene tab, play a smooth glide through them, and save it as an MP4 made on your device.

- A view that fails to start WebGPU or WebGL the first time now tries again by itself, instead of saying the browser can't and working after a reload. The engine package's `Stage.start` does the same.

- Brushes in the sandbox: Paint lays grass, fur, moss, stones or leaves onto whatever is under the ring, each by its own rule. Grass bends, fur lies the way you drag, stones keep apart, leaves grow on sprigs.

- Two mending tools in the sandbox. Fill grows blobs into a hole from its edge, in the size, facing and colors of the blobs beside it. Stamp copies what is round one place to another: click what to copy, then drag where the copy should go.

- The engine's API reference is now its docs page (/engine/docs/; the old address goes there): a getting-started guide from the package's README, then a card for every export with its properties, methods and signatures, names in types linked to their entries, and a contents list that follows what you are reading. The reference is generated with TypeDoc from the package's own doc comments.

- The engine page, the API reference and the Build with the engine lessons now say how to install the package from npm.

- Open a rigged model in the sandbox or on Splat Creatures: a .glb of triangles on bones (from Blender, Mixamo or a game kit) becomes blobs laid over its surface on its own bones, and plays its own animations. The engine package has it as `readSkinnedGlb` and `splatModel`.

## [0.2.0] - 2026-11-17

- The engine is a package: `@blobscape/engine`, for three.js, goes to npm with this release (`npm install @blobscape/engine three`). Version 0.x: the API will change between minor versions.
- New page, the engine's API reference (/engine/api/): every name the @blobscape/engine package exports, with its declaration and what it does, and a box to find a name. The engine page's "Use the code" door now leads to it and the Build with the engine lessons.
- New lesson, Pixel art that holds still: the cottage drawn small in a few colors. Make it a small picture, cut it to four colors, and stop its pixels flickering with the lantern (steady pixels, and held poses for a swinging view); it ends with the code for your look.
- New lesson, A scene written as data: a cottage at dusk as a page of JSON you edit, with the engine's checker saying what is wrong and where. Make the tree sway, find the rule every move keeps so the scene loops, and light the lantern; it ends with the code that plays your description.
- New lesson part, Build with the engine, starting with Your first creature: a slug of two shapes on two bones, made with the engine. Make its tail bend, close the crease where it joins, and let it swing; the lesson ends with the code for the slug you made, to copy.
- New experiment, Sand, Snow and Goo: a box of blobs that flow, every one a particle in a small physics simulation. Sand runs into a heap, snow stands until it's hit, goo spreads; pour more in and tap to poke them.
- Forest Walk: the elf's cloak and plait swing after the body as cloth, trailing when it turns and settling when it stops.
- Loose parts swing on more creatures: on Splat Creatures the fox's and the dragon's tails, the elf's cloak and plait, and a monster's tail, ears or feelers swing after the body as a move plays (a switch on the Movement tab turns it off; files and sprite sheets keep the move as it is). Forest Walk's fox swings its tail, and Dungeon Run's hero its cloak.
- Rigged-splat files open in three.js: a loader hands the bones and clips to three's own animation player, and an adapter draws them with Spark.

## [0.1.0] - 2026-11-17

The first tagged release of blobscape.dev: lessons, a sandbox and experiments with Gaussian splats, and the Blobscape engine they run on. It marks the site as it stands. The `@blobscape/engine` npm package comes later (#102).

### Lessons (21)

Three parts, each lesson a question with goals to tick:

- **One object** (1 to 8): One blob, Footprint, Order matters, Many make a shape, Color by angle, Paint, Splat files, Break it.
- **Rigs and 3D models** (9 to 16): One bone, Weights, Twist without tearing, Walk cycle, Feet on the ground, Blobs to a model, Morphs, Fur and grass.
- **Real things from photos** (17 to 21): Photo shoot, Fuzzy things, Floaters and cleanup, Lighting is baked, Why small blobs shimmer (new: a wire fence that blinks in the distance, the blur that stops it, and the fade that keeps the blur honest).

New since the lessons first went up: Feet on the ground walks the elf over a dirt path, up stone steps, up a grassy slope and over a rocky path. The ground slides under it, each ground has its own walk (a heel-to-toe stride on the flat, a slower climb on the steps, high steps over the stones), and every foot is planned so it never goes through a step.

### Sandbox

Place blobs and shapes, and add creatures (fox, frog, elf, dragon, monsters, a slime, a watch) that move, then freeze them into the scene. A creature can walk about: switch it on and it wanders round its spot, turning, walking and resting. It can also look at you, or at the middle of the view, turning its head as you move round it. Effects on the whole scene (explode, melt, wind...) now move the creatures too. Save the whole scene, creatures and all, as a rigged .glb: it opens here again with every creature still moving, and on Splat Creatures as one model.

### Experiments (9)

- **Pixel Diorama**: pixel-art scenes cut from splats, 22 of them with a recorded loop each. The newest four are a ruined chapel, a crystal cave, a desert canyon and a snowed-in cabin, where snow lands and drifts. Record your own loop as an APNG or MP4, or open your own .obj or .glb model.
- **Splat Creatures**: rigged creatures, monsters from a seed, and sprite sheets. Download any of them as a rigged splat .glb.
- **Forest Walk**: walk an elf and a fox down an endless forest path that grows as you go. Now the grass can catch fire and grow back.
- **Dungeon Run**: a sword, fire and frost against slimes, with live light and shadows and props that break.
- **Shape Shifter**: one creature turns into another.
- **Clockwork**: a watch movement that keeps real time.
- **Scan Studio**: clean up and relight a phone splat scan.
- **Fit a Picture**: train 2D blobs to match a picture.
- **Splat to Sprite**: turn a splat into a pixel sprite sheet.

The Experiments page lists them like posts, newest or oldest first, and can show one kind at a time: games, creatures, pixel art, tools, or ones to watch.

### The engine

Our own renderer for animated splats, built on three.js with WebGPU and a WebGL fallback. It has bones that bend, grow and slide, morphs, live lights and shadows, level of detail, picking, foot IK and a pixel-art pass. The engine page shows three live demos. Rigged splats save as glTF using a draft extension, documented at /engine/rigged-splats/.

### Thanks

Some pixel-scene ideas come from Silicon Jungle's play kits (ideas, not code). The code is MIT licensed.

[Unreleased]: https://github.com/mtblck/blobscape/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mtblck/blobscape/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mtblck/blobscape/releases/tag/v0.1.0
