import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Rgb } from '../../splat-core/pixel.ts'
import type { Built } from '../../splat-engine/body.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import { axisAngle, mulQ, type Bone, type Skeleton } from '../../splat-engine/rig.ts'
import { box, buildVoxels, cone, cut, cylinder, displace, ellipsoid, roof, sphere, torus, union, type VoxelPart, type VoxelSpec } from '../../splat-engine/voxel.ts'

/**
 * Pixel Diorama's scene: a lighthouse and its keeper's cottage on a rock at dusk, written as shapes for
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
const CLOUDS: Vec3[] = [[-0.9, 1.9, -0.7], [0.95, 2.05, -1.0]]
const FOAM: Vec3[] = [[-0.9, 0.0, 0.85], [0.3, 0.0, 1.15], [1.15, 0.0, -0.35], [-0.45, 0.0, -1.1], [-1.15, 0.0, -0.2], [0.75, 0.0, 0.25]]
/** The sea is a round dish this wide: small enough that the grid's cells go to the island, not to open water. */
const SEA = 1.42
const BOAT: Vec3 = [0.95, 0.03, 0.62]

const WHITE: Vec3 = [0.92, 0.93, 0.96], RED: Vec3 = [0.75, 0.2, 0.22], DARK: Vec3 = [0.16, 0.15, 0.22]
const LAMP: Vec3 = [1, 0.92, 0.55], MOON: Vec3 = [0.96, 0.97, 1]
// unlit colours that stay under the glow line (GLOW_FROM): bright, but not lamps
const GULL: Vec3 = [0.9, 0.9, 0.86], FOAM_C: Vec3 = [0.78, 0.88, 0.91]

/** A cheap, repeatable wobble for rock and water: a few sines, about -1..1. */
const wobble = (x: number, y: number, z: number) => (Math.sin(x * 7.3 + z * 3.1) + Math.sin(z * 8.7 - x * 2.3 + y * 5.1) + Math.sin((x + z) * 13.1 + y * 9.7) * 0.5) / 2.5

const TREES: [x: number, z: number, h: number][] = [[-0.62, -0.2, 0.5], [0.46, -0.4, 0.42], [-0.74, 0.02, 0.36]]
const SMOKE = 3
const COTTAGE: [number, number] = [-0.36, 0.16]
const JETTY = { x: 0.62, z0: 0.3, z1: 0.94, y: 0.085 }
const BUOY: Vec3 = [-0.7, 0.0, 1.0]

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
  TREES.forEach(([x, z], i) => add(`tree${i}`, [x, 0.15, z]))
  for (let i = 0; i < SMOKE; i++) add(`smoke${i}`, [COTTAGE[0] - 0.07, 0.62, COTTAGE[1]])
  add('buoy', BUOY)
  return bones
}

/** A repeatable number in 0..1 for a pair of whole numbers: which brick is chipped, which flower is red. */
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v) }
const shade = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k]

/** The scene as shapes, on a grid of `spacing`: smaller cells, finer pixels of scene and more blobs. */
export function dioramaSpec(spacing = 0.03): VoxelSpec {
  const s = spacing
  // the thinnest a shape can be and still catch a grid cell everywhere
  const thin = s * 0.75
  const parts: VoxelPart[] = []
  const [tx, tz] = TOWER

  // the rock, made first because the sea, the path and everything standing on it ask where it is
  const rock = displace(union(ellipsoid([0, 0.02, 0], [0.8, 0.3, 0.62]), ellipsoid([-0.35, 0.02, 0.25], [0.5, 0.24, 0.42])), (x, y, z) => wobble(x * 1.7, y * 2, z * 1.7) * 0.035, 0.04)
  /** How high the rock stands at x, z. */
  const ground = (x: number, z: number) => { for (let y = 0.7; y > 0; y -= 0.004) if (rock.sdf(x, y, z) <= 0) return y; return 0 }
  // the path from the tower's door to the jetty
  const P0: [number, number] = [tx + 0.14, tz + 0.2], P1: [number, number] = [JETTY.x, JETTY.z0 + 0.04]
  const onPath = (x: number, z: number) => {
    const dx = P1[0] - P0[0], dz = P1[1] - P0[1]
    const t = Math.min(1, Math.max(0, ((x - P0[0]) * dx + (z - P0[1]) * dz) / (dx * dx + dz * dz)))
    return Math.hypot(x - P0[0] - dx * t, z - P0[1] - dz * t) < Math.max(0.04, s * 1.3)
  }

  // the sea: a round slab with a ripple on top, lighter on the crests and pale in the shallows
  parts.push({
    shape: displace(cylinder([0, 0], -0.26, -0.02, SEA), (x, y, z) => (y > -0.1 ? wobble(x, 0, z) * 0.02 : 0), 0.03),
    colour: (p, n) => {
      if (n[1] < 0.5) return p[1] > -0.08 ? [0.1, 0.2, 0.42] : [0.07, 0.13, 0.3]
      const shore = rock.sdf(p[0], 0, p[2])
      if (shore < 0.035) return [0.74, 0.86, 0.9]
      if (shore < 0.1) return wobble(p[0] * 4, 3, p[2] * 4) > 0 ? [0.3, 0.52, 0.74] : [0.2, 0.42, 0.66]
      // wave lines lying along x, a cell or two thick: short bright glints on the crests, longer mid-blue runs between
      const line = Math.sin(p[2] * 40 + Math.sin(p[0] * 5) * 2.2)
      const run = hash(Math.floor(p[0] * 3 + p[2] * 9), Math.floor(p[2] * 6.4))
      if (line > 0.88 && run > 0.5) return [0.3, 0.52, 0.74]
      if (line < -0.8 && run < 0.6) return [0.14, 0.3, 0.55]
      return [0.1, 0.22, 0.45]
    },
    bone: 'land',
  })

  // sandy at the waterline, layered stone on the sides, grass and a worn path on top
  parts.push({
    shape: rock,
    colour: (p, n) => {
      if (p[1] < 0.05) return hash(Math.floor(p[0] * 40), Math.floor(p[2] * 40)) > 0.8 ? [0.7, 0.6, 0.42] : [0.82, 0.72, 0.5]
      if (n[1] > 0.72 && p[1] > 0.14) {
        if (onPath(p[0], p[2])) return hash(Math.floor(p[0] * 50), Math.floor(p[2] * 50)) > 0.75 ? [0.62, 0.52, 0.38] : [0.74, 0.63, 0.44]
        const g = wobble(p[0] * 3, 1, p[2] * 3)
        return g > 0.35 ? [0.42, 0.68, 0.34] : g > -0.25 ? [0.3, 0.55, 0.29] : [0.2, 0.42, 0.26]
      }
      // strata: bands that tilt and wander a little, with a dark crack between some
      const band = (p[1] + wobble(p[0], 0, p[2]) * 0.03 + p[0] * 0.08) / 0.05
      const f = band - Math.floor(band)
      if (f < 0.22) return [0.3, 0.27, 0.31]
      return hash(Math.floor(band), 3) > 0.5 ? [0.52, 0.47, 0.45] : [0.42, 0.38, 0.4]
    },
    bone: 'land',
  })
  for (const [x, z, r] of [[-1.1, 0.5, 0.14], [0.9, -0.8, 0.18], [1.12, -0.5, 0.1], [-0.95, -0.75, 0.12], [0.2, 1.2, 0.08], [-0.2, -1.15, 0.11]] as const) {
    parts.push({
      shape: displace(ellipsoid([x, 0, z], [r, r * 1.25, r * 0.9]), (a, b, c) => wobble(a * 3, b * 3, c * 3) * 0.02, 0.02),
      colour: (p, n) => (p[1] < 0.03 ? [0.3, 0.28, 0.32] : n[1] > 0.75 ? [0.56, 0.52, 0.5] : Math.floor(p[1] / 0.045) % 2 ? [0.45, 0.41, 0.42] : [0.38, 0.35, 0.38]),
      bone: 'land',
    })
  }

  // the tower: brick in red and white bands on a stone foot, a railed gallery, the lamp room and its cap
  const course = Math.max(0.05, s * 2.2)
  const bricks = (p: Vec3): Vec3 => {
    const base = Math.floor((p[1] - 0.2) / 0.21) % 2 === 0 ? WHITE : RED
    const row = Math.floor(p[1] / course), fy = p[1] / course - row
    const round = (Math.atan2(p[2] - tz, p[0] - tx) / TAU) * 12 + (row % 2) * 0.5
    const col = Math.floor(round), fx = round - col
    // mortar: a thin line under each course (and between bricks, once the grid is fine enough to draw one); one brick in six is a shade darker
    if (fy < 0.22 || (fx < 0.1 && s < 0.02)) return shade(base, 0.8)
    return hash(row, col) > 0.84 ? shade(base, 0.86) : base
  }
  parts.push({ shape: cylinder(TOWER, 0.2, 1.25, 0.21, 0.135), colour: bricks, bone: 'land' })
  parts.push({ shape: cylinder(TOWER, 0.18, 0.31, 0.25, 0.235), colour: (p) => (hash(Math.floor(p[1] / 0.045), Math.floor(Math.atan2(p[2] - tz, p[0] - tx) * 3)) > 0.5 ? [0.5, 0.47, 0.5] : [0.4, 0.38, 0.42]), bone: 'land' })
  parts.push({ shape: cylinder(TOWER, 1.25, 1.25 + Math.max(0.05, s * 1.5), 0.21), colour: DARK, bone: 'land' })
  // the gallery's rail: a ring on posts
  const railY = 1.3 + Math.max(0.085, s * 3)
  parts.push({ shape: torus([tx, railY, tz], 0.2, thin * 0.7), colour: [0.62, 0.6, 0.68], bone: 'land', noShadow: true })
  parts.push({
    shape: union(...Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * TAU
      return box([tx + Math.cos(a) * 0.2, (1.3 + railY) / 2, tz + Math.sin(a) * 0.2], [thin * 0.7, (railY - 1.3) / 2, thin * 0.7])
    })),
    colour: [0.62, 0.6, 0.68], bone: 'land', noShadow: true,
  })
  parts.push({ shape: cylinder(TOWER, 1.3, 1.5, 0.11), colour: LAMP, bone: 'land', glow: true })
  // glazing bars round the lamp room
  parts.push({
    shape: union(...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * TAU + 0.3
      return box([tx + Math.cos(a) * 0.115, 1.4, tz + Math.sin(a) * 0.115], [thin * 0.7, 0.1, thin * 0.7])
    })),
    colour: DARK, bone: 'land', noShadow: true,
  })
  parts.push({ shape: cylinder(TOWER, 1.5, 1.5 + Math.max(0.03, s), 0.15), colour: DARK, bone: 'land' })
  parts.push({ shape: cone([tx, 1.54, tz], [tx, 1.74, tz], 0.16, thin * 0.6), colour: (p) => (Math.floor(p[1] / Math.max(0.04, s * 1.6)) % 2 ? RED : shade(RED, 0.82)), bone: 'land' })
  parts.push({ shape: union(box([tx, 1.8, tz], [thin * 0.6, 0.07, thin * 0.6]), sphere([tx, 1.88, tz], Math.max(0.028, thin))), colour: [0.86, 0.7, 0.3], bone: 'land', noShadow: true })
  // a door in a stone frame and two lit windows in dark frames, on the side the default view sees
  parts.push({ shape: box([tx + 0.125, 0.32, tz + 0.155], [0.068, 0.115, 0.05]), colour: [0.56, 0.53, 0.55], bone: 'land' })
  parts.push({ shape: box([tx + 0.135, 0.3, tz + 0.165], [0.05, 0.09, 0.05]), colour: (p) => (hash(Math.floor((p[0] - p[2]) / Math.max(0.03, s)), 1) > 0.5 ? [0.42, 0.27, 0.18] : [0.34, 0.21, 0.15]), bone: 'land' })
  for (const [y, out, r] of [[0.72, 0.105, 0.035], [1.05, 0.09, 0.03]] as const) {
    parts.push({ shape: box([tx + out, y, tz + out + 0.02], [r + thin, r + 0.015 + thin, r]), colour: DARK, bone: 'land' })
    parts.push({ shape: box([tx + out + 0.012, y, tz + out + 0.032], [r, r + 0.015, r]), colour: LAMP, bone: 'land', glow: true })
  }

  // the lens: a bright bar through the lamp room, turning with the lamp's bone (the light it throws is `lampLights`)
  parts.push({ shape: box([tx, LAMP_Y, tz], [0.17, 0.035, 0.035]), colour: [1, 1, 0.85], bone: 'lamp', glow: true })

  // the keeper's cottage: plastered walls, a tiled roof, a chimney, a door and a lit window
  const [cx, cz] = COTTAGE
  const cy = ground(cx, cz) - 0.06
  const wallTop = cy + 0.25
  parts.push({ shape: box([cx, (cy + wallTop) / 2, cz], [0.15, (wallTop - cy) / 2, 0.11]), colour: (p) => (p[1] < cy + 0.1 ? [0.6, 0.57, 0.56] : hash(Math.floor(p[0] * 30), Math.floor(p[1] * 30)) > 0.85 ? [0.84, 0.81, 0.74] : [0.93, 0.9, 0.82]), bone: 'land' })
  const tile = Math.max(0.04, s * 1.7)
  parts.push({
    shape: roof(COTTAGE, wallTop - 0.01, wallTop + 0.14, 0.175, 0.14),
    colour: (p, n) => (Math.abs(n[0]) > 0.7 ? [0.93, 0.9, 0.82] : Math.floor(p[1] / tile) % 2 ? [0.62, 0.24, 0.2] : hash(Math.floor(p[0] / tile), Math.floor(p[1] / tile)) > 0.5 ? [0.75, 0.3, 0.24] : [0.7, 0.26, 0.22]),
    bone: 'land',
  })
  parts.push({ shape: box([cx - 0.07, wallTop + 0.13, cz], [0.03, 0.07, 0.03]), colour: (p) => (p[1] > wallTop + 0.17 ? [0.3, 0.27, 0.31] : [0.52, 0.42, 0.4]), bone: 'land' })
  parts.push({ shape: box([cx + 0.06, cy + 0.14, cz + 0.105], [0.042 + thin, 0.04 + thin, 0.02]), colour: DARK, bone: 'land' })
  parts.push({ shape: box([cx + 0.06, cy + 0.14, cz + 0.115], [0.042, 0.04, 0.02]), colour: LAMP, bone: 'land', glow: true })
  parts.push({ shape: box([cx - 0.07, cy + 0.11, cz + 0.11], [0.035, 0.075, 0.02]), colour: [0.25, 0.42, 0.5], bone: 'land' })

  // pines that lean in the wind, each on its own bone, and bushes
  TREES.forEach(([x, z, h], i) => {
    const y = ground(x, z) - 0.03
    parts.push({ shape: cylinder([x, z], y, y + h * 0.45, Math.max(0.022, thin)), colour: [0.36, 0.25, 0.18], bone: `tree${i}` })
    parts.push({
      shape: union(cone([x, y + h * 0.3, z], [x, y + h * 0.58, z], h * 0.3, h * 0.1), cone([x, y + h * 0.52, z], [x, y + h * 0.8, z], h * 0.23, h * 0.07), cone([x, y + h * 0.75, z], [x, y + h, z], h * 0.16, thin * 0.6)),
      colour: (p, n) => (n[1] > 0.45 ? (hash(Math.floor(p[0] * 45), Math.floor(p[2] * 45)) > 0.6 ? [0.3, 0.55, 0.3] : [0.22, 0.45, 0.27]) : n[1] < -0.2 ? [0.08, 0.2, 0.16] : [0.14, 0.32, 0.22]),
      bone: `tree${i}`,
    })
  })
  for (const [x, z, r] of [[0.36, 0.22, 0.07], [-0.12, 0.42, 0.06], [0.3, -0.3, 0.08], [-0.2, -0.36, 0.06], [-0.62, 0.36, 0.07], [0.55, 0.05, 0.055]] as const) {
    const y = ground(x, z)
    parts.push({
      shape: displace(ellipsoid([x, y + r * 0.4, z], [r, r * 0.8, r]), (a, b, c) => wobble(a * 9, b * 9, c * 9) * 0.012, 0.012),
      colour: (p, n) => (n[1] > 0.5 ? (hash(Math.floor(p[0] * 50), Math.floor(p[2] * 50)) > 0.7 ? [0.45, 0.7, 0.36] : [0.3, 0.55, 0.3]) : [0.16, 0.36, 0.24]),
      bone: 'land',
    })
  }
  // flowers in the grass: single cells of colour (unlit, so they stay bright at dusk, but under the glow line)
  const flowers: [number, number][] = []
  for (let i = 0; i < 46; i++) {
    const x = -0.75 + hash(i, 7) * 1.4, z = -0.5 + hash(i, 11) * 1.0
    if (onPath(x, z) || ground(x, z) < 0.17 || Math.hypot(x - tx, z - tz) < 0.3 || (Math.abs(x - cx) < 0.2 && Math.abs(z - cz) < 0.16)) continue
    flowers.push([x, z])
  }
  const petal: Vec3[] = [[0.9, 0.82, 0.35], [0.88, 0.88, 0.84], [0.85, 0.4, 0.45]]
  petal.forEach((c, k) => {
    const mine = flowers.filter((_, i) => i % petal.length === k)
    if (mine.length) parts.push({ shape: union(...mine.map(([x, z]) => sphere([x, ground(x, z) + thin, z], thin))), colour: c, bone: 'land', glow: true })
  })

  // the jetty: planks on posts, with a lantern at the far end
  const J = JETTY
  const plank = Math.max(0.05, s * 2)
  parts.push({
    shape: box([J.x, J.y, (J.z0 + J.z1) / 2], [0.075, Math.max(0.014, thin), (J.z1 - J.z0) / 2]),
    colour: (p) => { const f = p[2] / plank - Math.floor(p[2] / plank); return f < 0.25 ? [0.36, 0.25, 0.18] : hash(Math.floor(p[2] / plank), 5) > 0.5 ? [0.66, 0.5, 0.33] : [0.58, 0.43, 0.29] },
    bone: 'land',
  })
  const posts: [number, number][] = []
  for (const z of [0.5, 0.72, 0.92]) for (const side of [-1, 1]) posts.push([J.x + side * 0.075, z])
  parts.push({ shape: union(...posts.map(([x, z]) => cylinder([x, z], -0.05, J.y + (z > 0.9 ? 0.09 : 0.03), Math.max(0.018, thin)))), colour: (p) => (p[1] < 0.03 ? [0.2, 0.26, 0.24] : [0.42, 0.3, 0.21]), bone: 'land' })
  parts.push({ shape: union(box([J.x + 0.075, J.y + 0.2, 0.92], [thin * 0.7, 0.11, thin * 0.7])), colour: DARK, bone: 'land', noShadow: true })
  parts.push({ shape: sphere([J.x + 0.075, J.y + 0.33, 0.92], Math.max(0.03, thin)), colour: [1, 0.8, 0.4], bone: 'land', glow: true })

  // a little boat with a sail and a lantern
  const [bx, by, bz] = BOAT
  parts.push({
    shape: cut(ellipsoid([bx, by, bz], [0.24, 0.085, 0.11]), ellipsoid([bx, by + 0.085, bz], [0.19, 0.07, 0.075])),
    colour: (p, n) => (n[1] > 0.6 && p[1] < by + 0.05 ? [0.62, 0.46, 0.3] : p[1] > by + 0.045 ? [0.86, 0.84, 0.78] : p[1] > by + 0.015 ? [0.7, 0.24, 0.22] : [0.48, 0.3, 0.2]),
    bone: 'boat', noShadow: true,
  })
  parts.push({ shape: box([bx, by + 0.24, bz], [thin, 0.2, thin]), colour: [0.35, 0.24, 0.18], bone: 'boat', noShadow: true })
  parts.push({ shape: box([bx + 0.085, by + 0.27, bz], [0.075, 0.13, thin]), colour: (p) => (Math.floor((p[1] - by) / Math.max(0.045, s * 2)) % 2 ? [0.96, 0.92, 0.8] : [0.84, 0.78, 0.66]), bone: 'boat', noShadow: true })
  parts.push({ shape: sphere([bx - 0.2, by + 0.12, bz], Math.max(0.03, thin)), colour: [1, 0.8, 0.4], bone: 'boat', glow: true })

  // a buoy that nods in the swell
  const [ux, uy, uz] = BUOY
  parts.push({ shape: union(sphere([ux, uy + 0.03, uz], 0.06), cone([ux, uy + 0.06, uz], [ux, uy + 0.17, uz], 0.035, thin * 0.7)), colour: (p) => (p[1] > uy + 0.1 ? [0.9, 0.88, 0.82] : p[1] > uy + 0.045 ? [0.78, 0.22, 0.22] : [0.9, 0.88, 0.82]), bone: 'buoy', noShadow: true })
  parts.push({ shape: sphere([ux, uy + 0.2, uz], Math.max(0.024, thin)), colour: [1, 0.5, 0.35], bone: 'buoy', glow: true })

  // smoke from the chimney: puffs that rise, swell and thin out (poseDiorama)
  for (let i = 0; i < SMOKE; i++) parts.push({ shape: sphere([cx - 0.07, 0.62, cz], Math.max(0.04, thin * 1.5)), colour: [0.62, 0.64, 0.7], bone: `smoke${i}`, glow: true })

  // gulls circling the tower: a body on the pivot bone and a wing on each wing bone
  GULLS.forEach((g, i) => {
    const c: Vec3 = [tx + g.r, g.y, tz]
    // unlit, so they stay white against the sky whichever way they face
    parts.push({ shape: ellipsoid(c, [thin * 1.1, thin * 1.1, 0.07]), colour: GULL, bone: `gull${i}`, glow: true })
    parts.push({ shape: box([c[0] + 0.07, c[1], c[2]], [0.07, thin, 0.035]), colour: (p) => (p[0] > c[0] + 0.115 ? [0.5, 0.54, 0.64] : GULL), bone: `gull${i}L`, glow: true })
    parts.push({ shape: box([c[0] - 0.07, c[1], c[2]], [0.07, thin, 0.035]), colour: (p) => (p[0] < c[0] - 0.115 ? [0.5, 0.54, 0.64] : GULL), bone: `gull${i}R`, glow: true })
  })

  // clouds, the moon (with a few craters) and stars
  CLOUDS.forEach((c, i) => {
    const puff = union(ellipsoid(c, [0.34, 0.1, 0.16]), sphere([c[0] - 0.12, c[1] + 0.07, c[2]], 0.13), sphere([c[0] + 0.1, c[1] + 0.09, c[2]], 0.15), sphere([c[0] + 0.26, c[1] + 0.03, c[2]], 0.09))
    parts.push({ shape: puff, colour: (p) => (p[1] > c[1] + 0.1 ? [0.88, 0.9, 0.89] : p[1] > c[1] + 0.02 ? [0.81, 0.9, 0.91] : [0.44, 0.64, 0.85]), bone: `cloud${i}`, glow: true })
  })
  const moon: Vec3 = [-1.75, 2.1, -1.0]
  parts.push({
    shape: sphere(moon, 0.17),
    colour: (p) => ([[0.05, 0.04, 0.06], [-0.07, -0.05, 0.05], [0.02, -0.09, 0.04]].some(([a, b, r]) => Math.hypot(p[0] - moon[0] - a, p[1] - moon[1] - b) < r) ? [0.8, 0.84, 0.9] : MOON),
    bone: 'land', glow: true,
  })
  const stars: Vec3[] = [[-0.6, 2.6, -1.6], [0.2, 2.75, -1.6], [1.3, 2.55, -1.6], [-1.6, 1.7, -1.3], [1.6, 1.9, -1.5], [0.6, 2.05, -1.7], [-0.2, 2.2, -1.7], [1.05, 2.9, -1.4], [-1.0, 2.9, -1.5], [-1.65, 2.5, -0.6], [1.7, 2.6, -0.5], [-1.2, 2.2, -1.6], [0.9, 1.6, -1.7], [-0.9, 1.5, -1.7], [1.7, 1.3, -1.2], [-1.7, 1.1, -0.9], [0.4, 3.0, -1.2], [-0.3, 1.7, -1.75]]
  // one part each: a union's box would span the whole sky, and the builder walks every cell of it
  stars.forEach((p, i) => parts.push({ shape: sphere(p, s * 0.9), colour: hash(i, 2) > 0.6 ? [0.8, 0.88, 0.9] : [1, 1, 0.9], bone: 'land', glow: true }))

  // foam: thin streaks that swell and fade as they drift (poseDiorama)
  FOAM.forEach((f, i) => {
    parts.push({ shape: ellipsoid([f[0], f[1] + 0.01, f[2]], [0.15, Math.max(0.02, thin), Math.max(0.028, thin)]), colour: FOAM_C, bone: `foam${i}`, glow: true })
  })

  return { bones: dioramaBones(), parts, spacing: s, light: { dir: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 } }
}

export const DETAIL = [
  { id: 'chunky', label: 'Chunky', spacing: 0.042 },
  { id: 'medium', label: 'Medium', spacing: 0.03 },
  { id: 'fine', label: 'Fine', spacing: 0.022 },
  { id: 'finest', label: 'Finest', spacing: 0.017 },
] as const

/**
 * The island is small beside the other scenes' subjects, so it is cut on a finer grid than the detail level asks for:
 * a brick, a tile or a window then gets as many cells as a scale on the dragon does.
 */
export const FINER = 0.72

export function makeDiorama(spacing = 0.03): Built {
  return buildVoxels(dioramaSpec(spacing * FINER))
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

  // the pines lean with the wind and spring back, each a little out of step
  TREES.forEach((_, i) => { sk.setRotation(sk.index(`tree${i}`), axisAngle([0, 0, 1], -0.03 - Math.sin(u * 5 * TAU + i * 1.7) * 0.035)) })

  // the buoy nods and rides the swell
  const buoy = sk.index('buoy')
  sk.offset[buoy * 3 + 1] = Math.sin(u * 4 * TAU + 2) * 0.012
  sk.setRotation(buoy, mulQ(axisAngle([0, 0, 1], Math.sin(u * 5 * TAU) * 0.22), axisAngle([1, 0, 0], Math.sin(u * 4 * TAU + 0.8) * 0.15)))

  // smoke: each puff rises from the chimney, drifts downwind and swells, then starts again
  for (let i = 0; i < SMOKE; i++) {
    const b = sk.index(`smoke${i}`)
    const life = (u * 4 + i / SMOKE) % 1
    sk.offset[b * 3] = life * life * 0.22
    sk.offset[b * 3 + 1] = life * 0.3
    sk.size[b] = Math.sin(Math.PI * Math.min(1, life * 1.15)) ** 0.7 * (0.5 + life * 0.9)
  }

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
  { id: 'dusk', label: 'Dusk', colours: hex('#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45', '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52', '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0') },
  { id: 'ember', label: 'Ember', colours: hex('#120a06', '#2b1608', '#4d260b', '#7a3d0d', '#a85d12', '#d98a1f', '#f5b83d', '#ffe08a', '#fff6d6', '#cfe9f2') },
  { id: 'pocket', label: 'Pocket', colours: hex('#0f2a1d', '#2f5d3a', '#7fae5a', '#d8e8a0') },
  { id: 'ink', label: 'Ink', colours: hex('#101018', '#3a3a52', '#8a8aa6', '#e8e6f0') },
  { id: 'none', label: 'Scene colours', colours: [] },
]
