import * as THREE from 'three'
import type { PackedSplats } from '@sparkjsdev/spark'

/**
 * Procedural sample splats. They're built here, blob by blob, rather than
 * downloaded: no asset licenses to track, a few hundred KB of JS instead of
 * tens of MB of .ply, and they show the core idea plainly — a splat object is
 * nothing but a list of colored, see-through ellipsoids.
 *
 * Each blob is a flat disc lying on the surface (thin along the normal), with
 * simple baked lighting, which is roughly what a trained capture ends up with.
 */

export interface Preset {
  id: string
  name: string
  build: (s: PackedSplats) => void
}

type Push = (pos: THREE.Vector3, normal: THREE.Vector3, size: number, color: THREE.Color, opacity?: number, thin?: number) => void

const LIGHT = new THREE.Vector3(-0.5, 0.8, 0.6).normalize()

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function pusher(s: PackedSplats, rand: () => number): Push {
  const up = new THREE.Vector3(0, 0, 1)
  const q = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const c = new THREE.Color()
  return (pos, normal, size, color, opacity = 0.95, thin = 0.18) => {
    q.setFromUnitVectors(up, normal)
    const jitter = 0.75 + rand() * 0.5
    scale.set(size * jitter, size * jitter * (0.7 + rand() * 0.6), size * thin)
    // Half-Lambert shading + a little noise, baked into the color
    const lit = 0.45 + 0.55 * Math.max(0, normal.dot(LIGHT) * 0.5 + 0.5)
    const n = 0.92 + rand() * 0.16
    c.copy(color).multiplyScalar(lit * n)
    s.pushSplat(pos, scale, q, opacity, c)
  }
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Even-ish points on a sphere (Fibonacci), filtered by a predicate on the unit normal. */
function sphere(push: Push, center: THREE.Vector3, radii: THREE.Vector3, count: number, size: number, color: (n: THREE.Vector3) => THREE.Color, keep: (n: THREE.Vector3) => boolean = () => true, opacity = 0.95) {
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const t = golden * i
    const n = v(Math.cos(t) * r, y, Math.sin(t) * r)
    if (!keep(n)) continue
    const p = v(n.x * radii.x, n.y * radii.y, n.z * radii.z).add(center)
    const sn = v(n.x / radii.x, n.y / radii.y, n.z / radii.z).normalize()
    push(p, sn, size, color(n), opacity)
  }
}

function cylinder(push: Push, base: THREE.Vector3, radius: (t: number) => number, height: number, count: number, size: number, color: (t: number, a: number) => THREE.Color, rand: () => number) {
  for (let i = 0; i < count; i++) {
    const t = rand()
    const a = rand() * Math.PI * 2
    const r = radius(t)
    const slope = (radius(Math.min(1, t + 0.01)) - radius(Math.max(0, t - 0.01))) / (0.02 * height)
    const n = v(Math.cos(a), -slope, Math.sin(a)).normalize()
    push(v(base.x + Math.cos(a) * r, base.y + t * height, base.z + Math.sin(a) * r), n, size, color(t, a))
  }
}

function disc(push: Push, center: THREE.Vector3, radius: number, count: number, size: number, color: (r: number) => THREE.Color, rand: () => number, normal = v(0, 1, 0)) {
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rand()) * radius
    const a = rand() * Math.PI * 2
    push(v(center.x + Math.cos(a) * r, center.y, center.z + Math.sin(a) * r), normal, size, color(r / radius))
  }
}

const col = (hex: string) => new THREE.Color(hex)
const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t)

export const PRESETS: Preset[] = [
  {
    id: 'mushroom',
    name: 'Toadstool',
    build: (s) => {
      const rand = rng(7)
      const push = pusher(s, rand)
      // stem
      cylinder(push, v(0, 0, 0), (t) => 0.22 - 0.05 * t + 0.04 * Math.sin(t * 3), 0.62, 5000, 0.05, (t) => mix('#d9c7a3', '#f4ead2', t), rand)
      // cap: a squashed dome with white spots
      const spots = Array.from({ length: 9 }, () => {
        const a = rand() * Math.PI * 2
        const y = 0.25 + rand() * 0.7
        const r = Math.sqrt(1 - y * y)
        return v(Math.cos(a) * r, y, Math.sin(a) * r)
      })
      sphere(push, v(0, 0.58, 0), v(0.62, 0.42, 0.62), 22000, 0.045, (n) => (spots.some((sp) => sp.distanceTo(n) < 0.2) ? col('#fbf3e4') : mix('#a8171d', '#e23b2e', n.y)), (n) => n.y > -0.05)
      // gills under the cap
      disc(push, v(0, 0.56, 0), 0.6, 3000, 0.04, (r) => mix('#c8a77e', '#8a6b4c', r), rand, v(0, -1, 0))
      // grass tuft base
      disc(push, v(0, 0.0, 0), 0.5, 2500, 0.05, (r) => mix('#4d8a2e', '#2f5d1f', r), rand)
    },
  },
  {
    id: 'pine',
    name: 'Pine tree',
    build: (s) => {
      const rand = rng(11)
      const push = pusher(s, rand)
      cylinder(push, v(0, 0, 0), () => 0.09, 0.5, 1500, 0.04, () => col('#6b4226'), rand)
      for (let tier = 0; tier < 4; tier++) {
        const y0 = 0.3 + tier * 0.33
        const rad = 0.62 - tier * 0.13
        cylinder(push, v(0, y0, 0), (t) => rad * (1 - t) + 0.02, 0.55, 9000 - tier * 1500, 0.05, (t, a) => mix('#1f4d2b', '#4f9a45', t * 0.5 + 0.5 * (0.5 + 0.5 * Math.cos(a + 2.2))), rand)
        disc(push, v(0, y0, 0), rad, 1500, 0.05, () => col('#173a22'), rand, v(0, -1, 0))
      }
      disc(push, v(0, 0, 0), 0.45, 1500, 0.05, (r) => mix('#7a6a45', '#5b4e33', r), rand)
    },
  },
  {
    id: 'duck',
    name: 'Rubber duck',
    build: (s) => {
      const rand = rng(23)
      const push = pusher(s, rand)
      const yellow = (n: THREE.Vector3) => mix('#f0b81c', '#ffe066', 0.5 + 0.5 * n.y)
      sphere(push, v(0, 0.34, 0), v(0.55, 0.36, 0.42), 20000, 0.045, yellow)
      // tail tip
      sphere(push, v(-0.5, 0.52, 0), v(0.14, 0.12, 0.12), 1200, 0.035, yellow)
      sphere(push, v(0.26, 0.86, 0), v(0.27, 0.27, 0.27), 9000, 0.04, (n) => (Math.abs(n.z) > 0.55 && n.y > 0.1 && n.y < 0.45 && n.x > 0.2 ? col('#181418') : yellow(n)))
      // beak
      sphere(push, v(0.55, 0.8, 0), v(0.16, 0.06, 0.12), 1800, 0.03, () => col('#f06b1e'))
      // wing bumps
      for (const z of [-1, 1]) sphere(push, v(-0.05, 0.42, z * 0.38), v(0.25, 0.14, 0.06), 1500, 0.035, () => col('#e6a713'))
    },
  },
  {
    id: 'potion',
    name: 'Potion',
    build: (s) => {
      const rand = rng(31)
      const push = pusher(s, rand)
      // liquid (opaque) then glass (faint) — overlapping translucent blobs is exactly what splats are good at
      sphere(push, v(0, 0.34, 0), v(0.3, 0.3, 0.3), 9000, 0.04, (n) => mix('#7b1fa2', '#e040fb', 0.5 + 0.5 * n.y), (n) => n.y < 0.35)
      sphere(push, v(0, 0.36, 0), v(0.38, 0.36, 0.38), 9000, 0.05, (n) => mix('#9fd8f0', '#ffffff', Math.max(0, n.dot(LIGHT))), (n) => n.y < 0.92, 0.22)
      // neck + cork
      cylinder(push, v(0, 0.68, 0), () => 0.1, 0.2, 1500, 0.035, () => col('#bfe8f7'), rand)
      cylinder(push, v(0, 0.86, 0), () => 0.115, 0.12, 1200, 0.035, () => col('#a0703f'), rand)
      disc(push, v(0, 0.98, 0), 0.115, 300, 0.035, () => col('#c48a52'), rand)
    },
  },
]
