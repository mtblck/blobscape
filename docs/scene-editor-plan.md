# Plan: Scene Creator, a scene editor in the sandbox's place

Status: a plan, not built. Written 2026-11-19 from Matt's direction. His answers so far are under
[Decisions](#decisions), with what is still open.

## The idea

Today the sandbox is a place to build with loose blobs: add, spray, paint, erase, select, drop in
creatures, run effects. It is drawn by Spark. Diorama is where the site has become its own
thing: scenes written as data, cut and lit by our engine, and shown in eleven styles (pixel art,
gouache, oil, ink and wash, hatching, cel shading, neon, stained glass, watercolor, ASCII and plain
blobs) with a loop export.

The plan is a new page, **Scene Creator** (Matt's name), that takes the sandbox's place in the header.
It keeps the sandbox's layout (the Modes workspace, epic #254) and is where a visitor makes and edits
dioramas:

1. open a scene, move things around in it, add props from a library, change the light, pick a style
2. bring in a model of their own as a prop
3. bring in a whole scene of their own and put our styles and live light on it
4. save it, share it, export it
5. later, and only for those who choose it: an account that keeps their work, and credits to have
   Claude write a scene

Building with loose blobs is not thrown away. The sandbox moves as it is into the experiments (see
[What happens to today's sandbox](#what-happens-to-todays-sandbox)).

### Should we?

Yes, with one caution.

For it: the scenes and the styles are what nobody else has, and today a visitor can only look at
them. Everything an editor needs already exists in pieces: scenes as data with a checker
(`sceneDoc.ts`), a way to lift a creature out of a scene (`zoo/fromScene.ts`), models read from
.obj and .glb and cut as scenes (`meshFile.ts`, `meshShape.ts`, `diorama/model.ts`), rigged models
turned to splats (`skinnedModel.ts`), every style behind one hook (`drawnLook.tsx`), a loop export
that works in every style (`diorama/exportLoop.ts`), live lights and shadows, picking
(`Stage.hitAt`, `pick.ts`), and a workspace layout built for modes (`sandbox/modes.tsx`). The work is
mostly joining them, not inventing.

The caution: the sandbox as it stands is 1,800 lines on Spark, and almost none of that code carries
over, because the editor has to be drawn by our engine's `Stage` for the styles and lights to work.
So this is a new page in the old layout, not a refit. The plan below builds it at its own
address beside the current sandbox, and the header changes only when the first phase is usable.

## What the code gives us, and where it pushes back

Facts from the code that shape the plan:

- **A scene is cut as one piece.** `compileScene` hands every part to `buildVoxels` on one shared
  grid. Sun, shade and cast shadows are baked into each blob's color as it is cut. Cutting takes
  seconds (about 1.5 s for 60,000 blobs; a fine scene is up to 240,000). So "drag the windmill a
  little to the left" cannot mean "cut the whole scene again each frame".
- **A stage can hold several actors.** `Stage.setActor(actor, clip, extras)` draws extra actors in
  the same world with one sort, and each actor's `Skeleton.place` moves it for free. The koi pond's
  water and the dragon's breath already ride along this way.
- **`place` only slides.** There is `place` and `rootScale`, but no turn for a whole actor. Turning
  a prop needs either a root bone that every prop has, or a recut of that prop.
- **Limits per description:** 64 bones, 240 parts, 4 scene lights, a palette of at most 32 colors,
  4 lights with baked shadows. The engine itself takes 16 live lights. A blob names its bones in a
  byte, so one actor stays under 256 bones.
- **Pixel art snaps to one palette.** A prop from another scene brings colors the host scene's
  palette may not have, and they would snap to the wrong hue.
- **Every move runs a whole number of times a loop.** A prop from a 16 s scene dropped into an 8 s
  scene must have its moves fitted again or the loop will not join.
- **The lighthouse is code, not a description** (`diorama/scene.ts`), and so are the fox meadow and
  the story half of Fishing for the moon. The other scenes are data.
- **`sceneCreature` picks by bone name.** That suits a creature. A building is mostly parts with no
  bone, so splitting props out of scenes needs picking by part as well.
- **Three styles want the scene cut with no baked light** (cel shading, neon, stained glass:
  `wantsPlain`). The page already cuts a scene twice for that.
- **The site stores nothing about anyone.** The only things kept are in the visitor's own browser
  (theme, lesson progress, the sandbox's open section). The contact form emails and stores nothing.
  The CSP has no `connect-src` beyond the site.

## The design in one page

### A project is a land plus placed props

A new, small format on top of `SceneDoc`, working name **project** (`SceneProject` in code):

```ts
interface SceneProject {
  name: string
  loop: number                 // seconds
  land: PropRef                // what everything stands on
  props: Placed[]              // things set down on it
  light: { from, ambient, ... }  // the sun, as SceneDoc.light
  sky?: [string, string]
  lights: LightDoc[]           // lamps the visitor added
  air?: AirDoc
  style: { id: Style, ...its settings }
  camera: Orbit & { swing?: number }
}
interface Placed { prop: PropRef; at: Vec3; turn: number; size: number; moves?: 'own' | 'still' }
type PropRef = { library: string } | { file: string } | { doc: PropDoc }
```

A **prop** (`PropDoc`) is a small description: bones, parts, moves and lights exactly as a
`SceneDoc` writes them, with its foot at the origin, plus a name, the colors it needs and the loop
its moves were written for. A land is a prop that is allowed to be big and gives the ground height.

Why not just edit one big `SceneDoc`? Because of the limits above (64 bones would be gone after
three creatures), because props must be movable without a recut, and because a library entry
should be a thing by itself.

### Each prop is its own actor

In the editor every placed prop is cut once, by itself, and drawn as its own actor beside the land.
Moving it is `Skeleton.place`; sizing is `rootScale`; turning uses a root bone every prop gets
(bone 0, as creatures already have). Nothing is recut while dragging.

What that costs, and the answer to each:

- **Baked sun on a turned prop is wrong** (its lit side turns with it). A prop is recut by itself
  when it is let go after a turn, in a worker, coarse first. A prop is small, so this is a fraction
  of a second at editing detail.
- **A prop casts no baked shadow on the land.** While editing, a dark flat blob under it stands in
  (Turkey Run already does this for things that pass). On WebGPU the sun can instead be a live
  `SunLight` with shadows, as Day and Night does it.
- **Parts of different actors do not cull each other**, so a prop sunk into a hill shows its buried
  blobs through thin places. Acceptable while editing.

**Finish** (a button, and what export uses) merges the project onto one grid where it fits the
limits (the land's and every placed prop's cut joined, each prop's shapes seen through its placement,
so distances stay exact and no description is rewritten), and cuts it as today's scenes are cut: one grid, real baked shadows, the full detail.
Where it does not fit (too many bones), the finished scene stays as several actors and says so.

#### Measured (issue #330, 2026-11-19)

The windmill, split by hand into its land and ten props (the mill with its sails, three trees, the
duck, two haystacks, three sheep), each cut by itself at Fine and drawn on one `CreatureStage`
with `setActor(land, undefined, props)`, beside the scene as Diorama cuts it. Headless
Chromium with a software GPU, so frame times are only good for comparing with each other.

| | Merged (today) | Apart |
| --- | --- | --- |
| Blobs at Chunky | 12,542 | 14,162 (13% more: what a prop stands on is no longer culled) |
| Blobs at Fine | 44,550 | 46,421 (4% more) |
| Cut at Chunky (Node) | 205 ms | 151 ms in all: land 95, mill 19, each other prop 1 to 13 |
| Cut at Fine (Node) | 753 ms | 564 ms in all: land 395, mill 91, each other prop 1 to 33 |
| Cut at Fine (in the page, WebGPU) | | land 401 ms, mill 86, others 1 to 37 |
| Frame, WebGPU (software) | 1,816 ms | 1,802 ms with 11 actors |
| Frame, WebGL (software) | 1,620 ms | 1,635 ms with 11 actors |

More actors, the same props copied round the land (WebGPU / WebGL, ms a frame): 1 prop 1,491 /
1,388, 5 props 1,784 / 1,586, 15 props 2,336 / 2,198, 30 props 2,842 / 2,848. Some of that is the
extra blobs, some is per actor; on a real GPU the gap should be smaller, but it is a reason to cap
the number of props (say 40) and to join props that never move into the land at Finish.

What it looks like (pictures: project files `blobscape/scene-creator/`):

- **Apart against merged:** 1.3% of the view's pixels differ, almost all in the shade under the mill
  and the sheep (their baked shadows are gone) and in the hashed speckle of the tree crowns. Side by
  side I could not tell which was which without the difference picture.
- **A moved prop** goes where it is put with nothing left behind: the land was cut without it, so
  there is no hole. Its own shadow is missing, which shows only as the ground under it being a shade
  lighter.
- **A turned prop** works through its root bone (compileScene's bone 0, `land`, at the origin), with
  `place` putting the foot back; the sails keep spinning on their own bone inside the turn. Its baked
  light turns with it, as expected: the mill turned a quarter showed its shaded side lit flat toward
  the camera. Recutting the mill alone takes about 90 ms at Fine, so a recut on letting go is cheap.
- **Nothing culls between actors**, so a prop dragged over the wheat stands in it rather than on it.
  The editor should sit props on `groundUnder` anyway.

**Decision: props are drawn apart while editing.** Cuts are faster than cutting the whole scene,
the picture is all but the same, and moving costs nothing. Finish (merge and cut once) stays for
export and for the scene's real baked shadows. The fallback (merged recuts in a worker with a
coarse preview) is not needed. Two things to build in: a prop is cut with its foot at the origin so
the root bone turns it about itself (`propFrom` does this), and a prop is recut by itself after a
turn or a size change.

### Light the visitor can change

Changing the sun means a recut today, because the sun is baked. Two tiers:

- **Baked** (every device): sun direction, shade and sky are settings; a change recuts in the
  background and the picture updates when it lands.
- **Live** (WebGPU): the scene is cut unlit and the sun is a live light with shadows, so dragging
  the sun moves the shadows as you drag. Day and Night's `daylight(hour)` can drive it, which gives
  the editor a time-of-day slider for free.

Lamps are live on both: add one, move it, color it, set its reach, make it flicker. Props bring
their own (the lighthouse's lamp, the witch's glow), and the panel shows the budget (16 live, 4
with baked shadows).

### Colors and loops when scenes mix

- **Palette:** a project's pixel palette is made from what is in it: the land's palette plus each
  prop's colors, cut down to 32 with the k-means in OKLab that `modelPalette` already has. The
  visitor can still pick any of the site's palettes instead.
- **Loop:** a prop keeps its own beat. Each of its moves is fitted to the nearest whole number of
  times in the project's loop (`periodIn` on Brush and Ink's neon does the same for its pulses).

### Modes

The workspace keeps `ModeBar`: a rail on desktop, a bar along the bottom on a phone, the view
beside it. Proposed modes (names are mine):

| Mode | What it holds |
| --- | --- |
| **Scene** | Start from one of our scenes or a bare land; open a file; your saved projects; save |
| **Props** | The library with search (the scene picker's `matching`), your imported props, Add |
| **Arrange** | The picked prop: move, turn, size, lift, copy, delete, its moves on or still |
| **Light** | Sun or time of day, sky, shade, lamps, glow, air (haze, rain, snow) |
| **Style** | The eleven styles and their settings, straight from `useDrawnLook` and the pixel controls |
| **Export** | Save this frame, export the loop as MP4 or animated PNG, save the project file |

A tap on a prop in the view picks it and opens Arrange. Undo and redo stay in the heading row and
become simple: a project is plain data, so each edit is a new copy on a stack.

### The prop library from our own scenes

`propFrom(doc, pick)` (new, pure, tested, beside `sceneCreature`) lifts a prop out of a
description: the bones matching a pattern, the parts on them, parts with no bone picked by their
place in the list, the moves and lights that belong to those bones, re-centered so its foot is at
the origin.

First library, from Matt's list:

| Prop | From | Notes |
| --- | --- | --- |
| White witch | `scenes/henge.ts` | Waits on PR #316 merging. Her arriving and leaving in sparks becomes an optional move; standing is the default. |
| Lighthouse | `diorama/scene.ts` | Code today. Rewritten as a description first (tower, lamp, cottage, jetty and boat as separate props; the lamp's two turning lights come along). |
| Windmill | `scenes/windmill.ts` | Mill with turning sails; the scene's `focus` and `steps` stay with the scene, not the prop. |
| Dragon | `scenes/dragon.ts` and the zoo | Two entries (Matt: both): the lava dragon as the scene has it (a bust, made to rise out of whatever it stands in) and the whole zoo dragon with its breath. |
| Giant turkey | `scenes/turkey.ts` | And the cook, the billboard, the mailbox, haystack and trees as their own props. |
| Lands | several | The lighthouse rock, the sky islands, the canyon floor, the henge's turf, the windmill's hill, the meadow, plus a plain round turf and a plain rock to start from. |

Every creature on Splat Creatures (`CREATURES`) joins as a prop too, since a `Species` is already a
thing that can be cut and posed. After that, more props are a few lines each: a pattern and a name.
Each needs a small picture for its card, recorded by a script as the scene loops are.

A test holds the library: every prop cuts to some blobs, stands on y = 0, loops, and fits the
limits.

## Phases

### Phase 1: edit our scenes (the epic's first issues)

The editor opens any scene from Diorama as a land and its props, lets the visitor move, add
and remove props from the library, change the light, pick a style, and export. It keeps its work
in the browser and as a file. No imports of outside files yet.

1. **Measure the two ways to draw a project.** Done (#330): props are drawn apart while editing, and
   Finish merges; numbers under "Measured" above.
2. **The project and prop formats.** `SceneProject`, `PropDoc`, a checker with `where: what`
   messages like `checkScene`, compile to actors, merge onto one grid (Finish). Pure, tested, in
   `splat-engine/project.ts`. Done in the first code PR.
3. **Lift props out of descriptions.** `splitScene` (picks of parts and bones; called `propFrom`
   above), the palette and loop fitting, and the library test. Done for the windmill and Turkey Run
   (`src/blobscape/creator/picks.ts`); the other scenes follow with the library (#334).
4. **The lighthouse as a description.** So its tower, lamp, cottage and boat can be props, and the
   scene is data like the rest. Its picture must not change (the recorded loop is the check).
5. **The first library.** The table above, with card pictures.
6. **The editor workspace.** A new page in the Modes layout on `CreatureStage`, at
   `/scene-creator/`, unlisted until the swap. Scene mode: start from a scene, see it split into land and props.
7. **Pick and arrange.** Tap to pick, drag along the ground (`groundUnder` gives the height), turn,
   size, copy, delete, undo and redo; every action reachable from the keyboard and by a screen
   reader (a list of what is in the scene, not only the picture).
8. **Props mode.** The library with search, add at the middle of the view, room left shown as the
   sandbox shows creature room today.
9. **Light mode.** Baked tier first, live sun on WebGPU, lamps, sky, air.
10. **Style and Export modes.** `useDrawnLook` and the pixel controls; the export code moved out of
    `PixelDiorama.tsx` into something both pages use.
11. **Keep it in the browser.** Autosave to IndexedDB, a list of saved projects, save and open a
    project file (`.blobscape.json`).
12. **The swap.** Scene Creator goes in the header where Sandbox was; today's sandbox moves to
    `/experiments/sandbox/` (see below); front
    page, lessons' links, Scan Studio's hand-off, the assistant tools, verify checks, docs and a
    What's New post.

Items 2 to 5 are pure and can go in parallel with 6. Item 12 is the only one a visitor sees before
it is all usable, which is why it is last.

### Phase 2: your own models as props

- A still model (.obj, .glb) goes through `meshFile` and `meshShape` and is cut like any part, so
  it takes baked light, every style and the pixel palette. It must be a closed mesh; open ones get
  a clear message and the fallback below.
- A rigged model, or one that is not closed, goes through `splatModel` (blobs scattered on the
  surface, the rig and clips kept). It has no baked light, so it is lit live.
- A rigged splat .glb of ours opens as it does on Splat Creatures, morphs included.
- Imported props are kept in the browser (IndexedDB) as "Your props", with the file's own bytes so
  a project file can carry them.
- Fit on arrival: size against the land, sit on the ground, a palette that takes its colors in.

Mostly page work: the readers exist. `splatModel` is untested on a real Blender or Mixamo file,
which is the first thing to try.

### Phase 3: your own scene, our look

"Bring your scene" means three different files, in rising order of difficulty:

1. **A description (.json).** Works today in Diorama (`readScene`). In the editor it opens as
   a project, with its bones' parts offered as props.
2. **A model of a whole scene (.glb with many meshes).** Each top-level node becomes a prop and
   what is left becomes the land. Cut unlit, so the live light and all the styles apply in full.
   This is the case that will look most like "magic", and it is honest: the geometry is real.
3. **A splat scan (.ply, .spz and the rest).** Shown as a still actor, as Scan Studio does. The
   styles that paint over a picture (gouache, oil, ink, watercolor, ASCII, pixel art) work well
   now. Live light works because the engine takes a blob's thinnest axis as its normal, but a scan
   has its old light baked into its colors, so new light is added on top of old. Taking the old
   light out is lesson 20's "divide out a guessed light", which is rough. Say so in the page; do
   not promise relighting of scans. Scan Studio's cleanup (floor, floaters, crop) is the natural
   front door for this path.

### Phase 4: save and share

- **File:** from phase 1.
- **Link:** a small project (library props only) packed into the address after `#`. That part of an
  address never reaches a server, so it shares a scene and keeps the site storing nothing.
- **Loop:** MP4 or animated PNG, from phase 1.
- **Engine:** a finished project as a rigged .glb for `@blobscape/engine` and the
  `<blobscape-creature>` tag where it fits the file's 255 bones.
- **A public gallery** needs storage and moderation, so it belongs to phase 5.

### Phase 5 (later): accounts and credits

Matt's outline: free use stays as it is, with everything in the browser. A paid account, entirely
opt-in, keeps projects and imported props on our side and across devices. Credits buy scenes
written by Claude. This is the first time the site would hold anything about anyone, so it gets its
own section.

## Accounts, payments and privacy (phase 5)

### What changes

| | Today | With accounts |
| --- | --- | --- |
| A visitor who never signs in | nothing stored, no cookies, no third parties | the same; this must stay true and be tested |
| Stored about a member | n/a | email, sign-in records, projects, uploaded models, credit balance, purchases (by reference to the payment company) |
| Other companies involved | Vercel (hosting), the SMTP provider for the contact form | plus sign-in, database and file storage, payments, Anthropic for generation |
| The CSP | the site only | `connect-src` for the backend, and only the editor needs it |

What that brings with it: a privacy policy and terms page (there is none today because there was
nothing to say), delete-my-account and download-my-data buttons that really do both, a cookie only
for people who sign in, a way to report and take down uploads if anything is ever public (models
people upload are often someone else's work), a decision on age (the simple one: accounts are for
adults), and sales tax or VAT on what is sold.

Rules worth fixing now, so the editor is built to them:

- The editor never needs an account for anything it can do in the browser. Accounts add keeping
  and generating, not features held back.
- A project file opens the same signed in or not. No lock-in.
- Private by default. Sharing is a link the member makes, and can unmake.
- No analytics or ad scripts arrive with accounts.

### Backend options

| | What it is | For | Against |
| --- | --- | --- | --- |
| **A. Supabase** | Sign-in, Postgres with per-row rules, file storage, one service | One vendor for all three; row rules mean a member can only ever read their own rows even if a query is wrong; email links or passkeys with no password to store; Matt's account already has it connected | One more company in the privacy policy; a free project sleeps when unused |
| **B. Vercel all the way** | Vercel Functions, Vercel Blob for files, a Postgres from its marketplace, a sign-in library or service on top | Stays with the host we have; functions already exist (`api/contact.ts`) | Three or four parts to join by hand; access rules live in our code, so a mistake leaks |
| **C. No accounts: your own storage** | "Save to a folder" through the browser's file access, or a file the visitor keeps in their own cloud drive | Keeps the zero-data promise whole; nothing to run | Does not work on phones or Safari well; no credits without accounts, so it only covers saving |

Recommendation: A for accounts and storage, with C's "save to a folder" offered free on desktop
anyway, because it is cheap and it is the honest answer for people who do not want an account.

Payments: a hosted checkout, so no card details ever touch the site. The real choice is who the
seller is. With Stripe, Matt is, and owes the tax filings wherever buyers live. With a merchant of
record (Paddle, Lemon Squeezy and the like), they are the seller and handle VAT and sales tax for a
larger cut. For one person selling small digital things worldwide, the merchant of record is
usually the lighter load. Worth a proper look when the time comes; no need to choose now.

### Scenes written by Claude

How it would work: a server function takes the visitor's sentence, calls the Claude API with
`docs/scene-descriptions.md` as its standing instructions, and runs the result through `checkScene`
and `reviewScene`, handing the list of faults back for another pass until it is clean or a cap is
hit. That is the loop the `pixel-scene` skill already follows by hand, so the checker and the
review are built. The key lives on the server; one in the browser could be read by anyone.

What to know before pricing it:

- A description is large (tens of kilobytes of JSON), and a good one usually takes more than one
  pass, so a scene costs real money to make. Measure the cost of twenty scenes before setting what a
  credit buys.
- Generation is the one feature that must be behind an account, with limits per member, or one
  script can spend the budget in an afternoon.
- The sentence a member types goes to Anthropic. The policy must say so, and the form should too.
- Results vary. A credit should buy a scene that passes the checks, not an attempt.
- There are already two free routes for people with their own Claude: the `pixel-scene` skill in
  this repo, and the editor's assistant tools (WebMCP) where a browser has them. Keep both, and
  give the editor's tools the new verbs (add a prop, move it, set the light).

## What happens to today's sandbox

It is linked from the header, the front page and What's New posts; every lesson ends with "open in
the sandbox", which hands the lesson's blobs over, as Scan Studio's Open in the sandbox does; and it holds real work: brushes, fill and stamp, tap to
select with SlimSAM, one photo to a scene, the camera path, the assistant tools.

Matt's call (2026-11-19): it moves as it is into the experiments. So at the swap it becomes the
experiment `/experiments/sandbox/`, still called Sandbox, with nothing changed inside it, and
`/sandbox/` (with any `?mode=`) redirects there, as the old `/creature/` and `/tools/*` addresses do.
The lessons' and Scan Studio's hand-offs point at the new address. Scene Creator lives at
`/scene-creator/` (my choice of address), so the two never share one. Later, "bring back splat building" can
mean a Sculpt mode in the editor that edits a prop's blobs with our engine, once the editor's
needs are clear, taking the brushes and the fill tool across (their arithmetic is pure and
Spark-free already).

The camera path and its MP4 are worth taking into the editor's Export mode early: a fly-through of
a scene you made is the obvious thing to share.

## Risks

- **Editing light is the hard part.** Baked light is why the scenes look as good as they do, and it
  is what would make moving things slow. The spike (#330) found that drawing props apart keeps the
  picture and makes moving free; what it has not seen is a real phone, or a scene with many props on
  a real GPU. If either is poor, the fallback is merged recuts in a worker with a coarse preview.
- **Phones.** A fine scene is near the limit already. The editor starts at Chunky detail on a
  phone, as the styles do, and Finish is where full detail is spent.
- **Scope.** Twelve issues in phase 1 is a lot. The first usable cut is items 1 to 3, 5 to 8 and
  11: open a scene, move and add props, save. Light, style and export follow in any order.
- **Checks.** A new page needs browser checks (`scripts/verify/checks/`), and the old sandbox's
  checks move with it.
- **Two formats.** Projects sit on top of descriptions. `docs/scene-descriptions.md` and the
  `pixel-scene` skill must say how the two relate, or the next scene gets written in the wrong one.

## Decisions

Matt's answers (2026-11-19):

1. **Today's sandbox** moves as it is into the experiments.
2. **The name** is Scene Creator.
3. **Both dragons** go in the library: the lava dragon from the scene and the whole zoo dragon.

Still open:

- The address `/scene-creator/`, the mode names in the table above, and "project" for a saved scene
  are mine.
- **Phase 5 at all, and when.** Nothing in phases 1 to 4 depends on it. The rules under "What
  changes" are worth agreeing to now even if accounts never come.
