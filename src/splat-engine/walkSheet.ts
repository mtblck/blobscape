import * as THREE from 'three/webgpu'
import { alphaCut, autoPalette, darkest, downsample, outline, removeStrays, quantize, type Frame, type Rgb } from '../splat-core/pixel.ts'
import { readbackToSrgb } from '../splat-core/colour.ts'
import { SplatWorld } from './engine.ts'
import { makeCreature, poseWalk, type Creature } from './creature.ts'

/**
 * Splats to pixels, with motion: the fox's trot rendered from four sides,
 * a few frames per stride, through Splat to Sprite's pixel pipeline, packed
 * as a Tinkerkit sheet with one walk animation per direction.
 *
 * Rows follow Tinkerkit: down, left, right, up. The camera circles the fox
 * (which faces +Z) with a narrow lens from far away, so the sprite is close to
 * orthographic without leaving the perspective maths the splats are drawn with.
 */
export interface WalkSheet {
  frames: Frame[]
  cols: number
  rows: number
  size: number
  png: () => Promise<Blob>
  json: (image: string) => object
}

const DIRS = [['down', 0], ['left', 90], ['right', -90], ['up', 180]] as const
const STRIDE = 1 / 1.4
const SUPERSAMPLE = 4

/** One fox and its world per renderer, kept between sheets so their GPU buffers are made once. */
const stages = new WeakMap<object, { fox: Creature; world: SplatWorld; scene: THREE.Scene }>()

export async function makeWalkSheet(renderer: THREE.WebGPURenderer, opts: { size?: number; frames?: number; colours?: number } = {}): Promise<WalkSheet> {
  const size = opts.size ?? 48
  const n = opts.frames ?? 8
  const big = size * SUPERSAMPLE

  let stage = stages.get(renderer)
  if (!stage) {
    const fox = makeCreature(20000)
    const world = new SplatWorld([fox])
    const scene = new THREE.Scene()
    scene.add(world)
    stage = { fox, world, scene }
    stages.set(renderer, stage)
  }
  const { fox, world, scene } = stage
  const camera = new THREE.PerspectiveCamera(10, 1, 1, 40)
  const target = new THREE.RenderTarget(big, big)
  const webgl = (renderer.backend as unknown as { isWebGLBackend?: boolean }).isWebGLBackend === true
  const prevTarget = renderer.getRenderTarget()
  const prevClear = renderer.getClearAlpha()
  renderer.setClearAlpha(0)

  const raws: Uint8Array[] = []
  const reach = 1.25, elevation = (28 * Math.PI) / 180
  const dist = reach / Math.tan((5 * Math.PI) / 180)
  const aim = new THREE.Vector3(0, 0.78, -0.1)
  try {
    for (const [, turn] of DIRS) {
      const az = (turn * Math.PI) / 180
      camera.position.set(aim.x + dist * Math.cos(elevation) * Math.sin(az), aim.y + dist * Math.sin(elevation), aim.z + dist * Math.cos(elevation) * Math.cos(az))
      camera.lookAt(aim)
      camera.updateMatrixWorld()
      for (let f = 0; f < n; f++) {
        poseWalk(fox.skeleton, (f / n) * STRIDE)
        world.markPosed()
        renderer.setRenderTarget(target)
        renderer.clear()
        renderer.render(scene, camera)
        const px = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, big, big)) as Uint8Array
        // the pixel pipeline wants sRGB, still premultiplied, rows bottom-up as WebGL reads them
        raws.push(new Uint8Array(readbackToSrgb(px, big, big, { flip: !webgl, premultiplied: true }).buffer))
      }
    }
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.setClearAlpha(prevClear)
    target.dispose()
  }

  // Splat to Sprite's pixel pipeline: average down, cut the alpha, one palette for the whole sheet, tidy, outline
  const cut = raws.map((r) => alphaCut(downsample(r, big, SUPERSAMPLE, { premultiplied: true, flipY: true }), 0.5))
  const palette = autoPalette(cut, opts.colours ?? 12)
  const ink: Rgb = darkest(palette)
  const frames = cut.map((f) => outline(removeStrays(quantize(f, palette, 0)), ink))
  const cols = n, rows = DIRS.length

  return {
    frames, cols, rows, size,
    png: () => new Promise<Blob>((resolve, reject) => {
      const c = document.createElement('canvas')
      c.width = cols * size
      c.height = rows * size
      const ctx = c.getContext('2d')!
      frames.forEach((fr, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(fr.data), size, size), (i % cols) * size, Math.floor(i / cols) * size))
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the PNG'))), 'image/png')
    }),
    json: (image: string) => {
      const animations: Record<string, { frames: number[]; fps: number; loop: boolean }> = {}
      DIRS.forEach(([name], r) => {
        const row = Array.from({ length: cols }, (_, c) => r * cols + c)
        animations[`idle-${name}`] = { frames: [row[0]], fps: 1, loop: false }
        animations[`walk-${name}`] = { frames: row, fps: Math.round(n / STRIDE), loop: true }
      })
      // Mirrors Tinkerkit's SpriteSheet (packages/format/src/spritesheet.ts, format version 71)
      return {
        kind: 'spritesheet', formatVersion: 71, id: 'blob-fox', name: 'Blob fox', image,
        imageWidth: cols * size, imageHeight: rows * size, frameWidth: size, frameHeight: size, pixelScale: 1,
        anchor: { x: size / 2, y: size }, footprint: { x: -size / 4, y: -4, w: size / 2, h: 4 }, animations,
      }
    },
  }
}
