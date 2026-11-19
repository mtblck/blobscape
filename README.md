<p align="center">
  <a href="https://blobscape.dev/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/readme/logo-dark.svg" />
      <img src=".github/readme/logo-light.svg" alt="Blobscape" width="360" />
    </picture>
  </a>
</p>

<h3 align="center">Learn 3D Gaussian splats by taking them apart.</h3>

<p align="center">
  Twenty-four hands-on lessons, a scene maker, and a shelf of experiments on our own animated-splat engine.<br />
  All of it runs in your browser. Free, no account.
</p>

<p align="center">
  <a href="https://blobscape.dev/"><b>Website</b></a> ·
  <a href="https://blobscape.dev/lessons/">Lessons</a> ·
  <a href="https://blobscape.dev/scene-creator/">Scene Creator</a> ·
  <a href="https://blobscape.dev/experiments/">Experiments</a> ·
  <a href="https://blobscape.dev/engine/">Engine</a> ·
  <a href="https://blobscape.dev/engine/rigged-splats/">Rigged-splat spec</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1d2440" /></a>
  <a href="https://threejs.org/"><img alt="Built on three.js" src="https://img.shields.io/badge/built_on-three.js-1d2440" /></a>
  <img alt="WebGPU with a WebGL 2 fallback" src="https://img.shields.io/badge/renders_with-WebGPU_%7C_WebGL_2-1d2440" />
  <a href="https://blobscape.dev/"><img alt="Live at blobscape.dev" src="https://img.shields.io/badge/live-blobscape.dev-b3250a" /></a>
</p>

<p align="center">
  <a href="https://blobscape.dev/experiments/pixel-diorama/"><img src=".github/readme/hero.webp" alt="Five Pixel Diorama scenes drawn as pixel art from Gaussian splats: a lighthouse on a small island at night, a red dragon over a lava pool, an owl in a wizard hat beside a cauldron, snowy floating islands with a waterfall, and a scarecrow in a pumpkin patch under a full moon" width="880" /></a>
</p>
<p align="center"><sub>Every one of these is real 3D, made of blobs and drawn live as pixel art. <a href="https://blobscape.dev/experiments/pixel-diorama/">Turn them in Pixel Diorama</a>.</sub></p>

## What is a Gaussian splat?

A splat is a 3D scene made of nothing but soft, colored, see-through blobs. Each blob is 14
numbers: where it is, how big it is each way, which way it turns, its color and how solid it is.
Pile up a few million of them, sort them back to front and blend, and you get a photo-real scene
you can walk around. Blobscape teaches that one blob at a time, then shows what else blobs can do
when they are made instead of captured: creatures on bones, worlds that grow, and pixel art that is
still 3D.

<p align="center">
  <a href="https://blobscape.dev/"><img src=".github/readme/front-page.webp" alt="The Blobscape front page: 'Learn 3D splats by taking them apart', beside a toadstool made of 146 blobs with one blob circled and its five attributes listed" width="880" /></a>
</p>

## Lessons

Every lesson is one question you answer with your hands. Goals tick off as you reach them, each
with a hint that points the way without giving it away, and every scene opens in the sandbox.

| Part | Lessons | What you learn |
| --- | --- | --- |
| **1. One object** | 1–8 | What a blob is, how it lands on screen, why order matters, color by angle, painting, file formats, breaking a scene apart |
| **2. Rigs and 3D models** | 9–16 | Bones, weights, twisting without tearing, a walk cycle, feet on uneven ground, saving a creature as a model, morphs, fur and grass |
| **3. Real things from photos** | 17–21 | Training blobs from photos, fuzzy things meshes can't keep, cleaning up floaters, why lighting is baked, why small blobs shimmer |
| **4. Build with the engine** | 22–24 | Your first creature in code, a scene written as data, pixel art that holds still |

<p align="center">
  <a href="https://blobscape.dev/lessons/one-blob/"><img src=".github/readme/lesson.webp" alt="Lesson 1, One blob: goal cards above a dark display case holding a single orange blob with its axes, and sliders for its size, turn, color and opacity" width="880" /></a>
</p>

[**Scene Creator**](https://blobscape.dev/scene-creator/) makes your own pixel diorama: start from
one of the scenes or a bare land, set down props from a library cut out of the scenes, arrange and
light them, pick a style and export the loop. Your scenes are kept in your own browser, or saved as a
`.blobscape.json` file: a project, which names its land and props from the library and says where
each stands, rather than a description of its own (see `docs/scene-descriptions.md`).

The [**Sandbox**](https://blobscape.dev/experiments/sandbox/) is where you make a mess: spray, select,
recolor and explode blobs, add creatures, or open your own capture (.ply, .spz, .splat, .ksplat, .sog).
Files stay in your browser.

## Experiments

<table>
  <tr>
    <td width="33%" valign="top">
      <a href="https://blobscape.dev/experiments/creature/"><img src="public/covers/splat-creatures.webp" alt="A fox in fur walking beside two smaller foxes" /></a><br />
      <a href="https://blobscape.dev/experiments/creature/"><b>Splat Creatures</b></a><br />
      Creatures made of blobs, moving on bones. Take one away as a rigged .glb or a sprite sheet.
    </td>
    <td width="33%" valign="top">
      <a href="https://blobscape.dev/experiments/pixel-diorama/"><img src="public/covers/pixel-diorama.webp" alt="A pixel-art lighthouse on a small island at night" /></a><br />
      <a href="https://blobscape.dev/experiments/pixel-diorama/"><b>Pixel Diorama</b></a><br />
      Scenes built from shapes and drawn as moving pixel art. Turn them, or switch the pixels off.
    </td>
    <td width="33%" valign="top">
      <a href="https://blobscape.dev/experiments/dungeon-run/"><img src="public/covers/dungeon-run.webp" alt="An elf with a sword in a torchlit dungeon, surrounded by colored slimes" /></a><br />
      <a href="https://blobscape.dev/experiments/dungeon-run/"><b>Dungeon Run</b></a><br />
      Sword, fire and frost against waves of slimes that burst into splats.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/shape-shifter/"><img src="public/covers/shape-shifter.webp" alt="A frog made of blobs partway through turning into another creature" /></a><br />
      <a href="https://blobscape.dev/experiments/shape-shifter/"><b>Shape Shifter</b></a><br />
      One creature turns into another, every blob traveling to a partner.
    </td>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/forest-walk/"><img src="public/covers/forest-walk.webp" alt="An elf seen from behind on a misty forest path" /></a><br />
      <a href="https://blobscape.dev/experiments/forest-walk/"><b>Forest Walk</b></a><br />
      Walk an endless path while trees and flowers grow out of the ground.
    </td>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/clockwork/"><img src="public/covers/clockwork.webp" alt="A watch movement with gold wheels and blue hands" /></a><br />
      <a href="https://blobscape.dev/experiments/clockwork/"><b>Clockwork</b></a><br />
      A watch movement made of blobs, keeping the real time.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/scan-studio/"><img src="public/covers/scan-studio.webp" alt="A green mug scanned as a splat" /></a><br />
      <a href="https://blobscape.dev/experiments/scan-studio/"><b>Scan Studio</b></a><br />
      Clean up a phone scan: level it, cut the table and floaters, relight it.
    </td>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/fit-a-picture/"><img src="public/covers/fit-a-picture.webp" alt="Blurry colored blobs on the left settling into a sunset picture on the right" /></a><br />
      <a href="https://blobscape.dev/experiments/fit-a-picture/"><b>Fit a Picture</b></a><br />
      Watch blobs train themselves into a picture: the splat training loop, in 2D.
    </td>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/splat-to-sprite/"><img src="public/covers/splat-to-sprite.webp" alt="A potion bottle, half splat and half pixel-art sprite" /></a><br />
      <a href="https://blobscape.dev/experiments/splat-to-sprite/"><b>Splat to Sprite</b></a><br />
      Bake a splat into palette-locked pixel-art sprite sheets.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/sand-snow-goo/"><img src="public/covers/sand-snow-goo.webp" alt="A heap of sand, a slumped mound of snow and a puddle of green goo, each in its own tray, all made of blobs" /></a><br />
      <a href="https://blobscape.dev/experiments/sand-snow-goo/"><b>Sand, Snow and Goo</b></a><br />
      Blobs that flow: pour sand, snow or goo, drop a rock in it, or let a column go.
    </td>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/brush-and-ink/"><img src="public/covers/brush-and-ink.webp" alt="A windmill on a hill, half painted in gouache strokes and half drawn in ink on paper" /></a><br />
      <a href="https://blobscape.dev/experiments/brush-and-ink/"><b>Brush and Ink</b></a><br />
      The same blobs drawn as brush strokes or pen lines that stay put as the view turns.
    </td>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/wading-pond/"><img src="public/covers/wading-pond.webp" alt="An elf wading through a pond in a ruin at night, rings spreading from its legs, candles burning in a niche" /></a><br />
      <a href="https://blobscape.dev/experiments/wading-pond/"><b>Wading Pond</b></a><br />
      Wade through a ruin's pond by candlelight: every ring comes from a real footfall.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/day-and-night/"><img src="public/covers/day-and-night.webp" alt="A log cabin in a forest clearing at dusk, its windows and a lantern lit and fireflies out" /></a><br />
      <a href="https://blobscape.dev/experiments/day-and-night/"><b>Day and Night</b></a><br />
      Drag the hour: the sun and moon cross the sky, shadows turn, lamps come on and fireflies come out.
    </td>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/four-ways/"><img src="public/covers/four-ways.webp" alt="One scene drawn four ways in a grid: by a plain shader, by three.js meshes, by Spark splats and by Blobscape" /></a><br />
      <a href="https://blobscape.dev/experiments/four-ways/"><b>One Scene, Four Ways</b></a><br />
      The same scene drawn by a plain shader, three.js meshes, Spark splats and Blobscape, side by side.
    </td>
    <td valign="top">
      <a href="https://blobscape.dev/experiments/seasonal-bouquets/"><img src="public/covers/seasonal-bouquets.webp" alt="An armful of fall flowers in a sage green pumpkin on a round table: red winterberry, plum roses, red zinnias, purple asters and oak leaves" /></a><br />
      <a href="https://blobscape.dev/experiments/seasonal-bouquets/"><b>Seasonal Bouquets</b></a><br />
      A florist that grows every flower from a recipe and never arranges the same bouquet twice.
    </td>
  </tr>
</table>

## The Blobscape engine

Most splat renderers show a place someone captured with a camera. The engine in
[`src/splat-engine`](src/splat-engine) is for splats that are **made, and that move**. It draws
through three.js on WebGPU, with a WebGL 2 fallback, and everything on the site that walks, grows,
ticks or burns uses it.

- **Bones for blobs.** Every blob follows up to four bones, blended on the GPU. Bones turn, slide and grow.
- **One world, one sort.** Every actor shares one set of blobs, sorted together each frame, so a hero, forty slimes and the hall around them overlap correctly.
- **Made, not captured.** Creatures and scenes are written as shapes and cut into blobs with sun and shadows baked in. A whole scene can be [plain data](docs/scene-descriptions.md).
- **Live lights.** Point lights, and a sun and moon that follow the hour, shade the colors by distance and facing and cast shadows.
- **Pixel mode.** Palette, dither, outlines, glow and pixels that hold steady while the camera swings. Sprite sheets come from the same pass.
- **Files that travel.** A rigged, animated splat saves as one .glb: the glTF splat extension plus ordinary skins and animation.

For captured rooms, very large scans and headsets, use [Spark](https://github.com/sparkjsdev/spark),
which also draws Blobscape's lessons and sandbox. The two trade files, not a renderer.

The engine is on npm as [`@blobscape/engine`](https://www.npmjs.com/package/@blobscape/engine), a package for
three.js (`npm install @blobscape/engine three`). The [Build with the engine](https://blobscape.dev/lessons/first-creature/)
lessons are its guides, and every export is in the [docs](https://blobscape.dev/engine/docs/).

### Rigged splats in glTF

`KHR_gaussian_splatting` stores splats in glTF but says nothing about how a splat's shape follows
its bones. The [rigged-splat spec](docs/rigged-splats.md) (draft, also at
[blobscape.dev/engine/rigged-splats](https://blobscape.dev/engine/rigged-splats/)) settles that with
one rule and no new data. Files that follow it still open in any glTF splat viewer, standing still.
Sample files: [`public/rigged-splats/`](public/rigged-splats).

## Run it locally

Needs Node 22.12 or newer (the tests and scripts run TypeScript directly).

```sh
git clone https://github.com/mtblck/blobscape.git
cd blobscape
npm install
npm run dev          # http://localhost:5173/
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests in Node, no GPU: the pixel pipeline, the trainers, and the engine's rig, file and scene math |
| `npm run build` | Hosting check, type check, Vite build to `dist`, then a prerendered HTML file for every page |
| `npm run preview` | Serve the build with the production headers |
| `npm run verify` | Real Chromium against `dist` under the production CSP, with axe accessibility checks (all of them; `-- --changed` runs only those a change reaches) |
| `npm run check` | Unit tests, build, then the browser checks the branch's changes reach: run this before merging ([testing](docs/testing.md)) |
| `npm run loops` | Record Pixel Diorama's gallery loops from the build, several scenes at once (needs ffmpeg) |

## How the repo is laid out

```
src/
  blobscape/      the site: pages, lessons, sandbox and experiments
  splat-engine/   the animated-splat engine (WebGPU + WebGL 2, on three.js)
  splat-core/     shared splat pieces: blobs, pixel pipeline, color, file reading
  shared/         header, footer, theme, controls and the experiment layout
  fit-a-picture/  the 2D trainer
  splat-to-sprite/
api/              the contact form's serverless function
scripts/          prerender, hosting check and browser verify
docs/             design notes, the engine's history, the rigged-splat spec, scene descriptions
```

Further reading: [design notes](docs/design-notes.md) ·
[how the engine began](docs/engine-prototype.md) ·
[writing a scene as data](docs/scene-descriptions.md) ·
[testing](docs/testing.md).

## Thanks

Pixel Diorama was inspired by the pixel-art Gaussian splat scenes that
[Silicon Jungle](https://x.com/JungleSilicon) shared: the idea of drawing voxel scenes as small solid
blobs and cutting them to a palette, and the themes of several scenes. The world-building shapes
(brick walls, steps and fences, formations, weather that lands, worn rock) follow ideas from their
Ink Studio kit. Since November 2026 the two projects build on each other's work by agreement: where an
idea or code comes from [Ink Studio](https://github.com/siliconjungle/shapeshift-labs-ink-studio)
(MIT, © siliconjungle), the code says so where it is used. Ink Studio also gave us ideas for smaller
improvements to Pixel Diorama's pixel art, such as dither that moves with things and the picture held on
the art's grid.

The sandbox's One photo to a scene guesses depth with
[Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) Small (Yang et al., 2024, Apache 2.0),
and its tap to select finds the tapped thing with
[SlimSAM](https://github.com/czg1225/SlimSAM) (Chen et al., 2023, Apache 2.0), a slimmed
[Segment Anything](https://segment-anything.com/) (Kirillov et al., 2023). Both are
run in the browser by [ONNX Runtime Web](https://onnxruntime.ai/); the weights are in `public/models/`.

Blobscape stands on [three.js](https://threejs.org/), [Spark](https://sparkjs.dev/) and the
[3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) paper by Kerbl
et al.

## License

[MIT](LICENSE) © Matt Black
