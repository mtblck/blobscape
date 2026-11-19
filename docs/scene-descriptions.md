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
| `palette` | 2 to 32 colors, `'#rrggbb'`. The picture uses only these. |
| `sky` | Top and bottom colors of the backdrop. `skyReach` (0.05 to 1) is how far down the picture the blend runs before it is all the bottom color. |
| `light` | The baked sun: where it is, how much light reaches everywhere, how dark shadows are, and three painted touches that are on unless set to 0: `ramp` (shade turns cool violet, full sun warm yellow), `crevice` (corners and cracks darken) and `wear` (sharp edges lighten). `bounce` (off unless set, 0 to 1) lets surfaces throw their color onto what faces them, so a red wall warms the floor beside it and green water tints a bank; it costs build time, so set it where a strong color stands next to a pale one. |
| `look` | Dither, glow, outline, edge lines. `steps: true` paints the scene in steps of its palette as it is cut: each cell's lit color moves to the nearest step of the ramp its own paint runs through from shade to sun, in small patches, so shade falls in flat bands that hold still instead of a smooth blend snapped later. It suits scenes with a ramp of three or more steps for each hue (the windmill uses it); with fewer, leave it off. |
| `disc` | How wide each surface blob is, as a share of the grid (0.4 to 1, 0.55 when left out). Raise it to 0.75 when the far side of a subject shows through its near side, as on the lava dragon's head; paint gets a little softer. |
| `camera` | Where the view starts, and optionally a `swing`: degrees (0 to 60) it rocks to either side, once a loop, as the scene plays. |
| `bones` | Things that move, each with the point it turns about. Parts with no bone stand still. |
| `parts` | A shape, a paint, and optionally a bone, `glow`, `noShadow`, `grime` (a color that gathers in its corners and cracks, as moss or soot), `bare` (takes none of the scene's `cover`: a sleeping fox, water, a fresh fire), `touches` (it meets another part by design as it moves, like foam round a bobbing buoy, so the check for parts passing through each other lets it), or `ink` (little drawn marks: `{ kind, amount, color }`, kind `hatch`, `stipple`, `cracks`, `grain`, `tufts` or `scales`; about `amount` of the 4-by-4 blocks of pixels get one mark, picked and turned at random so a big wall never repeats; the ink is a darker step of the paint unless `color` says otherwise). Ink shows best on a plain or gently patched paint: on busy patches it gets lost.Water, ice or glass takes `glass: { see, mirror, top }`: it shows what lies behind it (`see`, 0.6), darkening toward the bottom where nothing is met, and mirrors what stands over it and the sky (`mirror`, 0.3, stronger at a glancing look). It is painted for the scene's own camera, so keep the camera's swing small. `top: true` keeps it to upturned faces, for a pond cut as one slab with earth sides. `strokes` (0 to 1) draws each cell as a brush stroke along the level line round the shape, as on a trunk or a pot; it shows in Blobs and barely in pixel art. |
| `moves` | spin, sway, bob, drift, pulse, sprout (grows from nothing, stands, shrinks away). Each names a bone and a whole number of `times` per loop; a bone takes up to six. A move with `during: [from, to]` (shares of the loop, 0 to 1) happens only between those two moments, its `times` fitted in between, and its bone waits for the rest of the loop: this is how a scene tells a story, with a thing that appears at one moment, waves once and is gone. A sprout's `rise` and `fall` are the shares of its time spent growing and shrinking (0.4 and 0.15 when left out), so small ones make a thing pop in and out. |
| `lights` | Up to four live lights, which can flicker or go round a circle. A light that stays put can set `shadows: true`: what stands between it and a surface then hides that surface from it (baked once, so it holds as the light flickers). Only for a lamp out in the open; one inside a ring of stones or a hand just darkens the scene. A light with `during: [from, to]` shines only for that share of the loop, coming up and dying away: a flash, a spell. |
| `water` | Real water that ripples: `{ level, from, to, color }` floods the box from `from` to `to` ([x, z]) up to height `level`, wherever the ground that stands still lies under it, so cut a basin for it and keep the box inside the banks (the stones, posts and banks in it are its walls, and rings bounce off them). Nothing is drawn by hand: every raindrop of a `rain` speck with `land` that comes down on the water leaves its ring there, and each of `bodies` (`{ bone, at, r, draft }`: a ball of radius `r` at `at` riding `bone`, as a fish's back or a boat's hull) pushes its own water aside as its bone carries it through the surface. One whole loop of it is worked out when the scene opens. `sky` ([overhead, horizon]) is what it mirrors where the browser can't draw a mirror image, `clear` (0 to 1, 0.5) how much shows through from below, `ripple` (1 to 12, 4) how much steeper than true the waves are drawn, `splash` (`{ r, depth }`) a drop's mark, and `cell`, `speed` and `damping` the grid and the waves. Things under the water show through it; things standing in it are mirrored. Paint the bed dark. |
| `air` | What hangs in the air: `haze` (far things fade toward a color), `mist` (low banks that drift), `shafts` (beams of light that light what they land on) and `specks` (swarms of `dust`, `embers`, `rain`, `snow`, `leaves`, `fireflies` or `bubbles`, each speck moving on its own; rain, snow and leaves can `land` on whatever stands still under them and lie a while before falling again (rain comes down somewhere new each fall), blown sideways by `wind`, [x, z] over a whole fall). |
| `cover` | Snow, moss or dust over everything once it is cut: `{ kind, color, amount }`, `amount` 0 to 1. `snow` settles on tops the sky can reach (not under a roof), `moss` creeps over up-turned and shut-in faces in patches, `dust` lies thin on every upturned face, under cover too. Glowing parts and parts marked `bare` keep their paint, so mark a creature in the scene `bare`. Pick a color from the palette. |
| `focus` | Where the eye goes: `{ at, r }`. Within `r` of `at` the grid is as fine as the detail level; further out every part at least eight cells across every way is cut on a grid twice as coarse with discs twice the size, so the subject keeps its detail and broad ground or walls cost a quarter of the blobs. Thin parts stay fine everywhere. In pixel art it looks the same at half the blobs or less. |

Shapes: `sphere`, `ball` (stretched), `box`, `cylinder` (can taper), `cone` (a round-ended stick), `ring`, `roof`, and `join`, `cut`, `rough` to combine them. Then:

- `lathe`: an outline of `[radius, height]` pairs from the bottom up, turned round the upright through `at`. Vases, bells, bottles, lamp posts, chess pieces.
- `sweep`: a tube through a `path` of up to 16 points, `r` thick at the start and `rTo` at the end. Vines, pipes, rails, tails, a rope that sags.
- `grow`: a plant grown by a rule from a `seed` (same seed, same plant): `style` 'tree', 'coral' or 'crystal', standing on `at`, its trunk `size` long and `r` thick; `depth` and `branches` change how it splits, `tips` puts a ball that size on every end (leaves, polyps), and `only` ('twigs' or 'tips') keeps one or the other so two parts can paint one grower in two colors. The whole thing rides its part's bone.
- `join` with a `blend`: `'smooth'` rounds the seam where its shapes meet, `'chamfer'` bevels it, `'stairs'` steps it (`steps`, 3 when left out); `by` is how far the fill reaches from the seam. A wall that flares into its footing, a trunk into its roots.
- `text`: words in blocky 3-by-5 letters, `size` tall and `depth` thick, centered on `at`, reading along +x (or along -z with `facing: 'x'`). Letters, digits, space and `. , ! ? - :` only. A letter needs about five grid cells of height to read, so keep `size` at 0.25 or more.
- `blocks`: a model drawn in letters, `size` a cube. `layers` go from the bottom up, each a list of rows from the back to the front, each row read along +x; `.` or a space is empty and any other letter fills a cube. Paint it with `{ kind: 'key', colors: { t: '#5a3a24', l: '#3a7c5c' } }` to color each letter, and every letter used needs a color. Good for little houses, crates, trees and signs; a model at most 24 cubes a side.

Built things, each one shape however many pieces it has, laid by a rule from a `seed` (the same seed, the same ruin), and sized so the pieces come out whole:

- `wall`: bricks in courses from `from` to `to` (both on the ground, any direction), `height` tall and `thick` deep. `brick` is [length, course height], fitted so whole bricks fill the wall, with half bricks at the ends of every other course. Bricks sit a little proud or sunk (`jitter`), with mortar sunk between. `ruin` breaks the top down in a ragged line, `missing` takes bricks out of the face (the mortar core shows), `fallen` lays that many at the foot. Cut a doorway with `cut`.
- `steps`: a flight of `count` blocks climbing along `dir` ([x, z]) from `at`, the bottom step's front middle, each `rise` up and `run` deep. `wear` rounds the noses and hollows each tread where feet go.
- `fence`: posts and rails along a `path` on the ground, each straight run cut into whole bays about `bay` long so a post stands at every corner. `post` is half a post's thickness; `lean`, `missing` (rails gone or hanging from one end) and `sag` wear it.
- `arcade`: a wall cut into `bays` equal bays with an opening in each and a `pillar` between, `'round'`, `'pointed'` or `'flat'` heads springing from `spring`. `ruin` (with a `seed`) breaks its top, never below the arches.

Formations, shapes that come from a rule:

- `crystal`: one crystal from `at` along `dir`, with `sides` (6), a point (`tip`, the share of its length, 0.3) and `chips` knocked off its faces. Crystals read by their facets, so light them (a live light beside them) rather than making them `glow`.
- `crystals`: a cluster of `count` from one root: the middle one `size` long and upright, the rest leaning out up to `spread` degrees and shorter the further they lean.
- `geode`: broken open, its cut face looking along `open`: a rind, `bands` layers and a hollow lined with small crystals pointing in. Paint it `{ kind: 'pieces', ordered: true, colors: [rind, band, band], line: crystals }`.
- `columns`: basalt columns on a hex grid round `at`, `r` across and `cell` wide, the tallest `height`; `rise` `'steps'` (a causeway), `'dome'` (organ pipes) or `'random'`.
- `drips`: `count` stalactites hanging from a roof at height `roof`, spread `r` round `at` on the floor, with stalagmites where their drips land, joined into columns where they would meet.
- `flowstone`: a curtain of stone in folds down a wall, hanging from `at` along `along`.
- `icicles`: under every downward edge of the shape `on`, about `every` apart; `above` keeps them off edges that rest on the ground. Only the icicles are drawn, so give the shape its own part too.

Any of them can grow as you watch: put the part on a bone and give the bone a `sprout` move.

Living forms, grown by a rule from a `seed`:

- `tree`: a gnarled tree grown by space colonization: `points` scattered through a `crown` (radii) sitting `height` above `at` pull the branches toward them, and every limb is as thick as what it carries (`r` at the foot). `leaves` puts a ball that size on every end; `only` ('limbs' or 'leaves') keeps one so two parts can paint it in two colors.
- `cactus`: a ribbed column `height` tall and `r` round, with `ribs` (8) and up to four `arms` that bend up.
- `rosette`: a succulent: `leaves` thick pointed leaves set by the golden angle, the inner ones short and upright. A `split` paint tints the tips.
- `brackets`: `count` shelf fungi stacked up a trunk from `at`, facing `facing` ([x, z]), smaller as they go up.
- `brain`: brain coral: a dome `r` round worn into meandering grooves (`groove` apart).
- `shell`: a shell wound on a log spiral, `size` wide with `turns` whorls; `spire` 0 is a flat coil, 1 a tall whelk. Each stretch is a piece, so `pieces` with `ordered` bands it.
- `horn`: from `at` along `dir`, `length` long and `r` at the root, turning `curl` times (1 is a full ram's curl), winding sideways by `twist`, with `ridges` rings.
- `antler`: a main beam from `at` along `dir` with `tines` rising off it.
- `ribs`: a spine from `from` to `to` with `count` pairs of ribs reaching `span` out and curving `drop` down.

Worn land, rock shaped by water and weather:

- `land`: ground `half` wide round `at` raised by `peaks` (each a place, a height and a reach) and `noise`, then worn: `drops` water drops (up to 30000) each run downhill, wearing gullies and laying fans where they slow, and `slump` lets slopes slide to scree. With `beds` (from the bottom up, repeating; each a `thick` and how `hard`, 0 to 1) hard beds stand as cliffs with benches on top and soft ones wear back to slopes. Pieces are the beds, and -1 is scree and fans, so paint it `pieces` with `ordered` and a `line` for the scree.
- `butte`: a mesa `r` round and `height` tall in `beds`, each worn back by how soft it is (`wear`), with a `cap` this much wider than the rock under it.
- `hoodoo`: a thin waisted spire of soft beds under a hard cap.
- `arch`: a fin of rock in beds from `from` to `to`, `thick` through, with a hole worn through its soft bed (`soft`, the hole's middle as a share of `height`).
- `mud`: dried mud `r` round cracked into plates about `plate` wide, their edges curled up by `curl`. Each plate is a piece and the cracks are -1.
- `pebbles`: `count` pebbles along a stream bed `path`, `width` across, the biggest (`size`) mid-stream where the water is fastest.

Weather that lands:

- `drift`: snow lying over every part listed before it that stays put, `half` wide round `at`: `depth` on open level ground, piled up to `pile` downwind of anything wide that stands in the `wind` ([x, z]), as far as `reach` times its height, scoured thin on what the wind meets and gone from steep faces, and thin along a trodden `path`. It must be a part's own shape, after what it lies on. Paint it `bare`, so the scene's `cover` doesn't paint it twice.
- `frost`: a frost fern on a surface facing `facing`, spreading `r` from `at` in `arms` main branches, each throwing side branches. Split one fern over parts with `stage` ([0, 0.34], [0.34, 0.67], [0.67, 1]), each on its own bone at `at` with a `sprout` move a little later than the last, and it grows a branch at a time and melts back.

Paint the built things, formations, shells, worn land, mud and frost with `pieces`: each brick, block, post, stone, column, crystal, bed, plate or generation of frost takes one of the `colors` (earlier ones commoner) and the joints between them `line`; `ordered` takes the colors in turn by piece instead. The checker turns `pieces` down on a shape without pieces.

Paints: a color, or `bands`, `bricks`, `hex` (honeycomb, scales, paving), `speckle`, `patches`, `faces` (top, side, under), `split` (one paint below a height, another above), `key` (for `blocks` only), `pieces` (for built things and the other shapes of pieces). Paints nest.

## Rules that make a scene work

1. **Units.** About 1 is a small house. y is up and the ground is y = 0. The camera starts on the +z side, so put the interesting face toward +z. Keep everything within 4 of the middle, and a whole scene about 4 across: the checker turns down parts over about 3 across and scenes with too much surface, because they take seconds to build.
2. **Paint in palette colors.** Baked light darkens a color, and the picture then snaps to the nearest palette color. So the palette needs a darker step for each main color (three or four greens, not one), and neutral grays if there is stone. Without them, shade snaps to something odd, like brown.
3. **Glow is for light sources.** `glow: true` parts take no light and spill light on their neighbors: flames, lamps, windows, stars, the moon. Small bright things that must stay readable (flowers, birds) can use it too.
4. **Every move loops.** `times` is a whole number, so the scene repeats exactly. A move with `during` runs its whole number of times inside its window and ends where it began, so it loops too; a sway or bob that should start from one end of its swing takes `phase: 0.75` (and is modelled at the middle of the swing). Use different `times` and `phase` on similar things (trees, fireflies) so they don't move in step.
5. **Particles: use `air.specks` first.** A swarm of rain, snow, embers, dust, fireflies or bubbles is one line, and each speck gets its own bone and path. For a few particles with a path of their own (smoke from one chimney), use small parts, each on a bone with a `drift` move, with `phase` spread from 0 to 1.
6. **A bone turns about its `at`.** Put it at the hinge: the hub of a wheel, the foot of a tree. A child bone (`parent`) rides its parent, as a wing rides a circling bird.
7. **Join only what is close together.** A `join` is searched as one box, so joining far-apart shapes (every star in the sky) is slow. Make them separate parts.
8. **A cone has round ends.** It reaches `r` past both ends. For a flat-bottomed cone (a pine tier, a spire) use a `cylinder` with a small `rTop`.
9. **Thin is fine.** Anything thinner than the grid is fattened to one cell, so a rope or a star still shows at every detail level.
10. **Detail comes from parts and paint.** Sixty to ninety parts make a full scene, and a showpiece can take about 150. Give big surfaces a paint with texture (`patches` on grass, `bricks` on walls, `bands` on planks and tiles), and scatter small things: stones, flowers, mushrooms.
11. **Tests read the values and the loop.** Every scene must still read in grayscale (its darkest and lightest blobs well apart, little colorless mid-gray) and nothing seen may snap from one place to another, at the loop's seam or anywhere. A `drift` passes because it shrinks away before it starts again; a hand-made particle that wraps while full size fails. And no part may pass through another as the scene plays: sails must clear their tower and a tail its wall. A part that turns needs room for its whole sweep, not only where it starts.
12. **Visitors can poke it.** A tap leans a part on its own bone away from the finger and lets it wobble back (with everything hung on that bone); a tap on the land throws a few sparkles in the palette's lightest color. So give the things people will want to poke, like trees, creatures and lamps, bones of their own.

## Getting the look of a showpiece

The dragon scene (`scenes/dragon.ts`) follows a few habits that make a scene read as a single strong image:

- **A backdrop that stays out of the way.** Leave `sky` out and the subject sits on the dark of the page, or give it a dark `sky` with a short `skyReach`, so most of the picture is the darkest color and only the top glows.
- **Few hues.** A dark ramp for the setting, one hue ramp for the subject, and two or three steps of a warm accent used only on light sources.
- **One big subject.** Build it from many small parts (the dragon is about 140, mostly cones) and let it fill the frame.
- **A chain of bones for anything that bends.** Each neck bone has the one before as its `parent` and sways a few degrees; the turns add up along the chain, so the head sweeps wide while each joint barely moves. A jaw is a child of the head with one `sway`.
- **Embers or dust.** A swarm in `air.specks` gives the air depth, and a `haze` in the backdrop's darkest color pushes the back of the scene away.
- **Mist and beams are light touches.** Mist is a faint layer over what is behind it, so it tints the ground under it toward its own color: keep `thick` low and its color close to what it lies on (pale over water), or it turns a scene muddy. A shaft only lights what it lands on, so aim it at a floor or ground.
- **Line a big dark body.** A part is one layer of blobs, and a little of what is behind shows through it: bright things behind a dark part spoil it. Put the same shape, a little smaller, inside it on a still bone of its own (parts on one bone drop cells buried in each other), in a dark color, with `noShadow`.
- **Small parts cast no shadow.** Mark fronds, petals, legs and the like `noShadow`: every shadow caster is checked for every lit cell, so a hundred small ones double the build time for shadows nobody sees.
- **A shade for every hue.** A color in shadow snaps to the nearest palette color, which is a gray if its own hue has no darker step: give each hue at least two steps. A `glow` part whose color is already pale goes white: fine for a spark or a bubble, but glow anything that should keep its color (a crystal, a lamp) in a saturated middle color.
- **A slow swing of the camera** shows that the scene is solid.

## Prompting for one

Give Claude the type and one existing scene, then say what you want:

> Here is `SceneDoc` (paste `sceneDoc.ts` down to the end of `LightDoc`) and an example (paste `campfire.ts`). Write a new `SceneDoc`: a fishing hut on a frozen lake at dawn, with smoke from the chimney, a swinging lantern, a hole in the ice and falling snow. Follow the rules in docs/scene-descriptions.md. Return only the object.

Then:

1. Run `checkScene` on what comes back. If it lists mistakes, paste the list back and ask for a fix. The messages say where each one is.
2. Add it to `DIORAMAS` in `src/blobscape/diorama/scenes.ts` with `described(id, DOC, 'what is in the picture')` and open `/experiments/pixel-diorama/?scene=<id>`.
3. Look, then ask for changes in words: "the hut is too small", "more snow", "warmer palette". Small changes are small edits.

Asking for several different takes at once and picking the best works better than polishing the first.

## Checking and drawing one without the site

`npm run scene` looks a description over from the command line, which is what an assistant writing one needs: an answer in a second or two, in lines it can act on.

```sh
npm run scene -- my-scene.json                  # check it, cut it, say what is wrong
npm run scene -- my-scene.json --shots shots/   # then draw it as pixel art (after `npm run build`)
npm run scene -- --example campfire             # one of the site's scenes as JSON, to start from
npm run scene -- --list                         # the site's scenes
```

Each `fix` line is `where: what`: a mistake in the description, a part that caught no blobs, a palette that reads as one tone, a move that snaps, or a part that passes through another (`parts[40] (box on bone 'sails'): passes through parts[3] (cylinder) at 3.00 s`). It ends with status 1 while anything must be fixed. `--shots` writes four pictures (front, above, close up, and the front again later in the loop). The checks are `reviewScene` in `src/blobscape/diorama/review.ts`, the same ones the site's own scenes pass in `scenes.test.ts`.

The same file opens on Pixel Diorama itself (Scene tab, Open a file), where it plays and How it's made steps through how it was cut. It stays in the page.

For Claude Code there is a skill with the whole loop, `.claude/skills/pixel-scene/SKILL.md`: plan, write, check, look, fix.

## What it can't do yet

- Turned boxes: a box or a roof is always square to the axes, and a bone has no resting turn. Build slanted things from cones (walls, fences and arcades can run any way along the ground).
- Characters that walk. Bones here turn, slide and grow; there is no skinning between them (creatures use `body.ts` for that).
- Paint that follows a round wall: `bricks` run along x or z, which holds up on a tower but isn't exact.
