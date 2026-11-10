# experiments

Small interactive experiments served at `mattblack.space/experiments/<name>/`. One Vite multi-page app,
one Vercel project; the portfolio (mtblck/mb-portfolio) proxies `/experiments/(.*)` to this project's
production domain. See README for the why behind the choices.

## Commands
- `npm run dev`, `npm run build` (runs hosting:check + tsc first), `npm run preview` (production headers)
- `npm test` — unit tests for the pixel pipeline (node --test, no GPU)
- `npm run build && npm run verify` — real Chromium against dist with vercel.json headers, plus axe; screenshots in verify-shots/

## Load-bearing
- Vite `base: '/experiments/'`, `outDir: 'dist/experiments'`; files live at the same path on both domains. `hosting:check` enforces it.
- CSP needs `'wasm-unsafe-eval'` and `worker-src blob:` (Spark decodes in WASM, sorts in a blob worker).
- Add a new experiment: `<name>/index.html` + `src/<name>/`, an input in vite.config.ts, a redirect in vercel.json, a card in src/hub. Every page renders `SiteHeader` (src/shared) first and puts its content in `<main id="main">` for the skip link.

## Splat to Sprite
- three.js + Spark (`@sparkjsdev/spark`). Live view = scene SparkRenderer; sprite = a second, offline SparkRenderer with a render target, sorted for the sprite camera (`engine.ts`).
- Read the target with sync `readRenderTargetPixels`; Spark's async `readTarget()` stalled in headless Chromium.
- The viewport only renders when invalidated or while Spark is mid-sort; Spark picks up a finished sort only on the next render, so don't stop on `framesLeft` alone.
- Sheet JSON mirrors Tinkerkit's `SpriteSheet` (tinkerkit packages/format/src/spritesheet.ts, format 71); rows down/left/right/up.
- Commit as `mtblck <105079242+mtblck@users.noreply.github.com>` or Vercel blocks the deploy.
