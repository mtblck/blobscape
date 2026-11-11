import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFGaussianSplatLoaderExtension } from 'three/addons/loaders/GLTFGaussianSplatLoaderExtension.js'

/**
 * Loads one of our rigged .glb files with three.js's own glTF loader and its
 * KHR_gaussian_splatting plugin, which know nothing of our skinning extension:
 * the "does it open somewhere else" check. Returns how many splats it found.
 */
export async function loadWithThree(bytes: Uint8Array): Promise<{ splats: number; skinned: boolean; animations: number }> {
  const loader = new GLTFLoader()
  loader.register((parser) => new GLTFGaussianSplatLoaderExtension(parser as never) as never)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const gltf = await loader.parseAsync(buffer, '')
  let splats = 0, skinned = false
  gltf.scene.traverse((o) => {
    const g = o as unknown as { isGaussianSplat?: boolean; splatGeometry?: { getAttribute: (n: string) => { count: number } }; isSkinnedMesh?: boolean }
    if (g.isGaussianSplat && g.splatGeometry) splats += g.splatGeometry.getAttribute('position').count
    if (g.isSkinnedMesh) skinned = true
  })
  return { splats, skinned, animations: gltf.animations.length }
}
