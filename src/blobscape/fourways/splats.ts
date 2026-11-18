import * as THREE from 'three'
import { ExtSplats, SparkRenderer, SplatMesh, SplatSkinning, SplatSkinningMode } from '@sparkjsdev/spark'
import { covariance } from '../../splat-core/blobs.ts'
import { linearToSrgb, srgbToLinear } from '../../splat-core/color.ts'
import { placeCamera, type Orbit } from '../../splat-core/orbit.ts'
import type { Built } from '../../splat-engine/body.ts'
import { blobNormal, lightAt, ownLight } from '../../splat-engine/light.ts'
import { poseSpark, restAtOrigin, setSplatBones } from '../../splat-engine/three/spark.ts'
import { SCENE, lightsAt } from './scene.ts'

/**
 * The campfire in Spark. Spark draws splats and does not make them, so these are the blobs Blobscape cut for its own
 * panel, handed over as a rigged file would be: Spark's own skinning moves them by the same bones, its worker sorts
 * them, and its shader draws them. What it has no place for is light: a splat is a color, so the fire's light is
 * worked out once, as the scene stood at the start, and painted into the colors. The flames move; their light does not.
 *
 * It gives the scene drawn small with clear pixels where there is nothing; the page finishes it as pixel art.
 */

/** The blobs' colors with the scene's lights painted in, as they are at the start of the loop. */
function litColors(b: Built): Float32Array {
  const { blobs, seen, glow } = b
  const lights = lightsAt(0, 1), out = new Float32Array(blobs.count * 3)
  for (let i = 0; i < blobs.count; i++) {
    const light = ownLight(lightAt(blobs.center.subarray(i * 3, i * 3 + 3), blobNormal(covariance(blobs, i)), lights, 1, seen?.subarray(i * 4, i * 4 + 4)), glow ? glow[i] / 255 : 0)
    for (let k = 0; k < 3; k++) out[i * 3 + k] = linearToSrgb(Math.min(1, srgbToLinear(blobs.color[i * 3 + k]) * light[k]))
  }
  return out
}

export class SplatPanel {
  readonly name = 'splats'
  private canvas = document.createElement('canvas')
  private renderer: THREE.WebGLRenderer
  private spark: SparkRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
  private pixels = new Uint8Array(0)
  private mesh?: SplatMesh
  private skinning?: SplatSkinning
  private posed = NaN

  private constructor(private built: Built) {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(1)
    this.renderer.setClearColor(0x000000, 0)
    // bones that grow (the flames, the sparks) need Spark's linear blend, which works on its covariance splats
    this.spark = new SparkRenderer({ renderer: this.renderer, covSplats: true, accumExtSplats: true })
    this.scene.add(this.spark)
  }

  static async start(built: Built) {
    const p = new SplatPanel(built)
    const b = built.blobs, colors = litColors(built)
    const store = new ExtSplats({ maxSplats: b.count })
    const c = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), col = new THREE.Color()
    for (let i = 0; i < b.count; i++) {
      c.fromArray(b.center, i * 3)
      s.fromArray(b.scale, i * 3)
      q.fromArray(b.quat, i * 4)
      col.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
      store.setSplat(i, c, s, q, b.opacity[i], col)
    }
    // ExtSplats uploads its arrays only when it is made from them
    const mesh = new SplatMesh({ extSplats: new ExtSplats({ extArrays: store.extArrays, numSplats: b.count }), covSplats: true })
    await mesh.initialized
    const skinning = new SplatSkinning({ mesh, numSplats: b.count, numBones: built.skeleton.count, mode: SplatSkinningMode.LINEAR_BLEND })
    restAtOrigin(skinning, built.skeleton.count)
    setSplatBones(skinning, built.skin, b.count)
    skinning.skinTexture.needsUpdate = true
    mesh.skinning = skinning
    mesh.updateGenerator()
    p.scene.add(mesh)
    p.mesh = mesh
    p.skinning = skinning
    return p
  }

  /** Whether Spark is still sorting for the view last drawn: its order arrives a frame or more late. */
  get sorting() { return this.spark.sorting || this.spark.sortDirty || this.spark.dirty }

  /** Draws the scene `t` seconds in, `width` by `height`, and gives its pixels: RGBA, bottom row first, color times cover. */
  draw(t: number, orbit: Orbit, width: number, height: number, _fire: number, fov: number): Uint8Array {
    const { renderer, canvas } = this
    if (canvas.width !== width || canvas.height !== height) { renderer.setSize(width, height, false); this.pixels = new Uint8Array(width * height * 4) }
    this.camera.fov = fov
    placeCamera(this.camera, orbit, width / height)
    // the same moment asked for again is only waiting on the sort: posing it again would start the sort over
    if (t !== this.posed) {
      this.posed = t
      SCENE.pose(this.built.skeleton, t)
      if (this.skinning) poseSpark(this.skinning, this.built.skeleton)
    }
    renderer.render(this.scene, this.camera)
    const gl = renderer.getContext()
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels)
    return this.pixels
  }

  dispose() {
    this.mesh?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
