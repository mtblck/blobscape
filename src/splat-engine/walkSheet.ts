import * as THREE from 'three/webgpu'
import { processFrames, type PixelSettings } from '../splat-to-sprite/sheet.ts'
import type { Frame } from '../splat-to-sprite/pixel.ts'
import { SplatWorld } from './engine.ts'
import { makeCreature, poseWalk } from './creature.ts'

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

export async function makeWalkSheet(renderer: THREE.WebGPURenderer, opts: { size?: number; frames?: number; blobs?: number; settings?: Partial<PixelSettings> } = {}): Promise<WalkSheet> {
  const size = opts.size ?? 48
  const n = opts.frames ?? 8
  const settings: PixelSettings = { size, supersample: 4, alphaCut: 0.5, palette: 'auto', autoColours: 12, dither: 0, strays: true, outline: 'darkest', ...opts.settings }
  const big = size * settings.supersample

  const fox = makeCreature(opts.blobs ?? 20000)
  const world = new SplatWorld([fox])
  const scene = new THREE.Scene()
  scene.add(world)
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
        raws.push(toDisplay(px, big, !webgl))
      }
    }
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.setClearAlpha(prevClear)
    target.dispose()
    world.dispose()
  }

  // processFrames expects WebGL's bottom-up rows; toDisplay hands them over that way
  const stages = processFrames(raws, settings, true)
  const frames = stages.map((s) => s.final)
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

const TO_SRGB = Float32Array.from({ length: 4096 }, (_, i) => {
  const c = i / 4095
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
})

/**
 * The render target holds linear, premultiplied colour. The pixel pipeline
 * wants display (sRGB) colour, still premultiplied, with rows bottom-up as
 * WebGL reads them. WebGPU reads top-down, so those get flipped here.
 */
function toDisplay(px: Uint8Array, size: number, topDown: boolean): Uint8Array {
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    const src = (topDown ? size - 1 - y : y) * size * 4
    const dst = y * size * 4
    for (let x = 0; x < size * 4; x += 4) {
      const a = px[src + x + 3]
      out[dst + x + 3] = a
      if (!a) continue
      const k = a / 255
      for (let c = 0; c < 3; c++) {
        const lin = Math.min(1, px[src + x + c] / 255 / k)
        out[dst + x + c] = Math.round(TO_SRGB[Math.round(lin * 4095)] * k * 255)
      }
    }
  }
  return out
}
