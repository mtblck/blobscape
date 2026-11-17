# Changelog

What changed on blobscape.dev, newest first. Releases follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add entries under [Unreleased] as work lands; `npm run release -- x.y.z` moves them under a new version, and
merging that PR makes the tag and the GitHub release (see docs/releasing.md).

## [Unreleased]

## [0.1.0] - 2026-11-17

The first tagged release of blobscape.dev: lessons, a sandbox and experiments with Gaussian splats, and the Blobscape engine they run on. It marks the site as it stands. The `@blobscape/engine` npm package comes later (#102).

### Lessons (20)

Three parts, each lesson a question with goals to tick:

- **One object** (1 to 8): One blob, Footprint, Order matters, Many make a shape, Color by angle, Paint, Splat files, Break it.
- **Rigs and 3D models** (9 to 16): One bone, Weights, Twist without tearing, Walk cycle, Feet on the ground, Blobs to a model, Morphs, Fur and grass.
- **Real things from photos** (17 to 20): Photo shoot, Fuzzy things, Floaters and cleanup, Lighting is baked.

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

[Unreleased]: https://github.com/mtblck/blobscape/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mtblck/blobscape/releases/tag/v0.1.0
