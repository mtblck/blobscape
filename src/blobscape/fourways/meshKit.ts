import * as THREE from 'three'
import { rgb, type V3 } from './layout.ts'

/**
 * Small helpers both hand-written three.js scenes use: hard-edged palette textures, flat-shaded lumps, bars, and the
 * two kinds of material. Counted with each scene's own file in its "Written as" line.
 */

/** A run of numbers from 0 up to 1 that is the same every time. */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export const rand = seeded(3)

/** A small texture of palette colors with hard edges, tiled over a surface: `pick` says which color each texel takes. */
export function texture(colors: string[], width: number, height: number, pick: (x: number, y: number) => number, repeat: [number, number]) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const k = rgb(colors[Math.min(colors.length - 1, Math.max(0, Math.floor(pick(x, y))))])
    data.set([k[0] * 255, k[1] * 255, k[2] * 255, 255], (y * width + x) * 4)
  }
  const t = new THREE.DataTexture(data, width, height)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.needsUpdate = true
  return t
}
/** Specks: mostly the first color. */
export const speckle = (colors: string[], repeat: [number, number]) => texture(colors, 16, 16, () => rand() ** 2 * colors.length, repeat)
/** Patches a few texels across. */
export const patches = (colors: string[], repeat: [number, number]) => {
  const coarse = Array.from({ length: 16 }, () => rand() * colors.length)
  return texture(colors, 8, 8, (x, y) => coarse[(y >> 1) * 4 + (x >> 1)], repeat)
}
/** Stripes along a surface (`across`) or up it. */
export const bands = (colors: string[], count: number, across = false) => texture(colors, across ? colors.length : 1, across ? 1 : colors.length, (x, y) => (across ? x : y), across ? [count / colors.length, 1] : [1, count / colors.length])

export const lit = (from: string | THREE.Texture, more: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial(typeof from === 'string' ? { color: from, ...more } : { map: from, ...more })
/** Something that gives its own light: drawn in its color whatever the lights do. */
export const glowing = (more: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, ...more })

/** Colors a mesh's corners by which way they face (up, down or sideways) and how high they are. */
export function faced(g: THREE.BufferGeometry, color: (n: THREE.Vector3, p: THREE.Vector3) => string) {
  const n = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), out = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < g.attributes.position.count; i++) {
    n.fromBufferAttribute(g.attributes.normal, i)
    p.fromBufferAttribute(g.attributes.position, i)
    c.set(color(n, p))
    out.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3))
  return g
}

/** A bumpy lump: an icosahedron with every corner pushed in or out a little, faces left flat. */
export function lump(detail: number, bump: number) {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const p = g.attributes.position, v = new THREE.Vector3(), moved = new Map<string, number>()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // corners shared by several faces must move together
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`
    if (!moved.has(key)) moved.set(key, 1 + (rand() - 0.5) * bump)
    v.multiplyScalar(moved.get(key)!)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** A straight round bar from a to b. */
export function bar(a: V3, b: V3, r: number, material: THREE.Material | THREE.Material[], rounded = true) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), length = from.distanceTo(to)
  const m = new THREE.Mesh(rounded ? new THREE.CapsuleGeometry(r, length, 3, 10) : new THREE.CylinderGeometry(r, r, length, 14), material)
  m.position.copy(from).add(to).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize())
  return m
}

export const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o }

