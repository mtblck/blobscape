import { GlbError, type Rigged } from '../splat-engine/glb.ts'
import type { Texture } from '../splat-engine/meshShape.ts'
import { readSkinnedGlb, splatModel } from '../splat-engine/skinnedModel.ts'

/**
 * Opening an ordinary rigged model (a skinned .glb from Blender, Mixamo or a game kit) where a rigged splat .glb
 * opens: the sandbox and Splat Creatures try the file as splats first, and this when it holds triangles instead
 * (issue #208). The surface becomes flat blobs on the model's own bones, with its clips.
 */

/** A texture image decoded in the page, read nearest-pixel and repeating, as glTF's default sampler wraps. */
export async function decodeTexture(bytes: Uint8Array, mime: string): Promise<Texture> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
  const c = new OffscreenCanvas(bitmap.width, bitmap.height)
  const g = c.getContext('2d')!
  g.drawImage(bitmap, 0, 0)
  const { data, width: w, height: h } = g.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  const wrap = (x: number, n: number) => ((Math.floor(x * n) % n) + n) % n
  return (u, v) => {
    const i = (wrap(v, h) * w + wrap(u, w)) * 4
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
  }
}

/** Whether `readRiggedGlb` turned a file down only because its mesh is triangles, not splats. */
export const isMeshGlb = (e: unknown) => e instanceof GlbError && /not a Gaussian splat/.test(e.message)

/** The model as rigged splats: `count` blobs over its surface, a unit tall, standing on the floor. */
export async function rigFromModel(bytes: Uint8Array, fileName: string, count: number): Promise<Rigged> {
  const model = readSkinnedGlb(bytes, fileName.replace(/\.glb$/i, ''))
  const textures = await Promise.all(model.images.map((im) => decodeTexture(im.bytes, im.mime).catch((): Texture => () => [1, 1, 1])))
  return splatModel(model, { count, height: 1, textures })
}
