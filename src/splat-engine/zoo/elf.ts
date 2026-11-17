import { Blobs, type Vec3 } from '../../splat-core/blobs.ts'
import { mirror, mix, spots } from '../body.ts'
import { growFur, type FurryPart } from '../fur.ts'
import { emptySkin, posedPoint, rotate, type Bone, type Skeleton } from '../rig.ts'
import { X, Y, Z, aim, conj, dir, env, set, turn } from '../posing.ts'
import { buildSculpt, flatten, joinBuilt, membrane, sculptToCount, smooth, toCount, type SculptPart, type SculptSpec, type Sculpted } from '../sculpt.ts'
import { box, cone, cut, displace, ellipsoid, type Shape } from '../voxel.ts'
import { between, type SwingSpec } from '../swing.ts'
import type { Capsule } from '../xpbd.ts'
import type { Species } from './species.ts'

/**
 * An elf, standing, facing +z: a humanoid of 29 bones (a spine of three, a
 * neck and head, arms with hands and fingers, legs with feet and toes, a plait
 * of hair and a cloak of two each side). The Creature page, Forest Walk and
 * Dungeon Run's hero are all this one elf.
 */

const SIDES = [['l', 1], ['r', -1]] as const
const sided = (x: number, p: Vec3): Vec3 => (x > 0 ? p : mirror(p))

/** The elf's bones. A game may add its own to the end (Dungeon Run's hero carries a sword and an orb). */
export const ELF_BONES: Bone[] = [
  { name: 'hips', parent: -1, head: [0, 0.98, 0] },
  { name: 'spine', parent: 0, head: [0, 1.1, 0] },
  { name: 'chest', parent: 1, head: [0, 1.28, 0] },
  { name: 'neck', parent: 2, head: [0, 1.5, 0] },
  { name: 'head', parent: 3, head: [0, 1.6, 0.01], tail: [0, 1.86, 0.01] },
  { name: 'hair1', parent: 4, head: [0, 1.7, -0.1] },
  { name: 'hair2', parent: 5, head: [0, 1.48, -0.13], tail: [0, 1.22, -0.14] },
]
for (const [s, x] of SIDES) {
  const clav = ELF_BONES.length
  ELF_BONES.push(
    { name: `${s}Shoulder`, parent: 2, head: sided(x, [0.04, 1.44, 0]) },
    { name: `${s}Arm`, parent: clav, head: sided(x, [0.2, 1.44, -0.01]) },
    { name: `${s}Forearm`, parent: clav + 1, head: sided(x, [0.27, 1.17, -0.02]) },
    { name: `${s}Hand`, parent: clav + 2, head: sided(x, [0.31, 0.94, 0.01]) },
    { name: `${s}Fingers`, parent: clav + 3, head: sided(x, [0.325, 0.87, 0.02]), tail: sided(x, [0.335, 0.79, 0.025]) },
  )
}
for (const [s, x] of SIDES) {
  const thigh = ELF_BONES.length
  ELF_BONES.push(
    { name: `${s}Thigh`, parent: 0, head: sided(x, [0.1, 0.94, 0]) },
    { name: `${s}Shin`, parent: thigh, head: sided(x, [0.105, 0.52, 0.015]) },
    { name: `${s}Foot`, parent: thigh + 1, head: sided(x, [0.11, 0.09, -0.02]) },
    { name: `${s}Toe`, parent: thigh + 2, head: sided(x, [0.11, 0.025, 0.1]), tail: sided(x, [0.11, 0.02, 0.18]) },
  )
}
for (const [s, x] of SIDES) {
  const cape = ELF_BONES.length
  ELF_BONES.push(
    { name: `${s}Cape1`, parent: 2, head: sided(x, [0.12, 1.42, -0.13]) },
    { name: `${s}Cape2`, parent: cape, head: sided(x, [0.16, 1.05, -0.18]), tail: sided(x, [0.2, 0.62, -0.22]) },
  )
}

interface Colors { tunic: Vec3; trim: Vec3; cape: Vec3; hair: Vec3; skin: Vec3; mantle: Vec3 }
const LOOKS: Record<string, Colors & { label: string }> = {
  forest: { label: 'Forest', tunic: [0.2, 0.46, 0.28], trim: [0.86, 0.7, 0.3], cape: [0.13, 0.3, 0.26], hair: [0.94, 0.84, 0.56], skin: [0.95, 0.79, 0.67], mantle: [0.62, 0.56, 0.46] },
  dusk: { label: 'Dusk', tunic: [0.32, 0.25, 0.55], trim: [0.82, 0.84, 0.9], cape: [0.16, 0.14, 0.3], hair: [0.88, 0.9, 0.94], skin: [0.72, 0.56, 0.48], mantle: [0.84, 0.86, 0.92] },
  autumn: { label: 'Autumn', tunic: [0.66, 0.3, 0.14], trim: [0.94, 0.78, 0.36], cape: [0.4, 0.2, 0.1], hair: [0.52, 0.22, 0.1], skin: [0.96, 0.82, 0.72], mantle: [0.42, 0.27, 0.16] },
}
const LEATHER: Vec3 = [0.36, 0.22, 0.12], DARK_LEATHER: Vec3 = [0.2, 0.13, 0.08], LEGGINGS: Vec3 = [0.3, 0.27, 0.2], WHITE: Vec3 = [0.95, 0.95, 0.92], LIPS: Vec3 = [0.75, 0.42, 0.4]

/**
 * The detailed elf, cut the way the pixel scenes are (sculpt.ts) on the same bones, in three cuts joined into one:
 * the face on a fine grid, so the eyes, brows and lips painted on it hold; the hair on a coarse one, under strands
 * (fur.ts) that run back from the brow and down the plait; and the body, in plain cloth whose folds are shapes, not
 * stripes: a pleated skirt, a cloak that hangs in folds from a mantle of fur, a belt, bracers and strapped boots.
 */
const IRIS: Vec3 = [0.16, 0.5, 0.62]
const SHARE = { face: 0.2, hair: 0.05, strands: 0.17, mantle: 0.08 }
const ROWS = [1.43, 1.24, 1.05, 0.83, 0.62]

/** The hair's cap: the face's cut drops whatever of the skull lies under it. */
function cap(): Shape {
  return smooth(0.02, ellipsoid([0, 1.76, -0.012], [0.1, 0.088, 0.116]), ellipsoid([0, 1.7, -0.058], [0.098, 0.105, 0.075]),
    ellipsoid([0.035, 1.8, 0.07], [0.052, 0.024, 0.036]), ellipsoid([-0.04, 1.795, 0.068], [0.046, 0.022, 0.036]))
}

function faceSpec(c: Colors, s: number, bones: Bone[]): SculptSpec {
  const fat = (r: number) => Math.max(r, s * 0.6)
  const brow = mix(c.hair, [0.1, 0.06, 0.03], 0.55), lash: Vec3 = [0.12, 0.07, 0.05]
  // the features are painted on the skin, so they hold their place whatever the grid
  const face = (p: Vec3, n: Vec3): Vec3 => {
    const ax = Math.abs(p[0]), y = p[1]
    if (n[2] > 0.25 && p[2] > 0.05) {
      // eyes that slant up toward the ears: white, a colored iris, a dark pupil, a lash line over the top
      const mid = 1.704 + (ax - 0.035) * 0.22
      const e = ((ax - 0.035) / 0.02) ** 2 + ((y - mid) / 0.0105) ** 2
      if (e < 1) {
        const d = Math.hypot(ax - 0.0355, y - mid - 0.001)
        return d < 0.0036 ? [0.03, 0.03, 0.05] : d < 0.0088 ? (y > mid + 0.005 ? mix(IRIS, [0, 0, 0], 0.4) : IRIS) : WHITE
      }
      if (e < 1.75 && y > mid + 0.002) return lash
      if (ax > 0.012 && ax < 0.062 && Math.abs(y - (1.7335 + (ax - 0.012) * 0.2 - Math.max(0, ax - 0.045) * 0.5)) < 0.0042) return brow
      const lip = (p[0] / 0.0215) ** 2 + ((y - 1.6395) / 0.0068) ** 2
      if (lip < 1) return y > 1.6405 ? mix(LIPS, [0.3, 0.1, 0.1], 0.3) : LIPS
      return mix(c.skin, LIPS, 0.2 * Math.max(0, 1 - Math.hypot(ax - 0.05, y - 1.668) / 0.024))
    }
    return c.skin
  }
  const parts: SculptPart[] = [
    // skull, jaw, cheeks and a small nose as one skin
    {
      shape: smooth(0.022, ellipsoid([0, 1.71, 0.015], [0.092, 0.115, 0.108]), ellipsoid([0, 1.652, 0.04], [0.064, 0.06, 0.072]), cone([0, 1.722, 0.106], [0, 1.687, 0.126], fat(0.008), fat(0.012)),
        ellipsoid([0.045, 1.675, 0.078], [0.03, 0.025, 0.03]), ellipsoid([-0.045, 1.675, 0.078], [0.03, 0.025, 0.03])),
      color: face, bones: ['head'],
    },
    // the neck runs up inside the skull, so it never shows a rounded end under the jaw
    { shape: cone([0, 1.66, 0.005], [0, 1.4, 0], 0.044, 0.055), color: c.skin, bones: ['head', 'neck', 'chest'] },
  ]
  for (const [, x] of SIDES) {
    // long pointed ears, sweeping back, pink within
    parts.push({ shape: flatten(cone(sided(x, [0.085, 1.7, 0.0]), sided(x, [0.195, 1.815, -0.06]), 0.03, fat(0.005)), 0.5, -0.03), color: (p, n) => (n[2] > 0.2 && Math.abs(p[0]) > 0.1 && Math.abs(p[0]) < 0.155 ? mix(c.skin, LIPS, 0.4) : c.skin), bones: ['head'] })
  }
  return { bones, parts, blend: 0.07, light: { ambient: 0.7, shadow: 0.4 } }
}

function hairSpec(c: Colors, s: number, bones: Bone[]): SculptSpec & { parts: FurryPart[] } {
  const fat = (r: number) => Math.max(r, s * 0.6)
  const parts: FurryPart[] = [
    // swept back from the brow and down over the nape
    {
      shape: cap(), color: c.hair, bones: ['head'],
      fur: { length: 0.06, flow: (p) => (p[2] > 0.045 ? [p[0] * 6, -0.5, 1] : [p[0] * 2, -1, -0.9]), lift: 0.12, wild: 0.22, long: (p) => (p[2] > 0.045 ? 0.6 : 1), under: 0.78 },
    },
    // the plait: a row of knots down the back, strands crossing one way and then the other, tied off in the trim color
    ...Array.from({ length: 6 }, (_, k): FurryPart => ({
      shape: ellipsoid([0.01 * (k % 2 ? 1 : -1), 1.655 - k * 0.058, -0.103 - k * 0.012], [0.044 - k * 0.003, 0.04, 0.034 - k * 0.002]), color: c.hair, bones: ['head', 'hair1', 'hair2'],
      fur: { length: 0.035, flow: [k % 2 ? 1 : -1, -0.8, 0], lift: 0.1, wild: 0.2, density: 1.3, under: 0.7 },
    })),
    { shape: cone([0, 1.335, -0.168], [0, 1.31, -0.17], 0.027), color: c.trim, bones: ['hair2'] },
    { shape: cone([0, 1.31, -0.17], [0, 1.25, -0.176], 0.022, fat(0.008)), color: c.hair, bones: ['hair2'], fur: { length: 0.04, flow: [0, -1, -0.1], lift: 0.25, wild: 0.4, density: 1.5 } },
  ]
  for (const [, x] of SIDES) {
    // a lock in front of each ear
    parts.push({ shape: cone(sided(x, [0.084, 1.76, 0.04]), sided(x, [0.079, 1.61, 0.048]), 0.02, fat(0.007)), color: c.hair, bones: ['head'], fur: { length: 0.05, flow: [0, -1, 0], lift: 0.1, wild: 0.2 } })
  }
  return { bones, parts, blend: 0.07, light: { ambient: 0.7, shadow: 0.4 } }
}

function bodySpec(c: Colors, s: number, bones: Bone[]): SculptSpec & { parts: FurryPart[] } {
  const fat = (r: number) => Math.max(r, s * 0.6)
  const lit = (v: Vec3, k = 1.2): Vec3 => [Math.min(1, v[0] * k), Math.min(1, v[1] * k), Math.min(1, v[2] * k)]
  const tunicC = lit(c.tunic), dark = mix(tunicC, [0, 0, 0], 0.32)
  /** Cloth: its color, clouded a little so a broad surface is not flat. */
  const cloth = (col: Vec3, p: Vec3): Vec3 => mix(col, [0, 0, 0], 0.1 * spots(p, 23))
  // the tunic: open in a V at the neck with a trimmed edge, laced below it, a strap across for the quiver
  const tunic = (p: Vec3, n: Vec3): Vec3 => {
    if (n[2] > 0.25) {
      const v = Math.abs(p[0]) - (p[1] - 1.3) * 0.42
      if (p[1] > 1.3 && v < 0) return c.skin
      if (p[1] > 1.285 && v < 0.016) return c.trim
      if (p[1] > 1.13 && p[1] < 1.29 && Math.abs(p[0]) < 0.011) return dark
      if (p[1] > 1.13 && p[1] < 1.29 && Math.abs(p[0]) < 0.034 && Math.sin(p[1] * 150) > 0.5) return c.trim
    }
    if (Math.abs(p[0] * 0.8 + (p[1] - 1.24) * 0.62) < 0.018) return LEATHER
    return cloth(tunicC, p)
  }
  const PLEATS = 14
  // the skirt of it: pleats, a hem in the trim color and a row of leaves stitched above the hem
  const skirt = (p: Vec3): Vec3 => {
    if (p[1] < 0.758) return c.trim
    const a = Math.atan2(p[0], p[2])
    if (p[1] > 0.78 && p[1] < 0.835 && Math.abs(Math.sin(a * 9)) > 1 - (0.835 - p[1]) * 9) return c.trim
    return cloth(mix(tunicC, dark, 0.5 * Math.max(0, -Math.sin(a * PLEATS)) * Math.min(1, (0.99 - p[1]) / 0.12)), p)
  }
  const parts: FurryPart[] = [
    // body: a chest and a narrower waist under the tunic, belted, flaring to a pleated skirt
    { shape: flatten(smooth(0.06, ellipsoid([0, 1.32, 0], [0.168, 0.13, 0.155]), cone([0, 1.02, 0], [0, 1.25, 0], 0.13, 0.136)), 0.66), color: tunic, bones: ['hips', 'spine', 'chest'] },
    { shape: flatten(cone([0, 1.0, 0], [0, 1.045, 0], 0.138, 0.14), 0.72), color: (p) => (Math.abs(p[1] - 1.0225) > 0.016 ? DARK_LEATHER : LEATHER), bones: ['hips', 'spine'] },
    { shape: box([0, 1.022, 0.1], [0.03, 0.026, fat(0.012)], 0.006), color: (p) => (Math.abs(p[0]) < 0.014 && Math.abs(p[1] - 1.022) < 0.011 ? DARK_LEATHER : c.trim), bones: ['hips', 'spine'] },
    { shape: ellipsoid([0.135, 0.965, 0.03], [0.035, 0.05, 0.045]), color: (p) => (p[1] > 0.985 ? DARK_LEATHER : LEATHER), bones: ['hips'] },
    {
      shape: cut(displace(flatten(cone([0, 0.99, 0], [0, 0.72, 0], 0.132, 0.205), 0.8), (x, y, z) => 0.009 * Math.sin(Math.atan2(x, z) * PLEATS) * Math.max(0, Math.min(1, (0.99 - y) / 0.2)), 0.009), box([0, 0.525, 0], [0.4, 0.21, 0.4])),
      color: (p, n) => (n[1] < -0.6 && p[1] < 0.75 ? mix(dark, [0, 0, 0], 0.4) : skirt(p)), bones: ['hips', 'lThigh', 'rThigh'],
    },
    // a low collar round the neck
    { shape: cone([0, 1.41, 0], [0, 1.475, 0.002], 0.07, 0.058), color: (p) => (p[1] > 1.462 ? c.trim : cloth(tunicC, p)), bones: ['chest', 'neck'] },
    // a leaf brooch at the throat, and the cords that hold the cloak to it
    { shape: ellipsoid([0, 1.4, 0.1], [0.02, 0.026, fat(0.009)]), color: [0.3, 0.9, 0.5], bones: ['chest'], glow: true },
    // a quiver slung across the back, outside the cloak, with three arrows in it
    { shape: cone([-0.1, 1.06, -0.235], [0.14, 1.5, -0.19], 0.045, 0.05), color: (p) => (Math.abs(p[1] - 1.12) < 0.014 || Math.abs(p[1] - 1.44) < 0.014 ? c.trim : LEATHER), bones: ['chest', 'spine'] },
    ...[[-0.02, 0], [0.012, 0.018], [0.0, -0.02]].flatMap(([dx, dz], k): FurryPart[] => {
      const a: Vec3 = [0.14 + dx, 1.5, -0.19 + dz], b: Vec3 = [0.19 + dx * 1.6, 1.6 + k * 0.012, -0.18 + dz * 1.6]
      return [
        { shape: cone(a, b, fat(0.006)), color: [0.8, 0.7, 0.5], bones: ['chest'], noShadow: true },
        { shape: ellipsoid(mix(a, b, 0.72), [0.018, 0.034, fat(0.008)]), color: k === 1 ? [0.85, 0.25, 0.2] : WHITE, bones: ['chest'], noShadow: true },
      ]
    }),
    // a mantle of fur over the shoulders and across the back, which the cloak hangs from
    {
      shape: smooth(0.05, ellipsoid([0.15, 1.455, -0.02], [0.095, 0.055, 0.1]), ellipsoid([-0.15, 1.455, -0.02], [0.095, 0.055, 0.1]), ellipsoid([0, 1.45, -0.085], [0.16, 0.062, 0.052])),
      color: c.mantle, bones: ['chest'], group: 'mantle',
      fur: { length: 0.055, flow: (p) => [p[0] * 3, -1, p[2] < -0.05 ? -0.8 : 0.3], lift: 0.5, wild: 0.6, density: 1 },
    },
  ]
  for (const [side, x] of SIDES) {
    const at = (p: Vec3) => sided(x, p)
    const elbow = at([0.27, 1.17, -0.02]), wrist = at([0.31, 0.94, 0.01])
    parts.push(
      { shape: cone(at([0.13, 1.47, 0.05]), [0, 1.405, 0.1], fat(0.007)), color: c.trim, bones: ['chest'] },
      // shoulder and sleeve, with a band at the elbow, and a bracer of leather under two straps
      { shape: smooth(0.02, ellipsoid(at([0.175, 1.43, -0.01]), [0.07, 0.065, 0.07]), cone(at([0.2, 1.42, -0.01]), elbow, 0.05, 0.042)), color: (p) => (Math.abs(p[1] - 1.2) < 0.013 ? c.trim : cloth(tunicC, p)), bones: ['chest', `${side}Shoulder`, `${side}Arm`, `${side}Forearm`] },
      { shape: cone(elbow, wrist, 0.045, 0.036), color: (p) => (p[1] >= 1.09 ? cloth(tunicC, p) : Math.abs(p[1] - 1.05) < 0.01 || Math.abs(p[1] - 0.975) < 0.01 ? c.trim : LEATHER), bones: [`${side}Arm`, `${side}Forearm`, `${side}Hand`] },
      { shape: smooth(0.008, ellipsoid(at([0.315, 0.905, 0.015]), [0.022, 0.045, 0.038]), cone(at([0.325, 0.87, 0.02]), at([0.335, 0.795, 0.025]), 0.019, 0.012)), color: c.skin, bones: [`${side}Hand`, `${side}Fingers`] },
      { shape: cone(at([0.31, 0.91, 0.04]), at([0.3, 0.86, 0.065]), fat(0.011), fat(0.008)), color: c.skin, bones: [`${side}Hand`] },
    )
    const knee = at([0.105, 0.52, 0.015]), ankle = at([0.11, 0.09, -0.02])
    parts.push(
      { shape: cone(at([0.09, 0.9, 0]), knee, 0.078, 0.055), color: (p) => cloth(LEGGINGS, p), bones: ['hips', `${side}Thigh`, `${side}Shin`] },
      // boots to the knee: a turned-down cuff, two straps, a darker foot and a sole
      {
        shape: smooth(0.012, cone(knee, ankle, 0.06, 0.042), cone([knee[0], knee[1] - 0.005, knee[2]], [knee[0], knee[1] - 0.06, knee[2]], 0.07, 0.066)),
        color: (p) => (p[1] > 0.455 ? mix(LEATHER, c.trim, p[1] > 0.47 ? 0.12 : 0.6) : Math.abs(p[1] - 0.34) < 0.012 || Math.abs(p[1] - 0.22) < 0.012 ? DARK_LEATHER : LEATHER), bones: [`${side}Thigh`, `${side}Shin`, `${side}Foot`],
      },
      { shape: flatten(smooth(0.012, cone(at([0.11, 0.07, -0.05]), at([0.11, 0.045, 0.12]), 0.046, 0.04), cone(at([0.11, 0.04, 0.11]), at([0.11, 0.034, 0.185]), 0.037, 0.022)), 1), color: (p) => (p[1] < 0.018 ? [0.1, 0.07, 0.05] : DARK_LEATHER), bones: [`${side}Shin`, `${side}Foot`, `${side}Toe`] },
    )
    // Half the cloak: from under the mantle down the back in folds that deepen toward the hem, wrapping forward a
    // little at the shoulder. Weighted to its two bones so it sways, and so the walk can hold it clear of the legs.
    const WIDE = [0.17, 0.2, 0.225, 0.25, 0.27], BACK = [-0.115, -0.155, -0.19, -0.215, -0.24], FOLD = [0, 0.007, 0.013, 0.019, 0.025], COLS = 4
    const grid = ROWS.map((y, r) => Array.from({ length: COLS + 1 }, (_, k): Vec3 => at([(WIDE[r] * k) / COLS, y, BACK[r] + FOLD[r] * Math.cos(k * Math.PI) + 0.035 * (k / COLS) ** 2 * (1 - r / 4)])))
    const tris: Vec3[][] = []
    for (let r = 0; r < ROWS.length - 1; r++) for (let k = 0; k < COLS; k++) tris.push([grid[r][k], grid[r][k + 1], grid[r + 1][k + 1]], [grid[r][k], grid[r + 1][k + 1], grid[r + 1][k]])
    parts.push({
      shape: membrane(tris, fat(0.011)),
      color: (p, n) => (p[1] < 0.66 ? c.trim : n[2] > 0.3 ? mix(c.cape, [0, 0, 0], 0.35) : cloth(lit(c.cape, 1.1), p)),
      bones: ['chest', `${side}Cape1`, `${side}Cape2`], group: 'cape', noShadow: true,
    })
  }
  return { bones, parts, blend: 0.07, light: { ambient: 0.66, shadow: 0.45 } }
}

/** `b` without the blobs `drop` picks out. */
function without(b: Sculpted, drop: (x: number, y: number, z: number) => boolean): Sculpted {
  const keep: number[] = []
  for (let i = 0; i < b.blobs.count; i++) if (!drop(b.blobs.center[i * 3], b.blobs.center[i * 3 + 1], b.blobs.center[i * 3 + 2])) keep.push(i)
  const blobs = new Blobs(keep.length)
  const skin = emptySkin(keep.length)
  const partOf = new Uint16Array(keep.length)
  keep.forEach((i, k) => {
    blobs.push(b.blobs.get(i))
    skin.joints.set(b.skin.joints.subarray(i * 4, i * 4 + 4), k * 4)
    skin.weights.set(b.skin.weights.subarray(i * 4, i * 4 + 4), k * 4)
    partOf[k] = b.partOf[i]
  })
  return { ...b, blobs, skin, partOf }
}

/** The detailed elf, at exactly `count` blobs. `bones` may add to the elf's own (the hero's sword and orb). */
export function makeElf(count = 60000, look = 'forest', bones: Bone[] = ELF_BONES) {
  const c = LOOKS[look] ?? LOOKS.forest
  const hidden = cap()
  const face = toCount((s) => without(buildSculpt(faceSpec(c, s, bones), s), (x, y, z) => hidden.sdf(x, y, z) < -0.012), count * SHARE.face, 0.012)
  const scalp = sculptToCount((s) => hairSpec(c, s, bones), count * SHARE.hair, 0.02)
  const hair = growFur(scalp, hairSpec(c, scalp.spacing, bones).parts, Math.round(count * (SHARE.hair + SHARE.strands)))
  const cloth = sculptToCount((s) => bodySpec(c, s, bones), count * (1 - SHARE.face - SHARE.hair - SHARE.strands - SHARE.mantle), 0.04)
  const body = growFur(cloth, bodySpec(c, cloth.spacing, bones).parts, count - face.blobs.count - hair.blobs.count)
  const b = joinBuilt(joinBuilt(body, hair), face)
  return { blobs: b.blobs, skin: b.skin, skeleton: body.skeleton }
}

/** The arms hang from an A-pose, so every clip starts by bringing them down to the sides. */
function relax(sk: Skeleton) {
  for (const [s, x] of SIDES) {
    aim(sk, `${s}Arm`, dir([0.12 * x, -1, -0.02]))
    aim(sk, `${s}Forearm`, dir([0.04 * x, -1, 0.12]))
    aim(sk, `${s}Hand`, dir([0.02 * x, -1, 0.05]))
    set(sk, `${s}Fingers`, X, -0.15)
  }
}

/** Hair and cloak trailing behind whatever the body did, with a lag. `lift` is how far the cloak streams back. */
function trail(sk: Skeleton, sway: number, lift: number) {
  set(sk, 'hair1', X, -0.08 * lift)
  turn(sk, 'hair1', Z, 0.12 * sway)
  set(sk, 'hair2', Z, 0.1 * sway)
  for (const [s] of SIDES) {
    set(sk, `${s}Cape1`, X, 0.04 * lift)
    set(sk, `${s}Cape2`, X, 0.1 * lift)
    turn(sk, `${s}Cape2`, Z, 0.08 * sway)
  }
  clearCloak(sk)
}

// The cloak from the side, in the chest's own frame: it hangs from Cape1's head, folds at Cape2's, and its inner face
// at rest runs from FOLD_AT down to the hem at a slant of HANGS.
const TOP: [y: number, z: number] = [1.42, -0.13], FOLD_AT: [y: number, z: number] = [1.05, -0.165], LOWER = 0.44, HANGS = Math.atan2(0.03, 0.43)
/** Leg bones as tubes: from this bone's head to the next one's, with a radius at each end. */
const LEG = [['Thigh', 'Shin', 0.08, 0.062], ['Shin', 'Foot', 0.064, 0.046], ['Foot', 'Toe', 0.05, 0.04]] as const

/**
 * Lifts the lower half of the cloak just far enough back that no part of either leg passes through it, whatever
 * the legs are doing. Call it once the legs and the cloak are posed (the walk does; a game that blends poses calls
 * it again after the blend). It reads the pose and leaves it updated.
 */
export function clearCloak(sk: Skeleton) {
  sk.update()
  const chest = sk.index('chest')
  const back = conj(sk.quat.subarray(chest * 4, chest * 4 + 4))
  const origin = posedPoint(sk, chest, [0, 0, 0])
  const angle = (name: string) => { const b = sk.index(name); return 2 * Math.atan2(sk.rotation[b * 4], sk.rotation[b * 4 + 3]) }
  // how far each side's leg needs the lower cloak swung back, as its angle from straight down
  const need = SIDES.map(([s]) => {
    const upper = angle(`${s}Cape1`)
    const hy = TOP[0] - (TOP[0] - FOLD_AT[0]) * Math.cos(upper) + (TOP[1] - FOLD_AT[1]) * Math.sin(upper)
    const hz = TOP[1] - (TOP[1] - FOLD_AT[1]) * Math.cos(upper) - (TOP[0] - FOLD_AT[0]) * Math.sin(upper)
    let most = 0
    for (const [from, to, r0, r1] of LEG) {
      const a = sk.index(`${s}${from}`), b = sk.index(`${s}${to}`)
      for (let k = 0; k <= 4; k++) {
        const u = k / 4
        const w: Vec3 = [0, 1, 2].map((i) => sk.posedHead[a * 3 + i] * (1 - u) + sk.posedHead[b * 3 + i] * u - origin[i]) as Vec3
        const p = rotate(back, w)
        const dy = hy - p[1], dz = hz - (p[2] - (r0 + (r1 - r0) * u) - 0.035)
        if (dy < 0.03) continue
        // what is further off than the cloak is long is out of its way, past the hem: fade its say out over a stretch
        const far = Math.min(1, Math.max(0, (Math.hypot(dy, dz) - LOWER - 0.08) / 0.16))
        most = Math.max(most, Math.atan2(dz, dy) * (1 - far * far * (3 - 2 * far)))
      }
    }
    return most
  })
  SIDES.forEach(([s], i) => {
    // the two halves are one cloak: each goes most of the way with the other
    const want = Math.max(need[i], 0.7 * need[1 - i])
    const has = HANGS + angle(`${s}Cape1`) + angle(`${s}Cape2`)
    if (want > has) turn(sk, `${s}Cape2`, X, want - has)
  })
  sk.update()
}

/** Standing: breathing, the weight shifting from foot to foot, a look round. Loops every four seconds. */
export function elfIdle(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / 4) * Math.PI * 2
  const breath = Math.sin(ph * 2)
  sk.offset.set([0.012 * Math.sin(ph), 0.004 * breath, 0], 0)
  set(sk, 'hips', Z, 0.025 * Math.sin(ph))
  set(sk, 'chest', X, -0.02 * breath)
  turn(sk, 'chest', Z, -0.03 * Math.sin(ph))
  set(sk, 'head', Y, 0.35 * Math.sin(ph) * env((t % 4) / 4, 0.1, 0.3, 0.6, 0.85))
  for (const [s, x] of SIDES) set(sk, `${s}Thigh`, Z, -0.025 * x * Math.sin(ph))
  relax(sk)
  trail(sk, Math.sin(ph - 0.6), 0.2 * breath)
  sk.update()
}

const STRIDE = 1.1

/**
 * A walk on the spot: legs swinging from the hip with the knee folding as
 * the foot comes through, arms swinging against them, the body rising over
 * each step and turning against the hips.
 */
export function elfWalk(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / STRIDE) * Math.PI * 2
  sk.offset.set([0, 0.025 * Math.cos(ph * 2) - 0.015, 0], 0)
  set(sk, 'hips', Y, 0.1 * Math.sin(ph))
  set(sk, 'spine', Y, -0.08 * Math.sin(ph))
  set(sk, 'chest', Y, -0.06 * Math.sin(ph))
  turn(sk, 'chest', X, 0.04)
  set(sk, 'head', Y, 0.08 * Math.sin(ph))
  relax(sk)
  for (const [s, x] of SIDES) {
    const side = x > 0 ? 0 : Math.PI
    const swing = Math.sin(ph + side)
    // the thigh swings forward and back; the knee folds while the foot passes under the body
    set(sk, `${s}Thigh`, X, -0.45 * swing)
    set(sk, `${s}Shin`, X, 0.85 * Math.max(0, Math.cos(ph + side - 0.4)) ** 1.5)
    set(sk, `${s}Foot`, X, -0.25 * Math.max(0, -swing))
    set(sk, `${s}Toe`, X, -0.35 * Math.max(0, Math.sin(ph + side - 0.9)))
    // the opposite arm swings with it
    turn(sk, `${s}Arm`, X, 0.35 * swing)
    turn(sk, `${s}Forearm`, X, -0.3 - 0.2 * swing)
  }
  trail(sk, Math.sin(ph - 0.8), 0.6 + 0.3 * Math.cos(ph * 2))
  sk.update()
}

const WAVE = 4

/** A wave: the right arm up, the hand waving from the elbow, the head tipped. */
export function elfWave(sk: Skeleton, t: number) {
  const u = (t % WAVE) / WAVE
  elfIdle(sk, u * 4)
  const up = env(u, 0.05, 0.22, 0.78, 0.95)
  aim(sk, 'rArm', dir([-0.75, 0.55, 0.2]), up)
  aim(sk, 'rForearm', dir([-0.25 + 0.4 * Math.sin(u * Math.PI * 2 * 5), 1, 0.15]), up)
  aim(sk, 'rHand', dir([-0.2 + 0.5 * Math.sin(u * Math.PI * 2 * 5 - 0.6), 1, 0.2]), up)
  set(sk, 'rFingers', X, -0.15 * (1 - up))
  turn(sk, 'head', Z, -0.12 * up)
  turn(sk, 'chest', Z, 0.04 * up)
  sk.update()
}

/** Leg tubes for the cloth, a little fatter than the legs (as in `clearCloak`). */
const CLOTH_LEGS = [['Thigh', 'Shin', 0.11], ['Shin', 'Foot', 0.09]] as const

/** The elf's body as capsules, as posed now, for the cloth to stay out of. */
function clothBody(sk: Skeleton): Capsule[] {
  const top = posedPoint(sk, sk.index('head'), [0, 1.73, 0.02])
  const out: Capsule[] = [between(sk, 'hips', 'chest', 0.1), { a: top, b: top, r: 0.1 }]
  for (const s of ['l', 'r']) for (const [from, to, r] of CLOTH_LEGS) out.push(between(sk, `${s}${from}`, `${s}${to}`, r))
  return out
}

/**
 * The cloak and plait as cloth (issue #161, `zoo/elfCloth.ts`): each cloak side and the plait is a chain of three
 * points (top, fold, hem), the cloak's two sides tied at the fold and the hem as one piece of cloth, with a little
 * give. The body's capsules keep the points out, and `clearCloak` runs after, so no leg ever passes through the cloak
 * between points.
 */
export const ELF_SWING: SwingSpec = {
  parts: 'cloak and plait',
  chains: [
    { bones: ['lCape1', 'lCape2'], follow: [0.004, 0.006], bend: 0.002 },
    { bones: ['rCape1', 'rCape2'], follow: [0.004, 0.006], bend: 0.002 },
    { bones: ['hair1', 'hair2'], follow: [0.0025, 0.004], bend: 0.002 },
  ],
  ties: [[0, 1, 1, 1, 0.0005], [0, 2, 1, 2, 0.001]],
  body: clothBody,
  jump: 0.75,
  after: clearCloak,
}

/** The elf as a `Species`: how to build it, its looks, its moves and where the camera starts. */
export const ELF: Species = {
  id: 'elf',
  name: 'elf',
  blurb: 'An elf of twenty-nine bones with a painted face, hair and a mantle of fur in blob strands, a pleated tunic, and a cloak that hangs in folds and keeps clear of the legs.',
  detail: [15000, 60000, 120000, 200000],
  start: 60000,
  looks: Object.entries(LOOKS).map(([id, l]) => ({ id, label: l.label })),
  make: makeElf,
  moves: [
    { name: 'walk', label: 'Walk', doing: 'walking on the spot', seconds: STRIDE, fps: 30, pose: elfWalk },
    { name: 'wave', label: 'Wave', doing: 'waving', seconds: WAVE, fps: 24, pose: elfWave },
    { name: 'idle', label: 'Stand', doing: 'standing and looking round', seconds: 4, fps: 12, pose: elfIdle },
  ],
  view: { target: [0, 0.95, 0], distance: 3.6, azimuth: 30, elevation: 8 },
  swing: ELF_SWING,
}
