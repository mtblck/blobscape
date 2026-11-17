# Testing Blobscape

Blobscape has two kinds of checks: unit tests in Node (`npm test`, under a
minute, no GPU) and browser checks (`npm run verify`), which load the built site
in a real Chromium under the production headers. Every page and experiment
has its own browser checks, so a change only needs the ones it can reach.

## Which command for which change

Run the one that fits before merging. Say in the PR which one ran.

| The change | Run |
| --- | --- |
| Docs, tests only, copy in a `.md` file | `npm test` |
| Anything else (the usual case) | `npm run check` |
| The build, hosting headers, `package.json` beyond its runtime `dependencies`, the check harness; or before a release | `npm test && npm run build && npm run verify` (the full run) |
| Just want one area again after fixing it | `npm run verify -- <check or group>` |

The engine docs' reference is checked against the code by a unit test that needs TypeDoc, which lives in its own
small package (`tools/api-docs`); `npm run check` installs it first (`npm run docs:deps`), and without it that one
test is skipped.

`npm run check` is `npm test`, `npm run build` and then
`npm run verify -- --changed`: the browser checks that the files changed since
`main` (committed, uncommitted and new) can reach, and no others. If the changes
touch the build or the harness, that is every check, so it becomes the full run
on its own; you never have to work out the reach by hand.

Some examples of what `--changed` runs:

| Change | Checks |
| --- | --- |
| One scene description (`diorama/scenes/bee.ts`) | that scene only |
| One lesson (`lessons/Paint.tsx`) | its lesson check and that page in the desktop and phone sweeps |
| The site's copy and dates (`site.ts`, `meta.ts`) | `site` |
| Header or footer | `site`, `lessons-basics`, both page sweeps |
| The pixel pass (`splat-engine/pixelPass.ts`) | every page drawn by the engine (10 checks) |
| A file most checks import (`splat-core/blobs.ts`, `shared/ui.tsx`, `routes.ts`, the lesson shell) | the 10 `core` checks (see below) |

To see what a change would run without running it:

```sh
npm run verify -- --files=src/blobscape/lessons/Paint.tsx --why --list   # any files
npm run verify -- --changed --why --list                                  # your branch
```

## How it works

- The checks live in `scripts/verify/checks/<group>.mjs`, one object per check:
  `name`, `about`, `entries` (source files, followed through their imports),
  `files` (paths or folders taken as they are: HTML, `public/` assets, docs)
  and `run(t)`. `t` is the shared kit from `scripts/verify/lib.mjs`: `open`,
  `ok`, `fails`, `axe`, `tabClick`, `solidPixels`, `ballPly`. Each check opens
  its own pages and closes them; nothing is shared between checks.
- `npm run verify -- --list` lists every check with its last time.
- A check can have `parts` (the page sweeps have one per page, `diorama-scenes`
  one per scene): `--changed` then runs only the parts a change reaches, and the
  check asks `t.wants(key)`.
- `scripts/verify/graph.mjs` reads imports (static, `import()`, `new URL()`
  workers, `?raw`), and which packages each file imports by name. A change to
  `package.json` that only adds, bumps or drops runtime `dependencies` reaches
  just the checks whose files import those packages (the lock file goes with
  it; `--why` shows them as `pkg:<name>`, and `--files=pkg:<name>` asks the same
  by hand). Any other change to `package.json` (scripts, `devDependencies`,
  which build and test the site), a lock file change on its own,
  `vite.config.ts`, `vercel.json`, `tsconfig.json` or the harness reach every
  check; tests, `docs/` (except the
  spec) and the loop recorder reach none. The app shell and the site's chrome
  and copy (`App.tsx`, `site.ts`, `meta.ts`, `engineCopy.ts`, header, footer,
  logo) are not followed into from other checks: what they can break is the
  chrome, which the checks that name them cover.
- A file that reaches 80% or more of the checks through imports (the blobs,
  the shared controls, the router, the lesson shell, toasts) runs only the checks
  marked `core: true`: `site`, `lessons-basics`, `lessons-rigs`,
  `sandbox-tools`, `creature`, `diorama`, `engine-lab`, `sprite`, `fit` and
  `layout`. Between them they draw with Spark and with the engine on WebGPU and
  WebGL, make pixel art and sprite sheets, train, pose on the CPU, edit in the
  sandbox and lay out every experiment, in about 5 minutes instead of 15. Add
  `--wide` to run everything such a file reaches, for example when a change to
  the shared controls could show on every page.
- `--changed` prints any changed file no check covers. That usually means a new
  page or asset that needs a check.
- Checks run three at a time, each in its own Chromium (`--jobs=N` to change it),
  longest first by the times in `verify-shots/timings.json`. A check that runs
  past 15 minutes is stopped and failed (`--limit=<seconds>`).
- The browser here renders WebGPU and WebGL in software (SwiftShader), so a
  scene build or a frame costs far more than on a laptop. Engine pages draw
  off-screen (`?offscreen=1`) and the check calls `stage.frame(t)`.

## Writing a check

- Add it to the group file it belongs with, or a new file in `checks/`. Give it
  `entries` (the page component is usually enough) so `--changed` finds it.
- Off-screen engine pages have no frame loop, so a waiting mark stays up until
  the check draws a frame. Wait for the stage (`window.__engine`,
  `window.__creature`, …), not for the mark to go: a wait for the mark
  times out every run (this cost 8 minutes a run until 2026-11-17).
- Judge drawing by what must be true for any input, not by exact counts tuned
  to one creature or seed: a seeded monster can be dark, and a creature that
  changes shape changes its pixel counts. Compare two frames, or a share of the
  frame, before reaching for a fixed number.
- Anything that doesn't need a browser (data, math, file round trips, baking on
  the CPU) is a unit test next to its module instead: it runs in seconds and
  every time.
