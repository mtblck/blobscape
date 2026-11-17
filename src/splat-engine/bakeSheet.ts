import * as THREE from 'three/webgpu'
import { readbackToSrgb } from '../splat-core/color.ts'
import type { Frame } from '../splat-core/pixel.ts'
import { baseline, processFrames } from '../splat-to-sprite/sheet.ts'
import { sampleClip, type Clip } from './glb.ts'
import type { Skeleton } from './rig.ts'
import { frameAll, frameTimes, planSheet, type Framing, type SheetMove, type SheetPlan } from './spriteSheet.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import type { Skin } from './rig.ts'

/**
 * Draws a rigged creature's moves from 4 or 8 sides and turns each frame into
 * pixel art with Splat to Sprite's pipeline (render big, average down, cut the
 * alpha, one palette for the whole sheet, tidy, outline).
 *
 * The camera circles the creature (which faces +Z) with a narrow lens from far
 * off, so the sprite is close to orthographic, and stays at one distance for
 * every frame, so the creature is the same size in all of them.
 */
export interface BakeTarget {
  renderer: THREE.WebGPURenderer
  /** A scene holding only what should be in the sprite (the creature's SplatWorld). */
  scene: THREE.Scene
  actor: { blobs: Blobs; skin: Skin; skeleton: Skeleton }
  /** Tells the world its skeleton (and, after `morph`, its blobs) moved. */
  posed: () => void
  /** Reshapes the actor's blobs by a clip's morph weights at a time, on the CPU, for an actor with morphs. */
  morph?: (clip: Clip | undefined, t: number) => void
}

export interface BakeOptions {
  directions: 4 | 8
  size: number
  colors: number
  outline: boolean
}

export interface BakedSheet {
  plan: SheetPlan
  frames: Frame[]
  size: number
  /** Where the feet are: one past the lowest solid row of any frame. */
  anchorY: number
  framing: Framing
  png: () => Promise<Blob>
}

const SUPERSAMPLE = 4
const LENS = 10
const ELEVATION = 28

export async function bakeSheet(t: BakeTarget, moves: SheetMove[], o: BakeOptions, progress?: (done: number, total: number) => void): Promise<BakedSheet> {
  const plan = planSheet(moves, o.directions)
  const framing = frameAll(t.actor, moves, undefined, t.morph)
  const big = o.size * SUPERSAMPLE
  const { renderer, scene, actor } = t
  const camera = new THREE.PerspectiveCamera(LENS, 1, 0.1, 1000)
  const dist = (framing.radius * 1.04) / Math.sin(((LENS / 2) * Math.PI) / 180)
  camera.near = Math.max(0.01, dist - framing.radius * 2)
  camera.far = dist + framing.radius * 2
  camera.updateProjectionMatrix()
  const aim = new THREE.Vector3(...framing.center)
  const target = new THREE.RenderTarget(big, big)
  const webgl = (renderer.backend as unknown as { isWebGLBackend?: boolean }).isWebGLBackend === true
  const prevTarget = renderer.getRenderTarget()
  const prevClear = renderer.getClearAlpha()
  renderer.setClearAlpha(0)

  const raws: Uint8Array[] = []
  const total = plan.rows.reduce((s, r) => s + r.move.frames, 0)
  const el = (ELEVATION * Math.PI) / 180
  try {
    for (const row of plan.rows) {
      const az = (row.turn * Math.PI) / 180
      camera.position.set(aim.x + dist * Math.cos(el) * Math.sin(az), aim.y + dist * Math.sin(el), aim.z + dist * Math.cos(el) * Math.cos(az))
      camera.lookAt(aim)
      camera.updateMatrixWorld()
      for (const time of row.move.clip ? frameTimes(row.move) : [0]) {
        if (row.move.clip) sampleClip(row.move.clip, actor.skeleton, time)
        else { actor.skeleton.reset(); actor.skeleton.update() }
        t.morph?.(row.move.clip, time)
        t.posed()
        renderer.setRenderTarget(target)
        renderer.clear()
        renderer.render(scene, camera)
        const px = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, big, big)) as Uint8Array
        // the pixel pipeline wants sRGB, still premultiplied, rows bottom-up as WebGL reads them
        raws.push(new Uint8Array(readbackToSrgb(px, big, big, { flip: !webgl, premultiplied: true }).buffer))
        progress?.(raws.length, total)
      }
    }
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.setClearAlpha(prevClear)
    target.dispose()
  }

  const frames = processFrames(raws, {
    size: o.size, supersample: SUPERSAMPLE, alphaCut: 0.5, palette: 'auto', autoColors: o.colors, dither: 0, strays: true, outline: o.outline ? 'darkest' : 'none',
  }, true).map((s) => s.final)
  const anchorY = Math.max(...frames.map(baseline))
  const size = o.size

  return {
    plan, frames, size, anchorY, framing,
    png: () => new Promise<Blob>((resolve, reject) => {
      const c = document.createElement('canvas')
      c.width = plan.cols * size
      c.height = plan.rows.length * size
      const ctx = c.getContext('2d')!
      let k = 0
      plan.rows.forEach((row, r) => {
        for (let col = 0; col < row.move.frames; col++) {
          const f = frames[k++]
          ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), size, size), col * size, r * size)
        }
      })
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the PNG'))), 'image/png')
    }),
  }
}
