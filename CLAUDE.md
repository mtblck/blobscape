# Blobscape

Blobscape (blobscape.dev): lessons, a sandbox and small experiments with Gaussian splats. One Vite
multi-page React app, one Vercel project, served from the root. See README for the why behind the choices.

## Commands
- `npm run dev`, `npm run build` (hosting:check + tsc, vite build, then `scripts/prerender.ts`), `npm run preview` (production headers)
- `npm test` — unit tests for the pixel pipeline and the Gaussian fitter (node --test, no GPU)
- `npm run build && npm run verify` — real Chromium against dist with vercel.json headers, plus axe; screenshots in verify-shots/

## Load-bearing
- Vite `base: '/'`, `outDir: 'dist'`, Vercel `trailingSlash: true` (every page is a folder with an index.html). `hosting:check` enforces it.
- Blobscape's pages are paths (`/`, `/lessons/`, `/lessons/<id>/`, `/sandbox/`, `/experiments/`, `/experiments/creature/`), parsed in `routes.ts`. `scripts/prerender.ts` writes each one's HTML (title, description, canonical, og, JSON-LD, readable content) from the built `dist/index.html`, plus 404.html, sitemap.xml, robots.txt. A new page needs a case in `routes.ts`, `meta.ts` and `prerender.ts`.
- `useLinkNavigation` turns plain clicks on links to Blobscape pages into in-app navigation; tools and other sites load normally. Old `#/…` links are rewritten to paths on load.
- CSP needs `'wasm-unsafe-eval'` and `worker-src blob:` (Spark decodes in WASM, sorts in a blob worker).
- Every experiment lives under `/experiments/` (old `/creature/` and `/tools/*` addresses redirect there). Add a new tool: `experiments/<name>/index.html` + `src/<name>/`, an input in vite.config.ts, an entry in `EXPERIMENTS` (src/blobscape/site.ts: front page, menu, footer) and the sitemap list in prerender.ts. Every page renders `SiteHeader` (src/shared) first, puts its content in `<main id="main">` for the skip link, and ends with `Footer` (src/shared).
- Brand: colours are hex tokens in `src/shared/theme.css` (light default, dark three times: system, forced, `.case`; keep them in step). Blob coral `#f2553a` (`blob`) is for the logo and big shapes, never small text; `accent` is the text-safe coral. Headings `font-display` (Fredoka 600), text Figtree. Logo shapes in `src/shared/logoPaths.ts`; don't recolour, stretch or add effects. The theme choice is stored as `blobscape-theme`.
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
- One app at the site root (`index.html`, `src/blobscape/`), on `src/splat-core/`, `src/splat-engine/` and `src/shared/`.
- `src/splat-core/` is shared with Splat to Sprite (render loop, presets, framing). `Blobs` (typed arrays) is the source of truth; `SplatView.sync(blobs, from)` uploads to Spark.
- Lesson goals live in `routes.ts` (`LESSON_GOALS`); each lesson's `useGoals` checks are keyed by those ids. Each goal has a `hint` (points, never answers), a `why` (shown once it ticks) and a `where` (a control group id, or 'view', to light up).
- Lessons use the exhibit layout in `Shell.tsx`: question + goal cards, an always-dark display case (`.case` in theme.css re-declares the dark tokens, so overlays call `themeColour(name, ctx.canvas)`), a desk of control `groups`, then the explanation spread. Views inside the case pass `bare`.
- The Order lesson draws with `cpuSplat.ts`, because Spark can't be made to sort wrongly.
- Effects: GLSL (`effectStatements`, a dyno `objectModifier`) and TS (`applyEffectOne`) must stay in step; both hash the GPU slot. Change one, change both, and check "baked matches preview" in verify.
- Colour by angle evaluates spherical harmonics on the CPU (`splat-core/sh.ts`, tested) and re-uploads per orbit; its goal uses the stored highlight's peak as a share of the real one, which falls as shine sharpens (a whole-ball error doesn't).
- Splat files encodes .ply/.splat with our writers and .spz with Spark's `writeSpz`, then reads each back through `readSplatFile`, so what you see is what the file holds. Break it uses its own scatter, not the shared Explode: a radial push on a dense scene just looks like a bigger object.
- The front page (`Landing.tsx`) is the home for every splat experiment: lessons, sandbox, then the other tools (`EXPERIMENTS`). Its pictures (`diagrams.tsx`) are SVG blobs filled with shared radial gradients (`BlobDefs`, ids `bs-<colour>`), so don't reuse a `bs-` id elsewhere.
- Header and menu (pages only; lessons are one "Lessons" link so new lessons need no menu change) in `shared/SiteHeader.tsx`; footer in `shared/Footer.tsx`; tip button in `Chrome.tsx`; page titles and descriptions in `meta.ts`; site facts (origin, Ko-fi link, the experiments) in `site.ts`. The tip button shows only on the front page and lesson list (it would cover lesson controls) and tucks away at the footer.
- SEO: every page's HTML is prerendered (see Load-bearing); JSON-LD is allowed past hosting:check because it's data. `public/og.png` is the share image (brand kit `social/og-image.png`).
- Rigs lessons (9–13: one-bone, weights, twist, walk, model) pose on the CPU with `splat-engine/pose.ts` `poseBlobs` and hand Spark the result; parts of the lesson list come from `PARTS` in routes.ts. Splat Creatures (`/experiments/creature/`, still `creature` in code) draws with our engine (`creature/stage.ts`, lazy-loaded); verify loads it with `?offscreen=1`.
- Creatures are `Species` in `splat-engine/zoo/` (frog, fox, elf, dragon; `?creature=<id>` picks one; type and look sit in their own card above the controls, and switching shows no loading note because it is quick. Its three cards share `creature/card.ts` (box, title, subtitle) and every field there stacks its label above the control (`stack-controls`)). The Monster chip (and "Generate a new monster" in its Look slot) builds one from a seed (`zoo/monster.ts`, `?creature=monster&seed=N`, 1..`MAX_SEED`): the plan, bones, body and walk/stand/roar all come from the seed, and `zoo.test.ts` runs every zoo check over a spread of seeds. Names skip anything `AVOID` matches. New ones are written with `body.ts` (tubes, balls, sheets, filled cones, weighted by distance to named bones) and posed with `posing.ts` (`aim`, `env`, `ramp`). A clip must loop: a move that calls another (fire calls idle) maps its time onto that one's period. `creature/bones.ts` draws the rig (Blobs / Bones / Both).
- Bones can grow (`Skeleton.size`, inherited by children, as glTF scale) and slide (`offset` on any bone); clips record offsets and sizes only for bones that use them. The frog's tongue and the dragon's fire are built small inside the mouth at rest and grown out, so a file opened elsewhere shows them hidden.
- Sprite sheets on Splat Creatures (`creature/Sprites.tsx`): `stage.bake` pauses the live view and holds creature/mode/show changes until done; `splat-engine/bakeSheet.ts` draws (one camera distance from `frameAll` for every frame) and runs Splat to Sprite's `processFrames`; `spriteSheet.ts` (pure, tested) plans rows (move × direction, `shotsFor` order) and writes the Tinkerkit and Aseprite JSON. The engine lab's walk sheet uses the same baker.
- The overlay canvas is `willReadFrequently` (CPU): a GPU 2D canvas in headless Chromium kept showing an old frame after a clear.


## Splat engine (prototype, `src/splat-engine/`, test page `/engine-lab/`)
- The engine lab is deliberately unlisted (noindex, no hub card): it's a test bench, not an experiment.
- `Skeleton.place` is where an actor stands; poses (`offset`, `rotation`, `reset()`) never touch it.
- Our own renderer for animated splats, on three.js's WebGPURenderer (TSL). `SplatWorld` holds every blob of every actor. WebGPU, per frame: deform compute (bones → world centre + covariance), project compute (→ screen centre + ellipse axes, writes sort keys and histogram), `DepthSort` prefix + scatter (`sort.ts`, one counting sort over the whole scene), then a lean instanced draw. Projection/shading follow three's `GaussianSplat` (MIT). A still object is one bone.
- WebGL has no compute: the vertex shader runs `deformBlob` + `projectSplat` per corner (like a skinned mesh), and the CPU only moves centres (`skinCentres`) and sorts. Both backends share those TSL helpers, so change them once.
- Quads shrink with opacity (`placeQuad`): a blob's quad reaches only as far as it stays above 1/255.
- `rig.ts` `skinBlob` is the CPU twin of the deform pass (used by `checkAgainstCPU`; `skinCentres` is its fast centre-only twin, tested against it); change one, change both. Weights go to the GPU as bytes summing to 255 (`packWeights`) and the CPU twin reads the same bytes.
- A compute stage may bind only 8 storage buffers on many phones: joints+weights share one buffer for that reason.
- Headless software WebGPU renders but can't present to a canvas: the lab's `offscreen=1` draws to a target and copies frames to the page; verify uses it.
- Rigged files: `glb.ts` writes KHR_gaussian_splatting + standard glTF skins/animation + `BLOBSCAPE_gaussian_skinning` (used, not required). three.js's loader opens them as a still splat (verify checks).
- The pixel pipeline lives in `src/splat-core/pixel.ts` (shared by Splat to Sprite and the engine's walk sheet); colour transfer functions, `SH_C0` and the render-target readback (`readbackToSrgb`) in `splat-core/colour.ts`.
- Status and gaps: `docs/engine-prototype.md`.
- Rigged-splat file rule (spec draft, sample files): `docs/rigged-splats.md`; the skinning extension object sits inside the primitive's `KHR_gaussian_splatting` object. The lab's `?which=spark` runs the same fox on Spark's `SplatSkinning` (bones rest at the origin; see `sparkBones.ts`).

## Clockwork (`/experiments/clockwork/`, `src/blobscape/Clockwork.tsx`, `src/splat-engine/clockwork.ts`)
- A watch movement on the Creature page's `CreatureStage`, posed from the time with `setPoser(poseClock, seconds)` instead of a clip (it never loops); `setFloor(0)` hides the floor.
- Every turning part is one bone about z. `anglesAt(s)` drives the whole train from the escape wheel's beats (5 a second, half a tooth each) by real tooth counts (`TEETH`); `layout()` places arbors at exactly the meshing pitch radii and `meshes()` sets tooth phases so teeth stay in gaps (tested in `clockwork.test.ts`). Change a tooth count and the layout, phases and hands follow.
- Fine parts (teeth, pinion leaves, hairspring) use small `size` and high `density`; the plate is dark and sparse so the gold reads.

## Forest Walk (`/experiments/forest-walk/`, `src/blobscape/forest/`)
- The elf and the whole forest are one `SplatWorld`, built once; walking only re-poses. Changing detail, season or the elf's look rebuilds it.
- The path is a ring of `RING` tiles; `pathX` repeats every `PERIOD` so tile i always reuses ring slot i % RING (its ground moves by whole periods). Plants per tile are fixed per kind (`PER_TILE`), and `layout(i, seed)` says which stand where, so walking back finds the same forest.
- Growing is bone `size` from 0 (`sprung`), swaying is a turn on upper bones; hidden plants have `rootScale` 0 and stand at the elf so they don't stretch the scene bounds.
- Mist: `SplatWorld.setFog` (both backends, by view depth) and the floor plane's own fade must use the same colour and distances.
- `world.ts`/`forest.ts` are pure and tested in Node; verify drives `stage.frame(seconds, input)` with `?offscreen=1`.

## Dungeon Run (`/experiments/dungeon-run/`, `src/blobscape/DungeonRun.tsx`, `src/blobscape/dungeon/`)
- `game.ts` is the whole game in plain numbers (hero, slimes, bolts, waves; circles on the floor for every hit and push), stepped by `step(dt, input)` and tested in Node. `dungeon.ts` builds every actor once and poses them from the game; nothing is rebuilt mid-fight.
- Slimes are pooled per colour (`RULES[kind].pool`; colours are baked into blobs, so a slime can't change colour). A pool slot not in use is hidden with `rootScale` 0 at the hero. Each slime carries 16 shard bones at size 0 that become the burst.
- The hero is the elf's spec (`elfSpec`) plus a `sword` bone on the right hand and an `orb` bone on the left; swings and casts are `aim`s layered on the idle/run blend.
- Torchlight is baked into the hall's colours (`torchLight`); the flames are bones. Verify drives `stage.frame(seconds, input)` with `?offscreen=1`.
