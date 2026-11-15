import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Rgb } from '../../splat-core/pixel.ts'
import type { Built } from '../../splat-engine/body.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import { axisAngle, mulQ, type Bone, type Skeleton } from '../../splat-engine/rig.ts'
import { box, buildVoxels, cone, cylinder, displace, ellipsoid, sphere, union, type VoxelPart, type VoxelSpec } from '../../splat-engine/voxel.ts'

/**
 * Pixel Diorama's scene: a lighthouse on a rock at dusk, written as shapes for
 * the voxel builder. Everything that moves is a bone posed from the time alone
 * (`poseDiorama`), and the whole scene repeats every `LOOP` seconds, so any
 * stretch of it can be saved as a looping strip.
 */
export const LOOP = 12
const TAU = Math.PI * 2

const TOWER: [number, number] = [0.05, -0.05]
const LAMP_Y = 1.4
const GULLS = [
  { r: 0.62, y: 1.72, phase: 0, way: 1 },
  { r: 0.95, y: 1.5, phase: 2.2, way: -1 },
  { r: 0.8, y: 1.95, phase: 4.1, way: 1 },
]
const CLOUDS: Vec3[] = [[-0.9, 2.05, -0.7], [0.95, 2.3, -1.0]]
const FOAM: Vec3[] = [[-1.1, 0.0, 0.95], [0.3, 0.0, 1.25], [1.2, 0.0, -0.4], [-0.5, 0.0, -1.2], [-1.3, 0.0, -0.2], [0.75, 0.0, 0.25]]
const BOAT: Vec3 = [1.0, 0.03, 0.75]

const WHITE: Vec3 = [0.95, 0.93, 0.86], RED: Vec3 = [0.75, 0.2, 0.22], DARK: Vec3 = [0.16, 0.15, 0.22]
const LAMP: Vec3 = [1, 0.92, 0.55], MOON: Vec3 = [0.96, 0.97, 1]
// unlit colours that stay under the glow line (GLOW_FROM): bright, but not lamps
const GULL: Vec3 = [0.9, 0.9, 0.86], FOAM_C: Vec3 = [0.78, 0.88, 0.91]

/** A cheap, repeatable wobble for rock and water: a few sines, about -1..1. */
const wobble = (x: number, y: number, z: number) => (Math.sin(x * 7.3 + z * 3.1) + Math.sin(z * 8.7 - x * 2.3 + y * 5.1) + Math.sin((x + z) * 13.1 + y * 9.7) * 0.5) / 2.5

export function dioramaBones(): Bone[] {
  const bones: Bone[] = [{ name: 'land', parent: -1, head: [0, 0, 0] }]
  const add = (name: string, head: Vec3, parent = 0) => bones.push({ name, parent, head }) - 1
  add('lamp', [TOWER[0], LAMP_Y, TOWER[1]])
  add('boat', BOAT)
  GULLS.forEach((g, i) => {
    const pivot = add(`gull${i}`, [TOWER[0], g.y, TOWER[1]])
    add(`gull${i}L`, [TOWER[0] + g.r, g.y, TOWER[1]], pivot)
    add(`gull${i}R`, [TOWER[0] + g.r, g.y, TOWER[1]], pivot)
  })
  CLOUDS.forEach((c, i) => add(`cloud${i}`, c))
  FOAM.forEach((f, i) => add(`foam${i}`, f))
  return bones
}

/** The scene as shapes, on a grid of `spacing`: smaller cells, finer pixels of scene and more blobs. */
export function dioramaSpec(spacing = 0.03): VoxelSpec {
  const s = spacing
  // the thinnest a shape can be and still catch a grid cell everywhere
  const thin = s * 0.75
  const parts: VoxelPart[] = []
  const [tx, tz] = TOWER

  // the sea: a slab with a ripple on top, lighter on the crests
  parts.push({
    shape: displace(box([0, -0.14, 0], [1.75, 0.12, 1.75]), (x, y, z) => (y > -0.1 ? wobble(x, 0, z) * 0.02 : 0), 0.03),
    colour: (p, n) => (n[1] < 0.5 ? [0.07, 0.13, 0.3] : wobble(p[0], 0, p[2]) > 0.45 ? [0.3, 0.52, 0.74] : wobble(p[0] * 0.6, 2, p[2] * 0.6) > 0.1 ? [0.14, 0.3, 0.55] : [0.1, 0.22, 0.45]),
    bone: 'land',
  })

  // the rock, grassy on top, sandy at the waterline
  const rock = displace(union(ellipsoid([0, 0.02, 0], [0.8, 0.3, 0.62]), ellipsoid([-0.35, 0.02, 0.25], [0.45, 0.2, 0.4])), (x, y, z) => wobble(x * 1.7, y * 2, z * 1.7) * 0.035, 0.04)
  parts.push({
    shape: rock,
    colour: (p, n) => (p[1] < 0.05 ? [0.82, 0.72, 0.5] : n[1] > 0.72 && p[1] > 0.14 ? (wobble(p[0] * 3, 1, p[2] * 3) > 0.2 ? [0.36, 0.62, 0.3] : [0.26, 0.5, 0.28]) : wobble(p[0] * 2, p[1] * 6, p[2] * 2) > 0 ? [0.5, 0.45, 0.44] : [0.4, 0.36, 0.38]),
    bone: 'land',
  })
  for (const [x, z, r] of [[-1.15, 0.55, 0.14], [0.95, -0.85, 0.18], [1.25, -0.6, 0.1]] as const) {
    parts.push({ shape: displace(sphere([x, 0, z], r), (a, b, c) => wobble(a * 3, b * 3, c * 3) * 0.02, 0.02), colour: (p) => (p[1] < 0.03 ? [0.3, 0.28, 0.32] : [0.45, 0.41, 0.42]), bone: 'land' })
  }

  // the tower: red and white bands, a gallery, the lamp room and its cap
  parts.push({ shape: cylinder(TOWER, 0.2, 1.25, 0.21, 0.135), colour: (p) => (Math.floor((p[1] - 0.2) / 0.21) % 2 === 0 ? WHITE : RED), bone: 'land' })
  parts.push({ shape: cylinder(TOWER, 1.25, 1.25 + Math.max(0.05, s * 1.5), 0.2), colour: DARK, bone: 'land' })
  parts.push({ shape: cylinder(TOWER, 1.3, 1.5, 0.11), colour: LAMP, bone: 'land', glow: true })
  parts.push({ shape: cone([tx, 1.52, tz], [tx, 1.72, tz], 0.16, thin * 0.6), colour: RED, bone: 'land' })
  // a door and two lit windows on the side the default view sees
  parts.push({ shape: box([tx + 0.12, 0.3, tz + 0.15], [0.05, 0.09, 0.05]), colour: DARK, bone: 'land' })
  parts.push({ shape: box([tx + 0.105, 0.72, tz + 0.125], [0.035, 0.05, 0.035]), colour: LAMP, bone: 'land', glow: true })
  parts.push({ shape: box([tx + 0.09, 1.05, tz + 0.105], [0.03, 0.045, 0.03]), colour: LAMP, bone: 'land', glow: true })

  // the lens: a bright bar through the lamp room, turning with the lamp's bone (the light it throws is `lampLights`)
  parts.push({ shape: box([tx, LAMP_Y, tz], [0.17, 0.035, 0.035]), colour: [1, 1, 0.85], bone: 'lamp', glow: true })

  // a little boat with a sail and a lantern
  const [bx, by, bz] = BOAT
  parts.push({ shape: ellipsoid([bx, by, bz], [0.24, 0.085, 0.11]), colour: (p) => (p[1] > by + 0.035 ? [0.78, 0.6, 0.38] : [0.48, 0.3, 0.2]), bone: 'boat', noShadow: true })
  parts.push({ shape: box([bx, by + 0.24, bz], [thin, 0.2, thin]), colour: [0.35, 0.24, 0.18], bone: 'boat', noShadow: true })
  parts.push({ shape: box([bx + 0.085, by + 0.27, bz], [0.075, 0.13, thin]), colour: (p) => (p[1] > by + 0.3 ? [0.96, 0.92, 0.8] : [0.86, 0.8, 0.68]), bone: 'boat', noShadow: true })
  parts.push({ shape: sphere([bx - 0.2, by + 0.12, bz], Math.max(0.03, thin)), colour: [1, 0.8, 0.4], bone: 'boat', glow: true })

  // gulls circling the tower: a body on the pivot bone and a wing on each wing bone
  GULLS.forEach((g, i) => {
    const c: Vec3 = [tx + g.r, g.y, tz]
    // unlit, so they stay white against the sky whichever way they face
    parts.push({ shape: ellipsoid(c, [thin * 1.1, thin * 1.1, 0.07]), colour: GULL, bone: `gull${i}`, glow: true })
    parts.push({ shape: box([c[0] + 0.07, c[1], c[2]], [0.07, thin, 0.035]), colour: GULL, bone: `gull${i}L`, glow: true })
    parts.push({ shape: box([c[0] - 0.07, c[1], c[2]], [0.07, thin, 0.035]), colour: GULL, bone: `gull${i}R`, glow: true })
  })

  // clouds, the moon and a few stars
  CLOUDS.forEach((c, i) => {
    const puff = union(ellipsoid(c, [0.34, 0.1, 0.16]), sphere([c[0] - 0.12, c[1] + 0.07, c[2]], 0.13), sphere([c[0] + 0.1, c[1] + 0.09, c[2]], 0.15))
    parts.push({ shape: puff, colour: (p) => (p[1] > c[1] + 0.03 ? [0.81, 0.9, 0.91] : [0.44, 0.64, 0.85]), bone: `cloud${i}`, glow: true })
  })
  parts.push({ shape: sphere([-1.5, 2.6, -1.3], 0.17), colour: MOON, bone: 'land', glow: true })
  const stars: Vec3[] = [[-0.6, 2.6, -1.6], [0.2, 2.75, -1.6], [1.3, 2.55, -1.6], [-1.6, 1.7, -1.3], [1.6, 1.9, -1.5], [0.6, 2.05, -1.7], [-0.2, 2.2, -1.7], [1.05, 2.9, -1.4], [-1.0, 2.9, -1.5], [-1.65, 2.5, -0.6], [1.7, 2.6, -0.5]]
  for (const p of stars) parts.push({ shape: sphere(p, thin), colour: [1, 1, 0.9], bone: 'land', glow: true })

  // foam: flat patches that swell and fade as they drift (poseDiorama)
  FOAM.forEach((f, i) => {
    parts.push({ shape: ellipsoid([f[0], f[1] + 0.01, f[2]], [0.16, Math.max(0.025, thin), 0.06]), colour: FOAM_C, bone: `foam${i}`, glow: true })
  })

  return { bones: dioramaBones(), parts, spacing: s, light: { dir: [-0.5, 0.8, 0.45], ambient: 0.4, shadow: 0.8 } }
}

export const DETAIL = [
  { id: 'chunky', label: 'Chunky', spacing: 0.042 },
  { id: 'medium', label: 'Medium', spacing: 0.03 },
  { id: 'fine', label: 'Fine', spacing: 0.022 },
] as const

export function makeDiorama(spacing = 0.03): Built {
  return buildVoxels(dioramaSpec(spacing))
}

const Yq = (rad: number) => axisAngle([0, 1, 0], rad)

/** Poses the scene for `t` seconds. Every motion fits a whole number of times into `LOOP`. */
export function poseDiorama(sk: Skeleton, t: number) {
  sk.reset()
  const u = t / LOOP
  // the lamp turns twice a loop
  sk.setRotation(sk.index('lamp'), Yq(u * 2 * TAU))

  // the boat rides the swell: up and down, rolling and pitching a little out of step
  const boat = sk.index('boat')
  sk.offset[boat * 3 + 1] = Math.sin(u * 4 * TAU) * 0.014
  sk.setRotation(boat, mulQ(axisAngle([0, 0, 1], Math.sin(u * 4 * TAU + 1) * 0.1), axisAngle([1, 0, 0], Math.sin(u * 3 * TAU) * 0.07)))

  GULLS.forEach((g, i) => {
    const pivot = sk.index(`gull${i}`)
    sk.setRotation(pivot, Yq(g.way * u * TAU + g.phase))
    sk.offset[pivot * 3 + 1] = Math.sin(u * 3 * TAU + g.phase) * 0.05
    // wings beat about the way the gull flies (z, at rest), up on one side as down on the other's mirror
    const beat = Math.sin(u * 24 * TAU + g.phase * 3) * 0.6
    sk.setRotation(sk.index(`gull${i}L`), axisAngle([0, 0, 1], beat))
    sk.setRotation(sk.index(`gull${i}R`), axisAngle([0, 0, 1], -beat))
  })

  CLOUDS.forEach((_, i) => { sk.offset[sk.index(`cloud${i}`) * 3] = Math.sin(u * TAU + i * 2.4) * 0.22 })

  FOAM.forEach((_, i) => {
    const b = sk.index(`foam${i}`)
    // each patch lives a third of a loop, starting at its own moment
    const life = (u * 3 + i / FOAM.length) % 1
    sk.size[b] = Math.sin(Math.PI * life) ** 0.6
    sk.offset[b * 3] = (life - 0.5) * 0.18
  })
  sk.update()
}

/**
 * The lamp's two beams as live lights: a pool of warm light on each side of
 * the tower, sweeping over the sea and the rock in step with the lens.
 */
export function lampLights(t: number): PointLight[] {
  const a = (t / LOOP) * 2 * TAU
  return [1, -1].map((way) => ({
    position: [TOWER[0] + way * Math.cos(a) * 1.0, 0.3, TOWER[1] - way * Math.sin(a) * 1.0],
    // strong, because it lights dark water: a pool a few times brighter than the sea round it
    colour: [3.2, 2.6, 1.3],
    range: 0.55,
  }))
}

export interface Palette { id: string; label: string; colours: Rgb[] }

const hex = (...h: string[]): Rgb[] => h.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)])

export const PALETTES: Palette[] = [
  { id: 'dusk', label: 'Dusk', colours: hex('#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45', '#69b05a', '#3b3848', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52', '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0') },
  { id: 'ember', label: 'Ember', colours: hex('#120a06', '#2b1608', '#4d260b', '#7a3d0d', '#a85d12', '#d98a1f', '#f5b83d', '#ffe08a', '#fff6d6', '#cfe9f2') },
  { id: 'pocket', label: 'Pocket', colours: hex('#0f2a1d', '#2f5d3a', '#7fae5a', '#d8e8a0') },
  { id: 'ink', label: 'Ink', colours: hex('#101018', '#3a3a52', '#8a8aa6', '#e8e6f0') },
  { id: 'none', label: 'Scene colours', colours: [] },
]
