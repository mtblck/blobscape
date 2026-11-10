# Experiments

Small interactive things, built to learn how something works by poking at it. Served at
[mattblack.space/experiments/](https://mattblack.space/experiments/).

| Experiment | What it is |
| --- | --- |
| [Splat to Sprite](https://mattblack.space/experiments/splat-to-sprite/) | Turn a 3D Gaussian splat into pixel-art sprites and Tinkerkit sprite sheets |

```sh
npm install
npm run dev            # http://localhost:5173/experiments/
npm test               # pixel pipeline unit tests
npm run build          # hosting check, typecheck, build to dist/experiments
npm run verify         # Chromium against dist, under the production CSP, with axe
```

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
