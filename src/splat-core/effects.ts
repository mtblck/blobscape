import { Blobs, type Vec3 } from './blobs.ts'

/**
 * Live effects. Each one moves, turns, squashes or fades blobs as a function
 * of `amount` (0 = untouched, 1 = full effect), `time` (seconds, for the
 * looping ones) and a per-blob random number. The same math exists twice:
 * as GLSL for Spark to run on the GPU every frame (`effectGlsl`), and in
 * TypeScript (`applyEffect`) so an effect can be baked into the blobs for
 * real, and tested. Both use an integer hash, so they agree blob for blob.
 */

export type EffectId = 'explode' | 'melt' | 'wind' | 'twist' | 'wave' | 'dissolve'

export const EFFECTS: { id: EffectId; name: string; note: string; loops: boolean }[] = [
  { id: 'explode', name: 'Explode', note: 'Every blob flies straight out from the middle. Nothing holds them together.', loops: false },
  { id: 'melt', name: 'Melt', note: 'Blobs slump to the floor and spread out, the highest ones last.', loops: false },
  { id: 'wind', name: 'Wind', note: 'A gusting breeze pushes the blobs sideways, more the higher they are.', loops: true },
  { id: 'twist', name: 'Twist', note: 'Each layer turns around the vertical axis, more the higher it is.', loops: false },
  { id: 'wave', name: 'Wave', note: 'A ripple runs through the scene.', loops: true },
  { id: 'dissolve', name: 'Dissolve', note: 'Blobs fade out and drift up one by one, in random order.', loops: false },
]

export const EFFECT_INDEX: Record<EffectId, number> = { explode: 0, melt: 1, wind: 2, twist: 3, wave: 4, dissolve: 5 }

/** Where the scene is: effects scale to it, so they look the same on a mug or a room. */
export interface EffectFrame { center: Vec3; radius: number; floor: number }

export interface EffectParams extends EffectFrame { kind: EffectId; amount: number; time: number }

/** 32-bit integer hash of a blob's index to 0..1 (the same in JS and GLSL). */
export function hash01(i: number, salt: number): number {
  let x = (Math.imul(i, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca77)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x / 4294967296
}

const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }

/**
 * Applies an effect to blob i in place. `index` is the hash seed: the blob's
 * position in the GPU's list, so a bake matches what was on screen.
 */
export function applyEffectOne(b: Blobs, i: number, index: number, p: EffectParams) {
  const { amount: a, time, center: o, radius: R, floor } = p
  if (a <= 0 && p.kind !== 'wind' && p.kind !== 'wave') return
  const h = hash01(index, 1)
  const rx = hash01(index, 2) * 2 - 1, ry = hash01(index, 3) * 2 - 1, rz = hash01(index, 4) * 2 - 1
  const c = b.center, k = i * 3
  let x = c[k], y = c[k + 1], z = c[k + 2]
  switch (p.kind) {
    case 'explode': {
      let dx = x - o[0] + rx * 0.05 * R, dy = y - o[1] + ry * 0.05 * R, dz = z - o[2] + rz * 0.05 * R
      const l = Math.hypot(dx, dy, dz) || 1
      dx /= l; dy /= l; dz /= l
      const s = a * R * (0.8 + 1.4 * h)
      x += dx * s + rx * a * R * 0.25
      y += dy * s + ry * a * R * 0.25
      z += dz * s + rz * a * R * 0.25
      break
    }
    case 'melt': {
      const height = Math.max(0, y - floor)
      // Low blobs go first; the top of the object goes last
      const t = smooth(0, 1, a * 1.6 - (height / (2 * R)) * 0.6 - h * 0.2)
      y = floor + height * (1 - t) + 0.01 * R * h
      const spread = 1 + t * (0.6 + 0.8 * h)
      x = o[0] + (x - o[0]) * spread
      z = o[2] + (z - o[2]) * spread
      b.scale[k + 1] *= 1 - 0.7 * t
      break
    }
    case 'wind': {
      const lift = Math.max(0, y - floor) / (2 * R)
      const x0 = x
      x += a * R * lift * (0.5 + 0.35 * Math.sin(time * 1.7 + y * 3 / R + h * 6.283) + 0.3 * h)
      z += a * R * lift * 0.15 * Math.sin(time * 2.3 + (x0 * 2) / R + h * 6.283)
      break
    }
    case 'twist': {
      const ang = a * Math.PI * ((y - o[1]) / R)
      const cs = Math.cos(ang), sn = Math.sin(ang)
      const dx = x - o[0], dz = z - o[2]
      x = o[0] + dx * cs + dz * sn
      z = o[2] - dx * sn + dz * cs
      rotateY(b.quat, i * 4, ang)
      break
    }
    case 'wave': {
      y += a * R * 0.12 * Math.sin(((x - o[0]) * 5) / R + time * 3)
      break
    }
    case 'dissolve': {
      const gone = smooth(h, h + 0.15, a * 1.15)
      b.opacity[i] *= 1 - gone
      y += gone * R * 0.4 * (0.5 + h)
      break
    }
  }
  c[k] = x; c[k + 1] = y; c[k + 2] = z
}

/** q ← rotation about +Y by `ang` radians, then q (world-space turn). */
function rotateY(q: Float32Array, k: number, ang: number) {
  const s = Math.sin(ang / 2), w = Math.cos(ang / 2)
  const [x, y, z, qw] = [q[k], q[k + 1], q[k + 2], q[k + 3]]
  // (0, s, 0, w) * (x, y, z, qw)
  q[k] = w * x + s * z
  q[k + 1] = w * y + s * qw
  q[k + 2] = w * z - s * x
  q[k + 3] = w * qw - s * y
}

/**
 * The same effects in GLSL, as the body of a Spark dyno. Inputs: the Gsplat
 * plus uniforms. Only blobs with index < fxCount are touched, which is how an
 * effect applies to just the selection (the view puts selected blobs first).
 */
export const EFFECT_GLSL_GLOBALS = `
float bsHash(int i, int salt) {
  uint x = uint(i) * 0x9e3779b1u ^ uint(salt) * 0x85ebca77u;
  x = (x ^ (x >> 16u)) * 0x7feb352du;
  x = (x ^ (x >> 15u)) * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return float(x) / 4294967296.0;
}
vec4 bsTurnY(vec4 q, float ang) {
  float s = sin(ang * 0.5), w = cos(ang * 0.5);
  return vec4(w * q.x + s * q.z, w * q.y + s * q.w, w * q.z - s * q.x, w * q.w - s * q.y);
}
`

export function effectStatements(gin: string, g: string, u: { kind: string; amount: string; time: string; center: string; radius: string; floor: string; count: string }) {
  return `
${g} = ${gin};
if (${g}.index < int(${u.count})) {
  int idx = ${g}.index;
  float a = ${u.amount};
  float R = ${u.radius};
  vec3 o = ${u.center};
  float h = bsHash(idx, 1);
  vec3 r = vec3(bsHash(idx, 2), bsHash(idx, 3), bsHash(idx, 4)) * 2.0 - 1.0;
  vec3 c = ${g}.center;
  int k = int(${u.kind});
  if (k == 0 && a > 0.0) {
    vec3 d = normalize(c - o + r * 0.05 * R + vec3(1e-6));
    c += d * (a * R * (0.8 + 1.4 * h)) + r * a * R * 0.25;
  } else if (k == 1 && a > 0.0) {
    float height = max(0.0, c.y - ${u.floor});
    float t = smoothstep(0.0, 1.0, a * 1.6 - (height / (2.0 * R)) * 0.6 - h * 0.2);
    c.y = ${u.floor} + height * (1.0 - t) + 0.01 * R * h;
    float spread = 1.0 + t * (0.6 + 0.8 * h);
    c.xz = o.xz + (c.xz - o.xz) * spread;
    ${g}.scales.y *= 1.0 - 0.7 * t;
  } else if (k == 2) {
    float lift = max(0.0, c.y - ${u.floor}) / (2.0 * R);
    float x0 = c.x;
    c.x += a * R * lift * (0.5 + 0.35 * sin(${u.time} * 1.7 + c.y * 3.0 / R + h * 6.283) + 0.3 * h);
    c.z += a * R * lift * 0.15 * sin(${u.time} * 2.3 + x0 * 2.0 / R + h * 6.283);
  } else if (k == 3 && a > 0.0) {
    float ang = a * 3.14159265 * ((c.y - o.y) / R);
    float cs = cos(ang), sn = sin(ang);
    vec2 d = c.xz - o.xz;
    c.x = o.x + d.x * cs + d.y * sn;
    c.z = o.z - d.x * sn + d.y * cs;
    ${g}.quaternion = bsTurnY(${g}.quaternion, ang);
  } else if (k == 4) {
    c.y += a * R * 0.12 * sin((c.x - o.x) * 5.0 / R + ${u.time} * 3.0);
  } else if (k == 5 && a > 0.0) {
    float gone = smoothstep(h, h + 0.15, a * 1.15);
    ${g}.rgba.a *= 1.0 - gone;
    c.y += gone * R * 0.4 * (0.5 + h);
  }
  ${g}.center = c;
}
`
}

/** Bakes an effect into blobs. `order` maps GPU position → blob index (selected first), `count` how many are affected. */
export function bakeEffect(b: Blobs, p: EffectParams, order: ArrayLike<number> | null, count: number) {
  for (let g = 0; g < count; g++) applyEffectOne(b, order ? order[g] : g, g, p)
}
