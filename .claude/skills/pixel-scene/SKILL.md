---
name: pixel-scene
description: Write or change a Pixel Diorama scene (a SceneDoc description) from a sentence, check it without the site, look at it as pixel art, and add it to the site. Use when asked for a new pixel scene, a change to one, or why one looks wrong.
---

# Writing a pixel scene

A scene is data alone: shapes, paints, bones and moves in one `SceneDoc` object. You write it, a tool tells you what is wrong, another draws it, and you fix what you see. Do not skip the looking: a scene that passes every check can still be a dull picture.

## Read first

1. `docs/scene-descriptions.md`: every field, shape and paint, the twelve rules that make a scene work, and the habits of a showpiece. Read all of it once.
2. The type: `src/splat-engine/sceneDoc.ts` down to the end of `LightDoc`. Every field has a comment.
3. One scene close to what is asked. `npm run scene -- --list` names them with what is in each; `npm run scene -- --example campfire` prints one as JSON. `campfire` is the plainest, `dragon` a showpiece built from many small parts, `windmill` a thing that turns, `ruin`, `cave`, `canyon` and `cabin` use the built things, formations, worn land and weather.

## The loop

Work in a scratch folder (`scratch/` is git-ignored), on a `.json` file.

1. **Plan in words before shapes.** One subject that fills the scene, where the light comes from, what moves, and the palette: a dark ramp for the setting, a ramp of three or four steps for each main hue, two or three warm steps kept for light sources. Write the palette first and paint only in its colors.
2. **Write the description.** Block the big shapes first (ground, the subject's body), check, look, and only then add the small parts. Sixty to ninety parts make a full scene.
3. **Check it:** `npm run scene -- scratch/my-scene.json`. It takes a second or two. Every `fix` line is `where: what` and must go; `look` lines are advice. It ends with status 1 while anything must be fixed. It tells you about:
   - mistakes in the description, with the field (`parts[12].shape.r: must be a number`)
   - parts that caught no blobs (swallowed by a cut, or inside another part on the same bone)
   - a palette that reads as one tone in grayscale, or too much colorless gray
   - a move that snaps at the loop's seam
   - a part that passes through another as the scene plays (`parts[40] (box on bone 'sails'): passes through parts[3] (cylinder) at 3.00 s`). Move it clear or make its swing smaller. Mark a part `touches: true` only when the two are meant to meet, like foam round a buoy.
4. **Look at it:** `npm run scene -- scratch/my-scene.json --shots scratch/shots` (needs `npm run build` once; about half a minute). It writes `front.png`, `above.png`, `close.png` and `later.png` (the front again, later in the loop). Open them and be hard on them:
   - Does the subject read at a glance, as a silhouette? Is it big enough in the frame?
   - Is there a clear lightest and darkest place, or is it all one middle tone?
   - Did shade snap to a color from another hue (green going brown)? Add a darker step of that hue to the palette.
   - Is a big surface flat and empty? Give it a textured paint or scatter small things on it.
   - Between `front` and `later`, did what should move, move?
5. **Fix one thing at a time** and run both again. Small changes are small edits. When stuck on the look, write three different takes on the weak part and keep the best.

The same file opens on the site itself: Pixel Diorama, Scene tab, Open a file. There it plays, the view orbits, and How it's made steps through how it was cut. That is the way to show it to a person before it is in the site.

## Adding it to the site

1. Save it as `src/blobscape/diorama/scenes/<id>.ts`, exporting the object typed `SceneDoc`, with a comment on top saying what is in the picture.
2. Add it to `DIORAMAS` in `src/blobscape/diorama/scenes.ts` with `described(id, DOC, 'what is in the picture')`.
3. Record its loop (`scripts/record-loops.mjs`, see CLAUDE.md) and list it in `diorama/loops.ts`; `loops.test.ts` fails until both exist.
4. `npm test`, then `npm run check`. Add a line to `CHANGELOG.md` under `[Unreleased]`.

## When the description can't say it

A new shape, paint or move needs a case in the type, the checker and the builder in `sceneDoc.ts`, a test, and a line in `docs/scene-descriptions.md`. Ask before adding one: most things can be built from what is there (see "What it can't do yet" in the guide).
