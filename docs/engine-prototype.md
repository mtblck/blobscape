# Animated-splat engine: prototype note

November 2026. This covers the two-week prototype from the Blobscape roadmap, built in one night. The question is whether to keep building our own engine for animated splats.

## Recommendation: go

All three bars are met. The engine works on WebGPU and WebGL. It skins every blob on the GPU, matching our CPU maths to within 2.4e-7. It sorts every object's blobs together and draws through three.js. On a phone it walks 200k blobs at 60 fps. Above that, the deform and sort start to cost frames, which is where the next speed work goes.

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

All of it is in `src/splat-engine/`, with the test page at `/experiments/engine-lab/` (unlisted, `noindex`).

- `rig.ts`: skeleton, skin weights, and `skinBlob`, the CPU reference for moving one blob by its bones. There are two rules for a blob's shape. `quat` averages the bone rotations (sign-aligned, normalised), so blobs only turn. `linear` pushes the covariance through the blended matrix, so blobs squash on a twist. The tests show `quat` keeping volume on a half-twist where `linear` collapses, which is lesson 15 in one assertion.
- `engine.ts`: `SplatWorld`, a three.js `Mesh` that holds every blob of every actor. Each frame runs a deform compute pass (bones → world centre and covariance), a project pass (each blob onto the screen once, writing its sort key), one counting sort over the whole scene (16,384 depth bins, `sort.ts`), then an instanced draw that only places quads. A still object is one bone. On WebGL, which has no compute, the vertex shader moves and projects each blob as it draws it, and the CPU only moves centres and sorts.
- `creature.ts`: a procedural fox, 14 bones, with blobs weighted by distance to their body part's bones and a trot cycle.
- `glb.ts`: writes and reads rigged splats as glTF. Blobs use `KHR_gaussian_splatting`, the rig uses standard skins and animations, and `BLOBSCAPE_gaussian_skinning` (used, not required) states the rotation rule.
- `walkSheet.ts`: renders the trot from four sides into a Tinkerkit sheet.

## Known gaps

- **The WebGL fallback moves blobs four times each** (once per quad corner), since WebGL can't run a compute pass first. Its CPU work is now about 10 ms at 100k on this machine (it was 200 ms).
- **The sort is a counting sort with 16k bins.** Blobs in the same bin draw in arbitrary order and can shimmer on large scenes. A two-pass radix sort with 32-bit keys is the upgrade.
- **Not supported yet:** spherical harmonics, level of detail, and cleanup of storage buffers on dispose. The sprite sheet keeps one world per renderer, so nothing leaks per click.
- **Joint quality vs Spark's dual quaternions** hasn't been compared side by side.
- **The `.glb` reader** takes only float splat attributes and bones without a rest rotation. It handles our own files and simple ones from elsewhere.

## How to get the phone numbers

Open the preview's `/experiments/engine-lab/?which=engine&n=200000&walk=1` on the phone and press **Time it**. The table shows frames per second over 120 live frames, the share of frames that missed a screen refresh, and the gap between frames. 60 fps with almost no dropped frames at 200k walking means bar 1 is met.

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
- **WebGL skins on the GPU.** The vertex shader moves each blob through its bones, like a skinned mesh. The CPU only moves blob centres for the sort, without allocating. At 100k blobs on this machine: 7.7 ms moving centres and 2 ms sorting, against about 200 ms before.
- **Time each step** in the lab splits a frame into move, project, sort and draw (WebGPU), or CPU move, CPU sort and draw (WebGL). Software WebGPU here can't say which step dominates on a phone, because it draws on the CPU.

### Third phone run, after the speed pass (Matt, 2026-11-11)

| Renderer | Blobs | fps | Dropped | ms alone (before → after) |
|---|---|---|---|---|
| Ours, WebGPU, walking | 200k | 60 | 0% | 17.8 → 12.6 (three.js standing still: 12.3) |
| Ours, WebGPU, walking | 500k | 46 (was 41) | 51% | 31.2 → 25.2 |
| Ours, WebGL, walking | 200k | 60 | 0% | 49.1, CPU 7.0 (CPU was 422) |
| Ours, WebGL, walking | 500k | 30 | 93% | 87.5, CPU 28.5 |

At 200k, walking now costs about the same as three.js drawing the fox standing still. The WebGL fox didn't move in this run: three.js swaps a padded copy in for a storage buffer it reads through a texture, so the bone data went to the old array. Fixed, and verify now checks that posing reaches the draw on both backends. The WebGL timings still count the same work, since the GPU moved every blob each frame, just with the first frame's bones.
