---
name: pixel-scene
description: Write or change a Pixel Diorama scene (a SceneDoc description) from a sentence, check it without the site, look at it as pixel art, and add it to the site. Use when asked for a new pixel scene, a change to one, or why one looks wrong.
---

# Writing a pixel scene

A scene is data alone: shapes, paints, bones and moves in one `SceneDoc` object. You write it, a tool tells you what is wrong, another draws it, and you fix what you see. Do not skip the looking: a scene that passes every check can still be a dull picture.

## Read first

1. `docs/scene-descriptions.md`: every field, shape and paint, the fourteen rules that make a scene work, and the habits of a showpiece. Read all of it once.
2. The type: `src/splat-engine/sceneDoc.ts` down to the end of `LightDoc`. Every field has a comment.
3. One scene close to what is asked. `npm run scene -- --list` names them with what is in each; `npm run scene -- --example campfire` prints one as JSON. `campfire` is the plainest, `dragon` a showpiece built from many small parts, `windmill` a thing that turns, `ruin`, `cave`, `canyon` and `cabin` use the built things, formations, worn land and weather, `koi` has real water (`water`: rain that rings it and fish that push wakes), and `turkey` has figures that run on the spot while the road goes by (`pass` moves).

## The loop

Work in a scratch folder (`scratch/` is git-ignored), on a `.json` file. The checker also takes a `.ts` or `.mjs` module, which it runs: only hand it one you wrote.

1. **Plan in words before shapes.** One subject that fills the scene, where the light comes from, what moves, and the palette: a dark ramp for the setting, a ramp of three or four steps for each main hue, two or three warm steps kept for light sources. Write the palette first and paint only in its colors.
   If the scene tells a story (someone arrives, does a thing once, leaves), give each move a `during: [from, to]` and plan the moments of the loop first; the white witch scene (`henge`) is the example. The checker's pictures are taken at 10% and 60% of the loop, so put something worth seeing there or draw other moments yourself.
2. **Build it from components.** A scene is its land plus things, each a prop on its own marked bone (rule 13), never one piece made as a whole. List the things first. For each, look in the Scene Creator library (`src/blobscape/creator/library.ts`; `LIBRARY` names every prop and the scene it came from): reuse what is there by copying its parts from that scene, and make only what is missing, which then joins the library by its mark. Then **say when every light is lit** (rule 14): every entry in `lights`, and every glowing part or swarm of specks that belongs to a lamp, takes `lit: 'dark'` (lamp, lantern, candle, lit window, campfire, embers), `'night'` (moon, stars, moonlight, fireflies), `'day'` (a sun) or `'always'` (magic, lava, crystals), and a part says what it is while not lit with `unlit` (a color, or `'gone'` for a flame or a star). In a cave, dungeon or room, still write `lit: 'dark'` and set the scene's `lamps: 'always'`. Never leave a light without `lit`: a test fails, and the checker says so as a `look` line. Take a moon, sun, stars or clouds from the shared sky with `heavens` (rule 15), not as parts, unless the scene wants a sky the recipes don't make (an eclipse, a red sun, three moons).
3. **Write the description.** Block the big shapes first (ground, the subject's body), check, look, and only then add the small parts. Sixty to ninety parts make a full scene.
4. **Check it:** `npm run scene -- scratch/my-scene.json`. It takes a second or two. Every `fix` line is `where: what` and must go; `look` lines are advice. It ends with status 1 while anything must be fixed. It tells you about:
   - mistakes in the description, with the field (`parts[12].shape.r: must be a number`)
   - parts that caught no blobs (swallowed by a cut, or inside another part on the same bone)
   - a palette that reads as one tone in grayscale, or too much colorless gray
   - a move that snaps at the loop's seam
   - a light that does not say when it is lit, a lamp whose light goes out while its glass still glows, and anything standing outside every prop (`look` lines, but the site's tests fail on each for a new scene)
   - a part that passes through another as the scene plays (`parts[40] (box on bone 'sails'): passes through parts[3] (cylinder) at 3.00 s`). Move it clear or make its swing smaller. Mark a part `touches: true` only when the two are meant to meet, like foam round a buoy.
5. **Look at it:** `npm run scene -- scratch/my-scene.json --shots scratch/shots` (needs `npm run build` once; about half a minute). It writes `front.png`, `above.png`, `close.png` and `later.png` (the front again, later in the loop). Open them and be hard on them:
   - Does the subject read at a glance, as a silhouette? Is it big enough in the frame?
   - Is there a clear lightest and darkest place, or is it all one middle tone?
   - Did shade snap to a color from another hue (green going brown)? Add a darker step of that hue to the palette.
   - Is a big surface flat and empty? Give it a textured paint or scatter small things on it.
   - Between `front` and `later`, did what should move, move?
6. **Fix one thing at a time** and run both again. Small changes are small edits. When stuck on the look, write three different takes on the weak part and keep the best.

The same file opens on the site itself: Pixel Diorama, Scene tab, Open a file. There it plays, the view orbits, and How it's made steps through how it was cut. That is the way to show it to a person before it is in the site.

## Adding it to the site

1. Save it as `src/blobscape/diorama/scenes/<id>.ts`, exporting the object typed `SceneDoc`, with a comment on top saying what is in the picture.
2. Add it to `DIORAMAS` in `src/blobscape/diorama/scenes.ts` with `described(id, DOC, 'what is in the picture')`.
3. Mark each distinct thing as a prop: put it on a bone of its own at the point it stands on, with `prop: 'Its name'` (rule 13 in `docs/scene-descriptions.md`). Scene Creator splits the scene by these marks; `library.test.ts` fails for a new scene with any part on a bone outside a prop, any light outside a prop's box, or a prop missing from the library, and `scenes.test.ts` fails for a light with no `lit` (rule 14). Then `npm run build` and `npm run props` record each prop's card picture.
4. Record its loop (`scripts/record-loops.mjs`, see CLAUDE.md) and list it in `diorama/loops.ts`; `loops.test.ts` fails until both exist.
5. `npm test`, then `npm run check`. Add a file to `changes/` with a line for the changelog (`changes/README.md`).

## Scene Creator projects are not descriptions

A visitor's Scene Creator project (`.blobscape.json`, `SceneProject` in `splat-engine/project.ts`) only places library props on a library land, each cut from a description by its `prop` marks. If someone asks for a scene and hands you a project, or wants one of your scenes usable there, the work is still a description: write it, mark its props, add it to the site (above), and its props join the library.

## When the description can't say it

A new shape, paint or move needs a case in the type, the checker and the builder in `sceneDoc.ts`, a test, and a line in `docs/scene-descriptions.md`. Ask before adding one: most things can be built from what is there (see "What it can't do yet" in the guide).
