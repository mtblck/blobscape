# @blobscape/engine

Animated Gaussian splats for three.js: creatures on bones, scenes written as data, and pixel art drawn from them. It draws through three.js's WebGPU renderer, which falls back to WebGL 2 where a browser has no WebGPU.

It is the engine behind [blobscape.dev](https://blobscape.dev/engine/): Splat Creatures, Forest Walk, Dungeon Run, Pixel Diorama and the rest. Use it for splats that move and are made in code. For splats captured from photos (rooms, streets, big scans), use [Spark](https://sparkjs.dev); the two trade rigged `.glb` files.

> Version 0.x: the API will change between minor versions.

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

const doc: SceneDoc = { /* see docs/scene-descriptions.md */ }
const scene = compileScene(doc)              // checks it, then makes bones, poses and lights
const stage = await Stage.start(canvas, { lights: true })
stage.setActor(buildVoxels(scene.spec(0.02)))
stage.setPoser((sk, t) => { scene.pose(sk, t); stage.setLights(scene.lights(t)) })
stage.orbit = scene.orbit
stage.setPixels(scene.look, 4)               // palette, dither, outlines, four screen pixels to one
```

## Files

`writeRiggedGlb` saves blobs, bones and clips as a `.glb`: the KHR_gaussian_splatting standard plus ordinary glTF skins and animation, and a small extension for how a skinned blob turns ([the rule](https://blobscape.dev/engine/rigged-splats/)). `readRiggedGlb` opens one. Blender and game engines open the bones and clips; three.js's own loader shows the blobs standing still.

## License

MIT
