# @blobscape/engine

Animated Gaussian splats for three.js: creatures on bones, scenes written as data, and pixel art drawn from them. It draws through three.js's WebGPU renderer, which falls back to WebGL 2 where a browser has no WebGPU.

It is the engine behind [blobscape.dev](https://blobscape.dev/engine/): Splat Creatures, Forest Walk, Dungeon Run, Diorama and the rest. Use it for splats that move and are made in code. For splats captured from photos (rooms, streets, big scans), use [Spark](https://sparkjs.dev); the two trade rigged `.glb` files.

> Version 0.x: the API will change between minor versions.

Guides: the [Build with the engine](https://blobscape.dev/lessons/first-creature/) lessons (a creature on bones, a scene written as data, pixel art), and the sections below. Every export: the [docs](https://blobscape.dev/engine/docs/).

## Install

```sh
npm install @blobscape/engine three
```

three.js is a peer dependency (r187).

## A creature on a canvas

```ts
import { Stage, makeFox, FOX, recordClip, Swing } from '@blobscape/engine'

const stage = await Stage.start(document.querySelector('canvas')!)
const fox = makeFox(20000)                  // 20,000 blobs on fourteen bones
const trot = FOX.moves[0]
stage.setActor(fox, recordClip(trot.name, fox.skeleton, trot.pose, trot.seconds, trot.fps))
stage.setSwing(new Swing(fox.skeleton, FOX.swing!))   // the tail swings after the trot
stage.orbit = FOX.view
```

`Stage` plays a clip or a poser (`setPoser((skeleton, seconds) => ...)`), orbits, picks bones (`pick(x, y)`), shows the bones (`setShow('both')`), and bakes sprite sheets (`bake`). Under it, `SplatWorld` is a three.js object you can add to your own scene.

## On any page, with one tag

`<blobscape-creature>` plays a rigged-splat `.glb` with no build step and no code: one script, one element.

```html
<script type="module" src="https://blobscape.dev/embed/blobscape-creature.js"></script>

<blobscape-creature src="fox.glb" move="trot" alt="A fox trotting"></blobscape-creature>
```

The script is one file with three.js inside (about 330 kB compressed). The address above always serves the newest; for a version that stays put, use the file from the package, `@blobscape/engine/blobscape-creature.js` (in `dist/`), from your own site or an npm CDN. In an app that already bundles three.js, `import '@blobscape/engine/element'` defines the same element on your copy. The script sends nothing anywhere; serving it yourself also keeps your visitors' browsers from asking blobscape.dev for it.

- `src`: the file. A creature saved from [Splat Creatures](https://blobscape.dev/experiments/creature/) or written with `writeRiggedGlb`. From another site, that site must allow it (CORS).
- `move`: the clip to play. Left out, the file's first.
- `tap`: a clip played once when the creature is tapped, or Enter is pressed on it.
- `hover`: a clip played while a mouse is over it.
- `look="pointer"`: its head turns after the pointer. The creature should face +z, and have a bone called head.
- `orbit="none"`: no turning by drag or arrow keys. On a phone a sideways drag turns it and an up or down drag scrolls the page.
- `azimuth`, `elevation`: where it is seen from, in degrees. It is framed to fit.
- `speed`: 1 is real time.
- `poster`: a still picture, shown until the creature draws and instead of it where the browser has neither WebGPU nor WebGL 2.
- `alt`: what it is, for people who can't see it.

Size it with CSS; it is a square block unless you say otherwise. Nothing is fetched until it nears the screen, it stops drawing when it leaves, and it holds still for visitors who ask for reduced motion. Anything inside the element is shown if it can't draw and has no poster. It fires `ready` (with `detail.moves`) and `error`, and `element.stage` is the `Stage` below for anything more.

## Your own creature

Shapes are distance functions on a grid of cells; every cell becomes a blob, weighted to the nearest bones so it bends.

```ts
import { sculptToCount, ellipsoid, cone, smooth, set, X, type Bone } from '@blobscape/engine'

const bones: Bone[] = [
  { name: 'body', parent: -1, head: [0, 0.5, 0], tail: [0, 0.5, 0.4] },
  { name: 'tail', parent: 0, head: [0, 0.5, -0.3], tail: [0, 0.3, -0.9] },
]
const slug = sculptToCount(() => ({
  bones,
  blend: 0.05,
  parts: [
    { shape: smooth(0.1, ellipsoid([0, 0.5, 0.05], [0.3, 0.25, 0.45]), cone([0, 0.5, -0.3], [0, 0.3, -0.9], 0.18, 0.04)),
      color: [0.9, 0.55, 0.3], bones: ['body', 'tail'] },
  ],
}), 15000)
stage.setActor(slug)
stage.setPoser((sk, t) => { set(sk, 'tail', X, 0.4 * Math.sin(t * 3)); sk.update() })
```

## A scene written as data, in pixel art

```ts
import { Stage, compileScene, buildVoxels, type SceneDoc } from '@blobscape/engine'

const doc: SceneDoc = { /* how to write one: github.com/mtblck/blobscape/blob/main/docs/scene-descriptions.md */ }
const scene = compileScene(doc)              // checks it, then makes bones, poses and lights
const stage = await Stage.start(canvas, { lights: true })
stage.setActor(buildVoxels(scene.spec(0.02)))
stage.setPoser((sk, t) => { scene.pose(sk, t); stage.setLights(scene.lights(t)) })
stage.orbit = scene.orbit
stage.setPixels(scene.look, 4)               // palette, dither, outlines, four screen pixels to one
```

## Other looks

Pixel art is one look of several. Each is a call on the stage, and turning one off is the same call with nothing.

```ts
stage.setMarks({ kind: 'gouache' })          // or 'oil', 'ink', 'hatch', 'stipple'
stage.setOutline({})                         // a pen line round things and between parts
stage.setMarks(); stage.setOutline()         // back to soft blobs
```

`setCel` (cel shading, on a stage started with `lights`), `setNeon`, `setGlass` (stained glass), `setWash` (watercolor), `setBlocks` (cubes on a grid), `setGlyphs` (the picture as characters) and `setGlitch` (bursts of broken signal over pixel art) each take their own look: see [Pixels and sprites](https://blobscape.dev/engine/docs/#part-pixels) in the reference. A look that lights the picture itself (cel shading, neon, stained glass, blocks) wants the scene cut with no light baked in: wrap the cut in `unlit(() => buildVoxels(...))`.

## Water, lava and fire in a scene

A description's `water`, `lava` and `fires` are simulated, not drawn by hand: one whole loop of each is worked out once and then shown for any moment, so a scene still plays from the time alone. Each is an actor of its own beside the scene's.

```ts
import { SceneWater, SceneFire } from '@blobscape/engine'

const pond = scene.water ? new SceneWater(scene) : undefined          // `water` or `lava` in the description
const flames = scene.fires.length ? new SceneFire(scene) : undefined  // `fires`
const extras = [...(pond ? [pond.surface] : []), ...(flames ? [flames.actor] : [])]
stage.setActor(buildVoxels(scene.spec(0.02)), undefined, extras)

const eye = [0, 1.5, 4]                      // where the camera is: reflections and glints are worked out for it
stage.setPoser((sk, t) => {
  scene.pose(sk, t)
  pond?.ride(sk, t)                          // boats and buoys rock on the water
  pond?.show(t, eye)
  if (pond) stage.reshape(pond.surface)
  flames?.show(t, eye)
  if (flames) stage.reshape(flames.actor)
  const lights = scene.lights(t)
  stage.setLights(flames ? flames.shine(lights, t) : lights)   // a fire's light is as bright as it burns
})
```

`Water`, `LavaHeat` and `Fire` are the solvers underneath, for stepping them yourself.

## Lamps, weather and the shared sky

A light, a glowing part or a swarm of specks says when it is lit (`lit: 'dark'`, `'night'`, `'day'` or `'always'`), and `litFor(doc, dark)` gives the description as it stands by day or in the dark, to compile like any other. A description's `heavens` asks for the shared moon, sun, stars and clouds in place of drawing its own.

Weather is numbers, the same for every scene. `skyState` turns a weather, a cloud cover and a wind into a `SkyState`; `SkyEase` mixes from one to the next, so a storm comes on without cutting the scene again.

```ts
import { skyState, SkyEase, lightUnder, windAt, lightningAt } from '@blobscape/engine'

const sky = new SkyEase()
sky.set(skyState('thunderstorm'), performance.now() / 1000)

stage.setPoser((sk, t) => {
  const now = sky.at(performance.now() / 1000)
  scene.pose(sk, t)
  scene.blow(sk, t, windAt(now, t, scene.loop))        // what falls slants, what sways leans
  sk.update()
  const flash = now.lightning * lightningAt(t, scene.loop)
  stage.setLights(scene.lights(t), lightUnder(now, flash))
})
```

`SceneWeather` is the rain, snow, clouds and lying snow for one scene, made once and then posed by the time and the sky of the moment:

```ts
import { SceneWeather, timeOf, litFor } from '@blobscape/engine'

const weather = new SceneWeather({ loop: scene.loop, view: scene.orbit, ground: scene.ground })
stage.setActor(buildVoxels(scene.spec(0.02)), undefined, weather.actors)
// in the poser, after the scene's own pose:
//   weather.pose(t, now)
//   if (weather.shade(now)) stage.reshape(weather.actors[0])     // clouds as gray as the sky

const night = timeOf('night')                // a time of day: its sky, its light, whether lamps are lit
const byNight = compileScene(litFor({ ...doc, sky: night.sky }, night.dark))
stage.setLights(byNight.lights(0), night.light)
```

Underneath are `weatherDocs` and `showWeather` (the three small descriptions and the share of them a sky shows), `skyUnder` and `hazeUnder` (the sky's colors and the haze), `makeSnowCover` and `pileSnow` (the snow that lies), and `paletteUnder` and `paletteAt` (a pixel palette under a sky or a time of day). `WEATHERS`, `CLOUD_COVERS`, `WINDS` and `TIMES` list what there is.

## Styles as data

Every style's settings are written once, as data: `CATALOG` holds each one's name, limits, choices and where it starts, so a page can draw its controls from the list, read them from an address and keep them, and every page draws a style the same way. `STYLES` lists the styles; each look has a function from its settings to what the stage takes.

```ts
import { STYLES, CATALOG, drawnStart, shownSettings, lightsItself, celLook, neonLook, washLook } from '@blobscape/engine'

const settings = drawnStart(new URLSearchParams(location.search))    // every look as it starts, with what the address asks
for (const s of shownSettings(CATALOG.neon, settings.neon, { style: 'neon' })) console.log(s.label, s.kind)   // what to draw controls for

stage.setNeon(neonLook(settings.neon, scene.loop))                   // its light runs a whole number of times a loop
stage.setNeon(); stage.setWash(washLook(settings.watercolor))
lightsItself('cel')                          // true: cut the scene with `unlit` first, on a stage started with `lights`
const cel = settings.cel
stage.setCel(celLook({ ...cel, line: cel.outline ? cel.pen : 0 }))
console.log(STYLES.map((s) => s.label))                              // every style there is
```

## A scene from a land and props

A scene can be put together instead of written whole: a `SceneProject` names a land and props and says where each stands, and `composeScene` makes one ordinary description of it. Fix a prop and every scene that sets it down has the fix.

```ts
import { composeScene, splitScene, markedPicks, compileScene, type SceneProject } from '@blobscape/engine'

// any description whose bones are marked `prop: 'Name'` splits into its land and its props
const { land, props } = splitScene(doc, markedPicks(doc))
const lantern = props[0]

const project: SceneProject = {
  kind: 'blobscape-project', version: 1, name: 'Two lanterns', loop: doc.loop, land,
  props: [
    { prop: lantern, at: [-0.6, 0, 0], turn: 0, size: 1 },
    { prop: lantern, at: [0.6, 0, 0.2], turn: 90, size: 0.8, phase: 0.5 },
  ],
}
const both = compileScene(composeScene(project, () => undefined))
```

Props and lands carry `tags` from one fixed list (`TAGS`): what a thing is, for search, and how it behaves, which the shared recipes act on (a `leafy` prop drops leaves, one that `floats` rides the water). `compileProject` compiles a project apart, a piece at a time, which is what an editor wants.

## Files

`writeRiggedGlb` saves blobs, bones and clips as a `.glb`: the KHR_gaussian_splatting standard plus ordinary glTF skins and animation, and a small extension for how a skinned blob turns ([the rule](https://blobscape.dev/engine/rigged-splats/)). `readRiggedGlb` opens one. Blender and game engines open the bones and clips; three.js's own loader shows the blobs standing still.

## License

MIT
