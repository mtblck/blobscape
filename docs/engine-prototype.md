# Animated-splat engine: prototype note

November 2026. This covers the two-week prototype from the Blobscape roadmap, built in one night. The question is whether to keep building our own engine for animated splats.

## Recommendation: go

All three bars are met. The engine works on WebGPU and WebGL. It skins every blob on the GPU, matching our CPU math to within 2.4e-7. It sorts every object's blobs together and draws through three.js. On a phone it walks 200k blobs at 60 fps. Above that, the deform and sort start to cost frames, which is where the next speed work goes.

| Bar | Result |
|---|---|
| A 200k-blob creature walks at 60 fps on a mid-range phone | **Met.** On Matt's phone (60 Hz screen, WebGPU) the 200k fox walks at 60 fps with no dropped frames. At 500k it walks at 41 fps with 38% of frames dropped, while three.js holds 60 fps at 500k standing still. |
| A rigged .glb we write and read back, which opens as a still splat elsewhere | **Met.** Round trip tested. three.js's own glTF loader opens it as a 5,001-splat still with one animation. |
| A walk cycle exported as a sprite sheet | **Met.** 4 directions × 8 frames, through Splat to Sprite's pixel pipeline, in Tinkerkit's format with `walk-*` animations. |

## What the spike found

- **Spark already has skinning and portals.** Spark 2.4 ships `SplatSkinning` (dual-quaternion and linear blend) and `SparkPortals`. Spark is a stronger baseline than the roadmap assumed. What's ours alone is the file format, the authoring tools and splats to pixels, not skinning itself.
- **three.js r186's `GaussianSplat`** is about 1,000 lines of TSL. It does a GPU counting sort per mesh, with a CPU sort on WebGL. It sorts each object separately, so two overlapping objects draw in the wrong order: the Still Life problem. It has no bones.
- **Spark Radix** (`@sparkjsdev/radix` 0.0.1) declares 114 runtime dependencies, including dev tools like eslint and http-server. I left it out of the repo for that reason, so it isn't benchmarked here.
- **Headless WebGPU** in this sandbox can render and compute, but it can't present to a canvas. The lab has an `offscreen=1` mode for verify that copies each frame to the page.

## What was built

All of it is in `src/splat-engine/`, with the test page at `/engine-lab/` (unlisted, `noindex`).

- `rig.ts`: skeleton, skin weights, and `skinBlob`, the CPU reference for moving one blob by its bones. There are two rules for a blob's shape. `quat` averages the bone rotations (sign-aligned, normalized), so blobs only turn. `linear` pushes the covariance through the blended matrix, so blobs squash on a twist. The tests show `quat` keeping volume on a half-twist where `linear` collapses, which is lesson 15 in one assertion.
- `engine.ts`: `SplatWorld`, a three.js `Mesh` that holds every blob of every actor. Each frame runs a deform compute pass (bones → world center and covariance), a project pass (each blob onto the screen once, writing its sort key), one counting sort over the whole scene (16,384 depth bins, `sort.ts`), then an instanced draw that only places quads. A still object is one bone. On WebGL, which has no compute, the vertex shader moves and projects each blob as it draws it, and the CPU only moves centers and sorts.
- `creature.ts`: a procedural fox, 14 bones, with blobs weighted by distance to their body part's bones and a trot cycle.
- `glb.ts`: writes and reads rigged splats as glTF. Blobs use `KHR_gaussian_splatting`, the rig uses standard skins and animations, and `BLOBSCAPE_gaussian_skinning` (used, not required) states the rotation rule.
- `walkSheet.ts`: renders the trot from four sides into a Tinkerkit sheet.

Added with the Rigs and 3D models lessons (2026-11-11):

- `pose.ts`: `poseBlobs`, the whole-blob CPU twin of `skinBlob` (center, scale and rotation, both rules), which the lessons use to pose a few thousand blobs for Spark. Tested against `skinBlob`.
- `models.ts`: the lesson rigs (caterpillar, arm, wrist), `walk.ts`: the fox's trot as four key poses with hold/in-between and foot speed.
- `mesh.ts`: `blobsToMesh` turns blobs into a closed, skinned triangle mesh (density grid, shell, flood fill, signed distance pulled back to the blobs' surface, surface nets), `skinMesh` poses it on the CPU, `meshError` measures how far it strays. `glb.ts` `writeRiggedMeshGlb` saves it with the same bones and clips, unlit vertex colors; three.js opens it as a `SkinnedMesh` with its animation (verify checks).
- The Creature page (`src/blobscape/Creature.tsx`, `#/creature`) is the engine's first public use: `SplatWorld` on WebGPU (WebGL fallback), up to 200k blobs, splat and mesh `.glb` downloads, and opening rigged `.glb` files.
- Since then it has four creatures (`zoo/`: frog 20 bones, fox 14, elf 29, dragon 43, up to 400k blobs), a bones view, and bones that grow and slide: per-bone uniform `size` (children inherit it) and an `offset` on any bone, both keyed in clips and written to .glb as scale and translation channels. The GPU passes needed no change, since a bone's scale is already in its skin matrix.

Added for pixel-art scenes (2026-11-15, issues #33, #35, #36, #37):

- `voxel.ts`: shapes as distance functions (sphere, ellipsoid, box, cone, cylinder, torus, union, cut, displace) cut into a grid, one solid disc per surface cell, each part on one bone, with baked sun and cast shadows.
- `pixelPass.ts`: pixel mode. The scene is drawn small, then one pass snaps it to a palette (OKLab, Bayer dither), adds glow from bright pixels, edge lines where a color meets a much lighter one, a silhouette outline and an optional sky gradient, and scales it up in whole pixels. Its CPU twin is `pixelArt` in `splat-core/pixel.ts`.
- Pixel Diorama (`/experiments/pixel-diorama/`) is the test page: a lighthouse, cottage, pines and jetty of about 93,000 blobs (50,000 on phones) on 27 bones, with surface texture (bricks, tiles, planks, strata) written as color rules.
- `sceneDoc.ts`: a scene as data (shapes, paints, bones, moves, lights, palette, camera), with a checker and a builder, so a scene can be written by hand or by Claude from a prompt (#41, `docs/scene-descriptions.md`). Every scene on Pixel Diorama but the lighthouse is written this way.
- Lines between parts: `SplatWorld.parts` draws the blobs as a map of parts (hard discs in each part's flat color), and the pass lines a pixel beside another part whose color is too close for a color line. Steady pixels (a pixel keeps its palette color unless another is clearly closer) and held frames (`CreatureStage.step`) calm a moving scene (#40).
- Not done yet: whole-pixel steps under a moving camera (the scenes orbit a perspective camera, which has no such step); a translucent part is a solid disc in the map of parts.

## Known gaps

- **The WebGL fallback moves blobs four times each** (once per quad corner), since WebGL can't run a compute pass first. Its CPU work is now about 10 ms at 100k on this machine (it was 200 ms).
- **The sort is a counting sort with 65,536 bins.** On WebGPU the threads race for slots in a bin, so a settle pass (`sort.ts`) puts each bin of up to 48 blobs in index order, as the CPU sort does, and the bins have a fixed width anchored in depth so they hold still under a still camera. Without those two, blobs at one depth changed order every frame and hard edges flickered (the lighthouse's windows). Bins of more than 48 (a flat wall seen dead on) are still left as they fall; a two-pass radix sort with 32-bit keys would be the full answer.
- **Not supported yet:** spherical harmonics. `SplatWorld.dispose` now frees its storage buffers too, since the Creature page swaps worlds on every fox change.
- **Shape edits test where a blob is, not how far it reaches.** A cut takes whole blobs by their centers, so a cut edge is as ragged as the blobs are big, and painting is per blob. Push (moving blobs by shape) isn't done yet. Nothing on the site uses edits yet; Scan Studio's crop is the obvious first user.
- **Depth is a hard-disc approximation.** A blob has no one depth, so `SplatDepth` counts each as solid out to where it has faded to 0.15 and keeps the nearest. Edges of soft things (fur, fire) sit a little outside what you see. Good for fog, outlines and focus; not for exact compositing.
- **Shadows from live lights are soft and coarse by design.** Each frame the blobs are dropped into a grid of up to 64³ cube cells fitted to the world (about 14 cm in Dungeon Run's hall), and each lit blob marches up to 48 cells toward each light that casts. Edges blur over a cell or two, small things (a sword) cast little, and a light closer than a few cells to a blob doesn't shade it. In software rendering it added about 4% to a Dungeon Run frame with nine casting lights; not yet timed on a phone. WebGL builds the grid on the CPU and marches per quad corner.
- **Level of detail is a share of each actor's blobs, not stored cuts.** `SplatWorld.autoDetail` (off unless set) gives each actor about one blob per pixel of the disc round it on screen (`lod.ts`); the rest are left out by a fixed hash of their index and the kept ones grow to cover for them. The left-out blobs are still moved, sorted and sent to the draw as empty quads, so it saves filling pixels, not skinning or sorting; leaving them out of the sort and the draw count needs an indirect draw. Small far creatures look the same or better: at a few dozen pixels a full 200k fox shimmers, which a tenth of the blobs, grown, does not. Try it in the lab with `?lod=1`. Not on any page yet: the forest's plants are too few blobs to thin, and pixel mode would change how its scenes look.
- **Joint quality vs Spark's dual quaternions:** see "Spark side by side" below.
- **The `.glb` reader** takes only float splat attributes and bones without a rest rotation. It handles our own files and simple ones from elsewhere.

## How to get the phone numbers

Open the preview's `/engine-lab/?which=engine&n=200000&walk=1` on the phone and press **Time it**. The table shows frames per second over 120 live frames, the share of frames that missed a screen refresh, and the gap between frames. 60 fps with almost no dropped frames at 200k walking means bar 1 is met.

The first version of the lab timed each frame on its own: draw, then wait for the GPU to finish before starting the next. That stops the CPU and GPU working side by side, so it overstated the cost of a frame (Matt's phone showed 16.9 ms at 200k while the fox looked smooth at 500k). That number is still in the table as "alone", as an upper bound.

three.js's `GaussianSplat` has no bones, so in the lab it always stands still and does no deform or per-frame skinning work. It is a baseline for drawing, not for animation.

### First phone run (Matt, 2026-11-11)

By eye: our WebGPU engine walks smoothly even at 500k blobs. Our WebGL fallback is smooth at 20k and laggy above it (422 ms of CPU per frame at 200k). Timed alone, the engine took 16.9 ms a frame at 200k walking and 11.6 ms at 20k; three.js took 10.1 ms at 200k standing still.

### Second phone run, with the fixed timer (Matt, 2026-11-11)

| Renderer | Blobs | fps | Dropped | ms between frames (median / slowest 10%) | ms alone |
|---|---|---|---|---|---|
| Ours, WebGPU, walking | 200k | 60 | 0% | 16.7 / 16.7 | 17.8 |
| Ours, WebGPU, walking | 500k | 41 | 38% | 16.7 / 33.3 | 31.2 |
| three.js, WebGPU, standing still | 200k | 60 | 0% | 16.7 / 16.7 | 12.3 |
| three.js, WebGPU, standing still | 500k | 60 | 1% | 16.7 / 16.8 | 19.3 |

Our extra cost per frame is the deform pass and one shared sort: about 5 ms at 200k and 12 ms at 500k ("alone" minus three.js's). Ideas for cutting it: skip the deform for blobs whose bones didn't move, sort every other frame while the camera is still, and draw fewer blobs when a creature is small on screen.

## Speed pass (2026-11-11, after the phone run)

- **Project once per blob.** The screen-space ellipse used to be worked out in the vertex shader for each of a quad's four corners. It's now a compute pass that runs once per blob and also writes the sort key, so the sort no longer works the depth out twice.
- **Our own sort passes** (`sort.ts`). three.js's `CountingSort` sums its 16,384 bins in a single GPU thread. Ours does it with 256 threads, and clears the histogram as it goes, which removes a pass.
- **Smaller quads for faint blobs.** Each quad reaches only as far as its blob stays visible (above 1/255), up to two standard deviations, so faint blobs cover fewer pixels.
- **WebGL skins on the GPU.** The vertex shader moves each blob through its bones, like a skinned mesh. The CPU only moves blob centers for the sort, without allocating. At 100k blobs on this machine: 7.7 ms moving centers and 2 ms sorting, against about 200 ms before.
- **Time each step** in the lab splits a frame into move, project, sort and draw (WebGPU), or CPU move, CPU sort and draw (WebGL). Software WebGPU here can't say which step dominates on a phone, because it draws on the CPU.

### Third phone run, after the speed pass (Matt, 2026-11-11)

| Renderer | Blobs | fps | Dropped | ms alone (before → after) |
|---|---|---|---|---|
| Ours, WebGPU, walking | 200k | 60 | 0% | 17.8 → 12.6 (three.js standing still: 12.3) |
| Ours, WebGPU, walking | 500k | 46 (was 41) | 51% | 31.2 → 25.2 |
| Ours, WebGL, walking | 200k | 60 | 0% | 49.1, CPU 7.0 (CPU was 422) |
| Ours, WebGL, walking | 500k | 30 | 93% | 87.5, CPU 28.5 |

At 200k, walking now costs about the same as three.js drawing the fox standing still. The WebGL fox didn't move in this run: three.js swaps a padded copy in for a storage buffer it reads through a texture, so the bone data went to the old array. Fixed, and verify now checks that posing reaches the draw on both backends. The WebGL timings still count the same work, since the GPU moved every blob each frame, just with the first frame's bones.

### Fourth phone run, WebGL fixed (Matt, 2026-11-11)

| Renderer | Blobs | fps | Dropped | ms alone | ms CPU |
|---|---|---|---|---|---|
| Ours, WebGPU, walking | 200k | 60 | 0% | 12.4 | 0 |
| Ours, WebGPU, walking | 500k | 52 | 18% | 21.1 | 0 |
| Ours, WebGL, walking | 200k | 60 | 0% | 48.2 | 7.0 |
| Ours, WebGL, walking | 500k | 27–33 | 66–98% | ~90 | 20–28 |

A walking 500k fox on WebGPU now costs 21.1 ms alone, against 19.3 ms for three.js drawing 500k standing still. Animation adds about 2 ms a frame, so what's left at 500k is mostly drawing. Getting there needs fewer pixels or fewer blobs drawn (level of detail), not faster skinning. On WebGL, the GPU moves every blob four times a frame (once per corner), which is what holds 500k at about 30 fps.

## Spark side by side (2026-11-12)

The lab can now draw the same fox with Spark 2.4's own `SplatSkinning` (`?which=spark`, `sparkLab.ts`): the same blobs, bones, weights and trot. "Turn blobs" uses Spark's dual quaternions and "Blend matrices" its linear blend, which needs covariance splats (`ExtSplats`, `covSplats` and `accumExtSplats`).

What we found before timing anything:

- **The motion matches.** Fed our skin transforms, Spark's linear blend puts every blob within 1e-4 m of ours. Its dual quaternions agree exactly on blobs held by one bone and stay within 6 mm on blended joints (`sparkSkinning.test.ts` mirrors Spark's GLSL over the data its JavaScript writes).
- **Spark's rest pose only works as the identity.** `setRestQuatPos` and `setRestMatrix` compose rest and pose in an order that turns a bone about the origin instead of its head. The lab rests every bone at the origin and passes the finished skin transform, which sidesteps it. The test pins Spark 2.4's behavior, so it will fail if Spark changes it. This looks like a bug worth reporting upstream.
- **Dual quaternions carry no scale** (`setBoneQuatPosScale` throws in that mode), so a bone that grows (the frog's tongue, the dragon's fire, every Forest Walk plant) needs Spark's linear blend, which flattens blobs on a twist.
- **Spark sorts in a worker**, a frame or more behind, and gathers every mesh into one list, so its herds also sort together.

To time it on a phone, open these and press **Time it** on each:

- `/engine-lab/?which=engine&n=200000&walk=1`
- `/engine-lab/?which=spark&n=200000&walk=1&mode=quat`
- `/engine-lab/?which=spark&n=200000&walk=1&mode=linear`
- the same three with `n=500000`

### Phone run (Matt, 2026-11-12, 60 Hz screen)

| Renderer | Blobs | fps | Dropped | ms between frames (median / slowest 10%) | ms alone |
|---|---|---|---|---|---|
| Ours, WebGPU, walking | 200k | 60 | 0% | 16.7 / 16.7 | 12.0 |
| Spark, dual quaternions, walking | 200k | 60 | 0% | 16.7 / 16.7 | 14.1 |
| Ours, WebGL, walking | 200k | 60 | 0% | 16.7 / 16.7 | 47.7 |
| three.js, standing still | 200k | 60 | 0% | 16.7 / 16.7 | 11.1 |
| Ours, WebGPU, walking | 500k | 51 | 19% | 16.7 / 33.3 | 22.0 |
| Spark, dual quaternions, walking | 500k | 48 | 31% | 16.7 / 33.3 | 27.7 |
| Ours, WebGL, walking | 500k | 30 | 96% | 33.3 / 41.7 | 90.6 |
| three.js, standing still | 500k | 60 | 0% | 16.7 / 16.7 | 18.9 |

- **Ours on WebGPU is level with Spark at 200k and a little ahead at 500k** (51 against 48 fps, 19% against 31% dropped). Spark's "alone" leaves out its sort, which runs in a worker, so the real gap in cost is a bit wider than 22 against 27.7 ms. Speed is not a headline, though: the two are close.
- **Spark's WebGL beats our WebGL fallback** at 500k (48 against 30 fps). On a device without WebGPU, Spark is the faster way to draw a walking creature.
- Spark's linear blend wasn't timed in this run.

The file format the comparison is about is written up in [rigged-splats.md](rigged-splats.md).
