# Scene descriptions

A pixel-art scene can be written as data alone: a list of shapes, paints, bones and moves, with no code. The engine checks it, cuts it into blobs, and plays it in pixel mode. Every Pixel Diorama scene but the lighthouse is written this way: see `src/blobscape/diorama/scenes/` (`campfire.ts` is a good first read).

The point is that Claude can write one from a sentence. A scene that is data can be checked before it runs, built in a second or two, and changed one line at a time, so "make eight, pick one, refine it" is cheap.

- The type, with a comment on every field: `src/splat-engine/sceneDoc.ts` (`SceneDoc`).
- `checkScene(doc)` returns what is wrong, each as `where: what` (`parts[12].shape.r: must be a number`). Empty means sound.
- `compileScene(doc)` gives the builder's spec, the poser, the lights and the pixel look. It throws on an unsound description. Its `empty(built)` lists parts that came out with no blobs (a hole that swallows its shape), which the checker can't see; the page warns in the console.

## What a description holds

| Field | What it is |
| --- | --- |
| `name`, `loop` | A name, and the seconds before everything repeats. |
| `palette` | 2 to 32 colours, `'#rrggbb'`. The picture uses only these. |
| `sky` | Top and bottom colours of the backdrop. |
| `light` | The baked sun: where it is, how much light reaches everywhere, how dark shadows are. |
| `look` | Dither, glow, outline, edge lines. |
| `camera` | Where the view starts, and optionally a `swing`: degrees (0 to 60) it rocks to either side, once a loop, as the scene plays. |
| `bones` | Things that move, each with the point it turns about. Parts with no bone stand still. |
| `parts` | A shape, a paint, and optionally a bone, `glow` or `noShadow`. |
| `moves` | spin, sway, bob, drift, pulse. Each names a bone and a whole number of `times` per loop; a bone takes up to six. |
| `lights` | Up to four live lights, which can flicker or go round a circle. |

Shapes: `sphere`, `ball` (stretched), `box`, `cylinder` (can taper), `cone` (a round-ended stick), `ring`, `roof`, and `join`, `cut`, `rough` to combine them.

Paints: a colour, or `bands`, `bricks`, `hex` (honeycomb, scales, paving), `speckle`, `patches`, `faces` (top, side, under), `split` (one paint below a height, another above). Paints nest.

## Rules that make a scene work

1. **Units.** About 1 is a small house. y is up and the ground is y = 0. The camera starts on the +z side, so put the interesting face toward +z. Keep everything within 4 of the middle, and a whole scene about 4 across: the checker turns down parts over about 3 across and scenes with too much surface, because they take seconds to build.
2. **Paint in palette colours.** Baked light darkens a colour, and the picture then snaps to the nearest palette colour. So the palette needs a darker step for each main colour (three or four greens, not one), and neutral greys if there is stone. Without them, shade snaps to something odd, like brown.
3. **Glow is for light sources.** `glow: true` parts take no light and spill light on their neighbours: flames, lamps, windows, stars, the moon. Small bright things that must stay readable (flowers, birds) can use it too.
4. **Every move loops.** `times` is a whole number, so the scene repeats exactly. Use different `times` and `phase` on similar things (trees, fireflies) so they don't move in step.
5. **Particles are parts on their own bones.** Smoke, sparks and bubbles are small parts, each on a bone with a `drift` move, with `phase` spread from 0 to 1.
6. **A bone turns about its `at`.** Put it at the hinge: the hub of a wheel, the foot of a tree. A child bone (`parent`) rides its parent, as a wing rides a circling bird.
7. **Join only what is close together.** A `join` is searched as one box, so joining far-apart shapes (every star in the sky) is slow. Make them separate parts.
8. **A cone has round ends.** It reaches `r` past both ends. For a flat-bottomed cone (a pine tier, a spire) use a `cylinder` with a small `rTop`.
9. **Thin is fine.** Anything thinner than the grid is fattened to one cell, so a rope or a star still shows at every detail level.
10. **Detail comes from parts and paint.** Sixty to ninety parts make a full scene, and a showpiece can take about 150. Give big surfaces a paint with texture (`patches` on grass, `bricks` on walls, `bands` on planks and tiles), and scatter small things: stones, flowers, mushrooms.

## Getting the look of a showpiece

The dragon scene (`scenes/dragon.ts`) follows a few habits that make a scene read as a single strong image:

- **No sky.** Leave `sky` out and the subject sits on the dark of the page.
- **Few hues.** A dark ramp for the setting, one hue ramp for the subject, and two or three steps of a warm accent used only on light sources.
- **One big subject.** Build it from many small parts (the dragon is about 140, mostly cones) and let it fill the frame.
- **A chain of bones for anything that bends.** Each neck bone has the one before as its `parent` and sways a few degrees; the turns add up along the chain, so the head sweeps wide while each joint barely moves. A jaw is a child of the head with one `sway`.
- **Embers or dust.** A dozen or so tiny `glow` parts with slow `drift` moves give the air depth.
- **Small parts cast no shadow.** Mark fronds, petals, legs and the like `noShadow`: every shadow caster is checked for every lit cell, so a hundred small ones double the build time for shadows nobody sees.
- **A slow swing of the camera** shows that the scene is solid.

## Prompting for one

Give Claude the type and one existing scene, then say what you want:

> Here is `SceneDoc` (paste `sceneDoc.ts` down to the end of `LightDoc`) and an example (paste `campfire.ts`). Write a new `SceneDoc`: a fishing hut on a frozen lake at dawn, with smoke from the chimney, a swinging lantern, a hole in the ice and falling snow. Follow the rules in docs/scene-descriptions.md. Return only the object.

Then:

1. Run `checkScene` on what comes back. If it lists mistakes, paste the list back and ask for a fix. The messages say where each one is.
2. Add it to `DIORAMAS` in `src/blobscape/diorama/scenes.ts` with `described(id, DOC, 'what is in the picture')` and open `/experiments/pixel-diorama/?scene=<id>`.
3. Look, then ask for changes in words: "the hut is too small", "more snow", "warmer palette". Small changes are small edits.

Asking for several different takes at once and picking the best works better than polishing the first.

## What it can't do yet

- Turned boxes: a box or a roof is always square to the axes, and a bone has no resting turn. Build slanted things from cones.
- Characters that walk. Bones here turn, slide and grow; there is no skinning between them (creatures use `body.ts` for that).
- Paint that follows a round wall: `bricks` run along x or z, which holds up on a tower but isn't exact.
