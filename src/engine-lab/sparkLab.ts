import * as THREE from 'three'
import { ExtSplats, PackedSplats, SparkRenderer, SplatMesh, SplatSkinning, SplatSkinningMode } from '@sparkjsdev/spark'
import { placeCamera, type Orbit } from '../splat-core/view.ts'
import { makeCreature, poseWalk, type Creature } from '../splat-engine/creature.ts'
import type { SkinMode } from '../splat-engine/rig.ts'
import { poseSpark, restAtOrigin, setSplatBones } from '../splat-engine/three/spark.ts'
import type { BenchResult, Lab, LabOptions, StepTimes } from './lab.ts'

/**
 * The same fox, the same bones and the same trot, drawn and skinned by Spark
 * 2.4's own `SplatSkinning`, so the lab can time the two side by side.
 *
 * "Turn blobs" maps to Spark's dual quaternions (its default) and "Blend
 * matrices" to its linear blend, which needs covariance splats. Changing it
 * rebuilds the meshes. Each fox is its own SplatMesh with its own skinning;
 * Spark gathers every mesh into one list and sorts them together, in a worker,
 * a frame or more behind.
 *
 * Spark draws through three.js's WebGLRenderer, so it's always WebGL here.
 */
export async function startSparkLab(display: HTMLCanvasElement, o: LabOptions): Promise<Lab> {
  const canvas = o.offscreen ? document.createElement('canvas') : display
  const linear = o.mode === 'linear'
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: !!o.offscreen })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setClearColor(0x000000, 0)
  const spark = new SparkRenderer({ renderer, covSplats: linear, accumExtSplats: linear })
  const scene = new THREE.Scene()
  scene.add(spark)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
  const floor = new THREE.GridHelper(8, 16, 0x777777, 0x444444)
  floor.renderOrder = -1
  scene.add(floor)

  let orbit: Orbit = { target: [0, 0.75, 0], distance: o.herd > 1 ? 7 : 4, azimuth: 35, elevation: 14 }
  const herd = Math.max(1, o.herd)
  const foxes: { fox: Creature; mesh: SplatMesh; skin: SplatSkinning }[] = []
  for (let k = 0; k < herd; k++) {
    const fox = makeCreature(Math.round(o.count / herd), 7 + k)
    const x = (k - (herd - 1) / 2) * 0.8, z = (k % 2) * 0.6 - 0.3
    fox.skeleton.place.set([x, 0, z])
    fox.skeleton.update()
    const b = fox.blobs
    // linear blend works on covariance splats, which Spark keeps only in its extended (ExtSplats) store
    const store = linear ? new ExtSplats({ maxSplats: b.count }) : new PackedSplats({ maxSplats: b.count })
    const c = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), col = new THREE.Color()
    for (let i = 0; i < b.count; i++) {
      c.fromArray(b.center, i * 3)
      s.fromArray(b.scale, i * 3)
      q.fromArray(b.quat, i * 4)
      col.setRGB(b.color[i * 3], b.color[i * 3 + 1], b.color[i * 3 + 2])
      store.setSplat(i, c, s, q, b.opacity[i], col)
    }
    let mesh: SplatMesh
    if (store instanceof ExtSplats) {
      // ExtSplats uploads its arrays only when it's made from them
      mesh = new SplatMesh({ extSplats: new ExtSplats({ extArrays: store.extArrays, numSplats: b.count }), covSplats: true })
    } else {
      store.numSplats = b.count
      store.needsUpdate = true
      mesh = new SplatMesh({ packedSplats: store })
    }
    await mesh.initialized
    const skin = new SplatSkinning({ mesh, numSplats: b.count, numBones: fox.skeleton.count, mode: linear ? SplatSkinningMode.LINEAR_BLEND : SplatSkinningMode.DUAL_QUATERNION })
    restAtOrigin(skin, fox.skeleton.count)
    setSplatBones(skin, fox.skin, b.count)
    skin.skinTexture.needsUpdate = true
    mesh.skinning = skin
    mesh.updateGenerator()
    poseSpark(skin, fox.skeleton)
    scene.add(mesh)
    foxes.push({ fox, mesh, skin })
  }
  const blobs = foxes.reduce((n, f) => n + f.fox.blobs.count, 0)
  const gl = renderer.getContext()

  let walk = o.walk
  let lastW = 0, lastH = 0
  const resize = () => {
    const w = display.clientWidth, h = display.clientHeight
    if (w && h && (w !== lastW || h !== lastH)) {
      renderer.setSize(w, h, false)
      lastW = w; lastH = h
      if (o.offscreen) { display.width = canvas.width; display.height = canvas.height }
    }
    placeCamera(camera as never, orbit, h > 0 ? w / h : 1)
  }
  const pose = (t: number) => {
    for (const f of foxes) {
      if (walk) poseWalk(f.fox.skeleton, t + f.fox.skeleton.place[0])
      else { f.fox.skeleton.reset(); f.fox.skeleton.update() }
      poseSpark(f.skin, f.fox.skeleton)
    }
  }
  /** Waits for the GPU: reading one pixel back can't finish before the frame does. */
  const settle = () => { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) }
  const draw = (t: number) => { resize(); pose(t); renderer.render(scene, camera) }
  /** One frame, waited for: what `bench` and `profile` time. Spark's sort carries on in its worker. */
  const once = (t: number) => { draw(t); settle() }
  const frame = async (t: number) => {
    draw(t)
    // Headless runs show each frame once: let Spark's worker sort catch up first, as the live view does over the next frames.
    for (let k = 0; o.offscreen && k < 100 && (spark.sorting || spark.sortDirty || spark.dirty); k++) {
      await new Promise((r) => setTimeout(r, 10))
      renderer.render(scene, camera)
    }
    settle()
    if (o.offscreen) display.getContext('2d', { willReadFrequently: true })!.drawImage(canvas, 0, 0)
  }

  let raf = 0, stopped = false, busy = 0
  const t0 = performance.now()
  let onTick: ((now: number) => void) | undefined
  let cancelRun: (() => void) | undefined
  const tick = (now: number) => {
    if (stopped) return
    onTick?.(now)
    if (!o.offscreen && !busy) draw(walk ? (performance.now() - t0) / 1000 : 0)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const q = (a: number[], p: number) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0

  return {
    info: `Spark 2.4 (${linear ? 'linear blend' : 'dual quaternions'}) · webgl · ${blobs.toLocaleString()} blobs`,
    renderer: undefined,
    get orbit() { return orbit },
    set orbit(v: Orbit) { orbit = v },
    setWalk(on) { walk = on; pose(0) },
    setMode(_m: SkinMode) { /* rebuilt by the page: Spark's two modes need different meshes */ },
    frame,
    async exclusive(job) { busy++; try { return await job() } finally { busy-- } },
    async bench(frames): Promise<BenchResult> {
      const gaps: number[] = [], alone: number[] = []
      if (!o.offscreen) {
        await new Promise<void>((done, fail) => {
          cancelRun = () => fail(new Error('the lab was closed'))
          let last = 0, skip = 10
          onTick = (now) => {
            if (skip-- > 0) { last = now; return }
            gaps.push(now - last)
            last = now
            if (gaps.length >= frames) { onTick = cancelRun = undefined; done() }
          }
        })
      }
      busy++
      try {
        for (let i = 0; i < 3; i++) await frame(i / 30)
        for (let i = 0; i < Math.min(frames, 30); i++) {
          const s = performance.now()
          once((i + 3) / 30)
          alone.push(performance.now() - s)
        }
      } finally {
        busy--
      }
      const refresh = gaps.length ? Math.max(4, Math.min(1000 / 60, ...gaps)) : 0
      const span = gaps.reduce((a, b) => a + b, 0)
      return {
        which: 'spark', moving: walk, backend: 'webgl', blobs, frames: gaps.length || alone.length,
        median: q(gaps, 0.5), p90: q(gaps, 0.9),
        fps: span ? (gaps.length * 1000) / span : 0,
        dropped: gaps.length ? gaps.filter((g) => g > refresh * 1.5).length / gaps.length : 0,
        alone: q(alone, 0.5), cpu: 0, width: canvas.width, height: canvas.height,
      }
    },
    async profile(frames): Promise<StepTimes> {
      // Spark's steps (generate, sort in a worker, draw) aren't separable from outside; report the whole frame as drawing.
      const t: number[] = []
      busy++
      try {
        for (let i = 0; i < frames + 2; i++) {
          const s = performance.now()
          once(i / 30)
          if (i >= 2) t.push(performance.now() - s)
        }
      } finally {
        busy--
      }
      return { which: 'spark', backend: 'webgl', blobs, deform: 0, project: 0, order: 0, draw: q(t, 0.5), cpuSkin: 0, cpuSort: 0 }
    },
    dispose() {
      stopped = true
      onTick = undefined
      cancelRun?.()
      cancelAnimationFrame(raf)
      for (const f of foxes) { f.mesh.dispose(); f.skin.skinTexture.dispose(); f.skin.boneTexture.dispose() }
      spark.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
