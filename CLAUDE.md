# experiments

Small interactive experiments served at `mattblack.space/experiments/<name>/`. One Vite multi-page app,
one Vercel project; the portfolio (mtblck/mb-portfolio) proxies `/experiments/(.*)` to this project's
production domain. See README for the why behind the choices.

## Commands
- `npm run dev`, `npm run build` (runs hosting:check + tsc first), `npm run preview` (production headers)
- `npm test` — unit tests for the pixel pipeline and the Gaussian fitter (node --test, no GPU)
- `npm run build && npm run verify` — real Chromium against dist with vercel.json headers, plus axe; screenshots in verify-shots/

## Load-bearing
- Vite `base: '/experiments/'`, `outDir: 'dist/experiments'`; files live at the same path on both domains. `hosting:check` enforces it.
- CSP needs `'wasm-unsafe-eval'` and `worker-src blob:` (Spark decodes in WASM, sorts in a blob worker).
- Add a new experiment: `<name>/index.html` + `src/<name>/`, an input in vite.config.ts, a redirect in vercel.json, a card in src/hub. Every page renders `SiteHeader` (src/shared) first and puts its content in `<main id="main">` for the skip link.
  Tabs, sliders, chips and toggles live in `src/shared/ui.tsx`; reuse them so every experiment shares the same hover and cursor states.

## Splat to Sprite
- three.js + Spark (`@sparkjsdev/spark`). Live view = scene SparkRenderer; sprite = a second, offline SparkRenderer with a render target, sorted for the sprite camera (`engine.ts`).
- Read the target with sync `readRenderTargetPixels`; Spark's async `readTarget()` stalled in headless Chromium.
- The viewport only renders when invalidated or while Spark is mid-sort; Spark picks up a finished sort only on the next render, so don't stop on `framesLeft` alone.
- Sheet JSON mirrors Tinkerkit's `SpriteSheet` (tinkerkit packages/format/src/spritesheet.ts, format 71); rows down/left/right/up.
- Commit as `mtblck <105079242+mtblck@users.noreply.github.com>` or Vercel blocks the deploy.

## Fit a Picture
- `fit.ts` is the whole trainer (render, loss, hand-derived backward pass, Adam, prune, densify) on typed arrays; it runs in `trainer.worker.ts` and in Node tests. Change a gradient → `npm test` (finite-difference check).
- Blobs add up (no sorting): pixel = Σ opacity·colour·falloff. Params are log scales, angle, and sigmoid colour/opacity.
- The worker posts a frame ~30×/s with the display image, new losses and events; the page keeps losses in a ref buffer, not state.

## Blobscape
- One page, hash routes (`#/lesson/<id>`, `#/sandbox`), kept liftable: `blobscape/`, `src/blobscape/`, `src/splat-core/`, `src/shared/`. Matt may move it to blobscape.dev.
- `src/splat-core/` is shared with Splat to Sprite (render loop, presets, framing). `Blobs` (typed arrays) is the source of truth; `SplatView.sync(blobs, from)` uploads to Spark.
- Lesson goals live in `routes.ts` (`LESSON_GOALS`); each lesson's `useGoals` checks are keyed by those ids. Each goal has a `hint` (points, never answers), a `why` (shown once it ticks) and a `where` (a control group id, or 'view', to light up).
- Lessons use the exhibit layout in `Shell.tsx`: question + goal cards, an always-dark display case (`.case` in theme.css re-declares the dark tokens, so overlays call `themeColour(name, ctx.canvas)`), a desk of control `groups`, then the explanation spread. Views inside the case pass `bare`.
- The Order lesson draws with `cpuSplat.ts`, because Spark can't be made to sort wrongly.
- Effects: GLSL (`effectStatements`, a dyno `objectModifier`) and TS (`applyEffectOne`) must stay in step; both hash the GPU slot. Change one, change both, and check "baked matches preview" in verify.
- The overlay canvas is `willReadFrequently` (CPU): a GPU 2D canvas in headless Chromium kept showing an old frame after a clear.

