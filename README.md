# Blobscape

Small experiments with Gaussian splats: learn how 3D splats work by taking them apart, one blob at
a time. Served at [blobscape.dev](https://blobscape.dev/).

| Page | What it is |
| --- | --- |
| [Lessons](https://blobscape.dev/lessons/) | Thirteen hands-on lessons, from one blob to a walking creature |
| [Sandbox](https://blobscape.dev/sandbox/) | Spray, select, recolour and explode blobs, or open your own capture |
| [Creature](https://blobscape.dev/experiments/creature/) | A frog, fox, elf and ice dragon on our own splat engine, with a bones view, exported as rigged .glb |
| [Fit a Picture](https://blobscape.dev/experiments/fit-a-picture/) | Watch 2D Gaussians start as noise and learn a picture, the way a splat is trained |
| [Splat to Sprite](https://blobscape.dev/experiments/splat-to-sprite/) | Turn a 3D Gaussian splat into pixel-art sprites and Tinkerkit sprite sheets |

```sh
npm install
npm run dev            # http://localhost:5173/
npm test               # unit tests (pixel pipeline, Gaussian fitter, splat engine)
npm run build          # hosting check, typecheck, build to dist, prerender every page
npm run verify         # Chromium against dist, under the production CSP, with axe
```

## The site

- **Vite and React, not Next.** Every page draws in the browser with WebGL or WebGPU, so a server
  would render nothing useful. Instead each page is a real path (`/lessons/one-blob/`) and
  `scripts/prerender.ts` writes it out as its own HTML file after the build: its title,
  description, canonical link, share tags, JSON-LD and a readable version of the page, plus
  `404.html`, `sitemap.xml` and `robots.txt`. In the browser it is still one app, and links between
  Blobscape's pages swap the page without a reload. Old `#/lesson/<id>` links land on their page.
- **The brand** comes from the Blobscape brand kit: the logo (`src/shared/logoPaths.ts`, drawn by
  `Logo.tsx` so it follows the theme), Fredoka for headings and Figtree for text (self-hosted), the
  light and dark palette as hex tokens in `src/shared/theme.css`, and the icons and share image in
  `public/`. Light is the default; dark follows the system unless the menu sets it.
- **Hosting:** one Vercel project serving `dist` from the root, `trailingSlash: true` (every page is
  a folder). `npm run build` fails if the hosting shape or the CSP drifts (`scripts/check-hosting.mjs`).
  Old `/experiments/...` addresses redirect to their new home.

## Splat to Sprite

A Gaussian splat is a 3D scene made only of soft, see-through ellipsoids ("splats"), each with a
position, size, rotation, opacity and colour. Rendering one means sorting the splats back to front
and blending them. This experiment frames a splat with a game camera and bakes it into pixel art:

1. **Render** the sprite camera's view at size × samples (e.g. 32 × 8 = 256 px), with Spark.
2. **Shrink**: average each block of samples into one pixel, colour weighted by coverage.
3. **Cut and snap**: coverage over the cut becomes solid, the rest transparent; colours snap to a
   palette (fixed, or k-means in OKLab across every frame so a sheet shares one palette), with
   optional ordered dithering.
4. **Clean up**: drop lone pixels left by stray splats, draw a 1-px outline.

Sheets turn the camera around the object: 4 directions in Tinkerkit's row order (down, left, right,
up), 8 directions, or a spin. The `.spritesheet.json` export mirrors Tinkerkit's `SpriteSheet`
document (format 71), with the anchor on the object's lowest pixel.

### Design notes

- **Spark, not a hand-written renderer.** Spark (World Labs, MIT) reads .ply, .spz, .splat,
  .ksplat and .sog, sorts in a worker and supports SDF edits, which is what the crop uses. Its
  bundle carries its WASM inline, hence the 3.2 MB (1.1 MB gzip) chunk.
- **Two SparkRenderers.** The sort is per camera, so the sprite camera gets its own offline
  renderer with a render target, updated (sorted) before each shot.
- **Sync readback.** Spark's `readTarget()` uses three's async fence polling, which stalled after a
  few back-to-back shots in headless Chromium. A sync `readPixels` of a ≤512 px target is cheap.
- **Render on demand.** The viewport draws only when something changed, or while Spark is
  mid-sort. An earlier version stopped after a fixed number of frames and left the view blank after
  loading a file: Spark only adopts a finished sort on the next render.
- **Procedural samples.** The four sample objects are generated in code, splat by splat (flat
  discs on the surface with baked half-Lambert shading), so there are no asset licences and no
  multi-MB downloads. Real objects come from phone scanning apps that export .ply/.spz; files stay
  in the browser.
- **Orthographic by default.** Pixel-art games draw without perspective. Camera presets are
  top-down RPG (45°), ¾ (30°), side-on (0°) and isometric (30°, corner-on).
- Measured in headless Chromium with SwiftShader (software GL): a shot of the 22k-splat sample
  takes about 5 s there, so a 4-direction bake takes about 20 s. Expect much less on a real GPU,
  but that hasn't been measured yet.

## Fit a Picture

Training a splat is a loop: render the blobs, compare with a photo, work out which way to nudge every
number on every blob to shrink the difference (backpropagation), take a small step (Adam), and every
so often prune blobs that have faded out and add new ones where the picture is still wrong. This
experiment runs that loop against one flat picture so you can watch it: a few hundred 2D Gaussians
start as random noise and settle into the image, with the loss graphed live.

### Design notes

- **Additive, not sorted.** In 3D, blobs are sorted by depth and alpha-blended front to back. A flat
  picture has no depth, so each pixel is just the sum of opacity × colour × falloff over the blobs,
  as in GaussianImage (Zhang et al., 2024). The rest is the 3DGS loop: Adam with per-group step
  sizes, a warm-up, then prune and grow every 100 steps.
- **CPU in a worker, not WebGPU.** Each blob is drawn only inside its own 3.5σ box, so a step costs
  about the total area of the blobs, not pixels × blobs. At 192 px with a few hundred to 1,500 blobs
  that is 5–20 ms a step in plain TypeScript, fast enough to watch and too fast to follow at full
  speed. It works in every browser, and the same code runs in Node for the tests. WebGPU would buy
  bigger pictures and more blobs; worth it if this grows past ~5,000 blobs.
- **Hand-written gradients.** `fit.ts` derives every partial (centre, log scales, angle, colour,
  opacity) by hand; `fit.test.ts` checks them against finite differences.
- **Growth is error-driven.** 3DGS densifies blobs with large positional gradients by cloning or
  splitting them. Here new blobs go where the squared error is largest, which shows the same idea
  more directly. New blobs get one round (100 steps) before they can be pruned.
- **Your picture stays put.** It is decoded with `createImageBitmap`, shrunk to the training size on
  a canvas, and handed to the worker. Nothing is uploaded.

## Blobscape

Lessons and a sandbox in one page. Each lesson is one idea you can poke at, with goals that tick off
as you reach them: **One blob** (the 14 numbers of a Gaussian), **Footprint** (how a 3D blob lands
on screen as a 2D ellipse), **Order matters** (why every frame sorts back to front), and **Many make
a shape** (from one blob to 20,000). Every lesson can open its scene in the **Sandbox**, which adds,
sprays and erases blobs; selects them by click, box, lasso or colour; moves, turns, scales,
recolours and fades the selection; runs live effects (explode, melt, wind, twist, wave, dissolve)
on the whole scene or the selection; opens .ply, .spz, .splat, .ksplat and .sog captures; and saves
a 3DGS .ply (base colour only: no `f_rest_*` terms, so it opens in viewers such as SuperSplat
and Spark but not in the original training code). Everything is undoable. More lessons (colour by angle, painting, real
captures, breaking a scene) are planned.

### Design notes

- **Spark draws, our code owns the blobs.** The scene is a `Blobs` list of flat typed arrays
  (`src/splat-core/blobs.ts`) synced into a Spark `PackedSplats`; after an append only the new blobs
  are rewritten. Projection (Σ′ = J W Σ Wᵀ Jᵀ) and ray picking against each blob's ellipsoid are
  plain functions, tested against sampling in `blobs.test.ts`; the x-ray outlines and lesson read-outs
  use them, so they match what Spark draws.
- **One custom renderer, on purpose.** Spark always sorts correctly, so the Order lesson uses a
  ~60-line software splatter (`cpuSplat.ts`) that can draw in any order.
- **Nothing leaves the browser.** Goal progress is kept in localStorage (`blobscape-progress`); the
  lesson-to-sandbox hand-off is in memory.
- **Spray picks once per dab.** It finds the surface under the ring once, then scatters the dab's
  blobs over that surface's tangent plane, so a stroke stays cheap on a 200k-blob scene.
- **Effects run twice, identically.** Each effect is GLSL in a Spark dyno modifier (a live preview
  that costs only uniforms per frame) and the same maths in TypeScript (`effects.ts`) for "Make it
  permanent". Both seed their randomness from an integer hash of the blob's GPU slot, so a bake
  matches the preview pixel for pixel. An effect on the selection puts the selected blobs first on
  the GPU and only touches the first `count`.
- **Files stay on the device.** Imports are decoded by Spark (WASM) in the page and copied into
  `Blobs` (base colour only, no view-dependent shading); scenes over a million blobs (400k on
  phones) are thinned evenly, with the survivors widened to cover. Captures are turned upright on
  opening, since COLMAP-trained scenes come out upside down. Edits are plain functions in `ops.ts`
  with tests.

