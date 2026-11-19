import * as THREE from 'three/webgpu'
import { readbackToSrgb } from '../splat-core/color.ts'
import type { Frame } from '../splat-core/pixel.ts'
import { baseline, processFrames } from '../splat-to-sprite/sheet.ts'
import { sampleClip, type Clip } from './glb.ts'
import type { Skeleton } from './rig.ts'
import { frameAll, frameTimes, planSheet, type Framing, type SheetMove, type SheetPlan } from './spriteSheet.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import type { Skin } from './rig.ts'
import { SplatDepth } from './depth.ts'
import { depthImage, normalMap, shrinkDepth } from './spriteMaps.ts'

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
  /** The renderer to draw with. */
  renderer: THREE.WebGPURenderer
  /** A scene holding only what should be in the sprite (the creature's SplatWorld). */
  scene: THREE.Scene
  /** The creature being drawn. */
  actor: { blobs: Blobs; skin: Skin; skeleton: Skeleton }
  /** Tells the world its skeleton (and, after `morph`, its blobs) moved. */
  posed: () => void
  /** Reshapes the actor's blobs by a clip's morph weights at a time, on the CPU, for an actor with morphs. */
  morph?: (clip: Clip | undefined, t: number) => void
}

/** How a sprite sheet is baked. */
export interface BakeOptions {
  /** Directions each move is drawn from. */
  directions: 4 | 8
  /** A frame's width and height, in pixels. */
  size: number
  /** Colors in the palette. */
  colors: number
  /** Whether each sprite gets a dark outline. */
  outline: boolean
  /** Bake a normal map and a depth map beside the sheet, frame for frame (`BakedSheet.normals`, `depths`), for a game that lights its sprites. */
  maps?: boolean
}

/** A baked sprite sheet: its frames and how they are laid out. */
export interface BakedSheet {
  /** The rows and columns. */
  plan: SheetPlan
  /** Every frame, row by row. */
  frames: Frame[]
  /** A frame's width and height, in pixels. */
  size: number
  /** Where the feet are: one past the lowest solid row of any frame. */
  anchorY: number
  /** The sphere the camera was fitted to. */
  framing: Framing
  /** The whole sheet as one PNG. */
  png: () => Promise<Blob>
  /** With `BakeOptions.maps`: each frame's facing as a normal map (x right, y up, z toward the viewer; spriteMaps.ts). */
  normals?: Frame[]
  /** With `BakeOptions.maps`: each frame's depth, white nearest and black furthest across the creature's framing. */
  depths?: Frame[]
  /** The normal or depth maps laid out as the sheet is, as one PNG. */
  mapPng?: (which: 'normals' | 'depths') => Promise<Blob>
}

/** Frames laid out row by row as the plan says, as one PNG. */
function sheetPng(plan: SheetPlan, frames: Frame[], size: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
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
  })
}

const SUPERSAMPLE = 4
const LENS = 10
const ELEVATION = 28

/**
 * Draws every frame of every move from each direction, all at one camera distance, and turns them into pixel art.
 * `progress` is called as frames are done.
 */
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
  const depthMaps: Float32Array[] = []
  const depth = o.maps ? new SplatDepth(big, big) : undefined
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
        if (depth) {
          // the same moved and sorted blobs, once more as distances (rows from the top, as the shrunk frames are)
          depth.render(renderer, scene, camera)
          depthMaps.push((await depth.read(renderer)).depth)
        }
        progress?.(raws.length, total)
      }
    }
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.setClearAlpha(prevClear)
    target.dispose()
    depth?.dispose()
  }

  const frames = processFrames(raws, {
    size: o.size, supersample: SUPERSAMPLE, alphaCut: 0.5, palette: 'auto', autoColors: o.colors, dither: 0, strays: true, outline: o.outline ? 'darkest' : 'none',
  }, true).map((s) => s.final)
  const anchorY = Math.max(...frames.map(baseline))
  const size = o.size

  let normals: Frame[] | undefined, depths: Frame[] | undefined
  if (o.maps) {
    // one sprite pixel's width at the creature: the lens is narrow and far off, so one width does for all
    const pixel = (2 * dist * Math.tan(((LENS / 2) * Math.PI) / 180)) / size
    const shrunk = frames.map((f, i) => shrinkDepth(depthMaps[i], big, SUPERSAMPLE, f))
    normals = shrunk.map((d) => normalMap(d, size, pixel))
    depths = shrunk.map((d) => depthImage(d, size, dist - framing.radius, dist + framing.radius))
  }

  return {
    plan, frames, size, anchorY, framing, normals, depths,
    png: () => sheetPng(plan, frames, size),
    mapPng: normals && depths ? (which) => sheetPng(plan, which === 'normals' ? normals! : depths!, size) : undefined,
  }
}
