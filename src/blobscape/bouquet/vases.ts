import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Season } from './flowers.ts'
import { hex } from './flowers.ts'
import { LAMP, Maker, clamp, hash, lerp, mix, mul, noise, outline, rng, smooth } from './make.ts'

/**
 * What the bouquet stands in: turned shapes (a vase, a jar, a bucket, a
 * pumpkin, a snowman) and two built from a few shapes run together (a rain
 * boot, a watering can). Each stands on the table at the origin and says
 * where its mouth is, so the stems know where to go in.
 */

export type VaseKind = 'glass' | 'jar' | 'ceramic' | 'bucket' | 'can' | 'boot' | 'pumpkin' | 'snowman'
export const VASES: { id: VaseKind; label: string }[] = [
  { id: 'glass', label: 'Glass vase' }, { id: 'jar', label: 'Jam jar' }, { id: 'ceramic', label: 'Ceramic vase' }, { id: 'bucket', label: 'Bucket' },
  { id: 'can', label: 'Watering can' }, { id: 'boot', label: 'Rain boot' }, { id: 'pumpkin', label: 'Pumpkin' }, { id: 'snowman', label: 'Snowman' },
]

/** Which vases a season reaches for when it may choose: its own first, three times as likely as the rest. */
export const SEASON_VASES: Record<Season, VaseKind[]> = {
  spring: ['boot', 'boot', 'boot', 'glass', 'ceramic', 'jar', 'bucket'],
  summer: ['can', 'can', 'can', 'jar', 'glass', 'ceramic', 'bucket'],
  fall: ['pumpkin', 'pumpkin', 'pumpkin', 'bucket', 'ceramic', 'glass'],
  winter: ['snowman', 'snowman', 'snowman', 'ceramic', 'glass', 'bucket'],
}

/** What the stems need to know about a vase. */
export interface VaseInfo {
  kind: VaseKind
  /** What to call this one: 'a cobalt ceramic vase'. */
  name: string
  /** The mouth's radius and height. */
  mouth: number
  top: number
  /** The height of its floor inside. */
  floor: number
  /** Whether the stems show through it. */
  clear: boolean
  /** How far its foot reaches from the middle, for shadows and for petals to land clear of. */
  foot: number
  /** For a clear vase: how far from the middle its inside wall stands at a height, so stems can be kept within it. */
  inside?: (y: number) => number
}

/** The glass is this thick, as stems see it. */
const WALL = 0.012

/** The narrowest a turned profile is at a height, less its wall. */
export function insideOf(profile: [number, number][]): (y: number) => number {
  return (y) => {
    let r = Infinity
    for (let i = 1; i < profile.length; i++) {
      const [r0, y0] = profile[i - 1], [r1, y1] = profile[i]
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1)
      if (y < lo - 1e-9 || y > hi + 1e-9) continue
      r = Math.min(r, hi - lo < 1e-9 ? Math.max(r0, r1) : r0 + (r1 - r0) * (y - y0) / (y1 - y0))
    }
    if (r === Infinity) r = y > profile[profile.length - 1][1] ? profile[profile.length - 1][0] : profile[0][0]
    return Math.max(0, r - WALL)
  }
}

const AZ = Math.atan2(LAMP[2], LAMP[0])
const pickOf = <T,>(xs: T[], r: number) => xs[Math.floor(r * xs.length) % xs.length]

/** A dark lid a little way down the mouth of a vase that isn't clear, and the wall above it. */
function plug(m: Maker, r: number, top: number, color: Vec3) {
  m.newPart()
  m.lathe([[r * 0.98, top], [r * 0.96, top - 0.07]], () => mul(color, 0.45), {}, { inside: true })
  m.cover((u, v) => [u * r * 0.97 * Math.cos(v * 6.2832), top - 0.07, -u * r * 0.97 * Math.sin(v * 6.2832)], Math.max(2, Math.round(r / m.step)), (u) => (6.2832 * u * r) / m.step, () => [0.07, 0.06, 0.05], { glow: true }, { wrap: true })
}

/** Glass: a faint wall, a bright streak where the lamp is and a fainter one opposite, a thick rim and foot, and water. */
function glass(m: Maker, profile: [number, number][], tint: Vec3, water: number, ridges?: (t: number) => number) {
  const top = profile[profile.length - 1][1]
  m.newPart()
  m.lathe(profile, (a, _t, p) => {
    const d = Math.abs(((a - AZ + Math.PI * 3) % (Math.PI * 2)) - Math.PI), back = Math.abs(((a - AZ + Math.PI * 2) % (Math.PI * 2)) - Math.PI)
    const streak = Math.max(smooth(1 - d / 0.22), 0.5 * smooth(1 - back / 0.12))
    return mix(mul(tint, p[1] < water ? 0.86 : 1), [1, 1, 1], streak)
  }, { glow: true, opacity: 0.24 })
  // the streaks again, solid enough to read as shine
  m.lathe(profile, () => [1, 1, 1], { glow: true, opacity: 0.5 }, { keep: (p) => { const a = Math.atan2(p[2], p[0]); const d = Math.abs(((a - AZ + Math.PI * 3) % (Math.PI * 2)) - Math.PI); return d < 0.1 && p[1] > top * 0.12 && p[1] < top * 0.9 } })
  if (ridges) m.lathe(profile, () => mix(tint, [1, 1, 1], 0.5), { glow: true, opacity: 0.4 }, { keep: (p) => ridges(p[1] / top) > 0.5 })
  const [rTop] = profile[profile.length - 1], [rFoot] = profile[1]
  m.lathe([[rTop, top - 0.012], [rTop + 0.004, top], [rTop - 0.006, top]], () => mix(tint, [1, 1, 1], 0.6), { glow: true, opacity: 0.6 })
  m.lathe([[0, 0.012], [rFoot * 0.98, 0.012], [rFoot, 0.03]], () => mix(tint, [1, 1, 1], 0.35), { glow: true, opacity: 0.45 })
  // the water's surface, seen from above and below
  const at = (y: number) => { let i = 1; while (i < profile.length - 1 && profile[i][1] < y) i++; const f = clamp((y - profile[i - 1][1]) / Math.max(1e-6, profile[i][1] - profile[i - 1][1])); return lerp(profile[i - 1][0], profile[i][0], f) }
  const rw = at(water) - 0.006
  m.cover((u, v) => [u * rw * Math.cos(v * 6.2832), water, -u * rw * Math.sin(v * 6.2832)], Math.max(2, Math.round(rw / m.step)), (u) => (6.2832 * u * rw) / m.step, (u) => mix(mul(tint, 0.8), [1, 1, 1], smooth((u - 0.8) / 0.2) * 0.6), { glow: true, opacity: 0.3 }, { wrap: true })
}

const GLAZES: { name: string; body: string; accent: string }[] = [
  { name: 'celadon', body: '#a9c6b4', accent: '#e9efe2' }, { name: 'cobalt', body: '#2f4ea0', accent: '#eef0ea' }, { name: 'cream', body: '#ece3cf', accent: '#b58a5a' },
  { name: 'terracotta', body: '#c0673f', accent: '#ecdcc6' }, { name: 'blush', body: '#e8b9b0', accent: '#f7ebe2' }, { name: 'charcoal', body: '#3f4347', accent: '#d9d3c6' }, { name: 'mustard', body: '#d6a431', accent: '#f3ead2' },
]

/** Makes a vase on the table at the origin, on the maker's current bone. The same kind and seed give the same vase. */
export function makeVase(m: Maker, kind: VaseKind, seed: number): VaseInfo {
  const rand = rng(seed * 7919 + 13)
  if (kind === 'glass' || kind === 'jar') {
    const shape = kind === 'jar' ? 3 : Math.floor(rand() * 3)
    const profile = outline(
      shape === 0 ? [[0, 0.01], [0.15, 0.012], [0.155, 0.05], [0.155, 0.35], [0.155, 0.62]]
        : shape === 1 ? [[0, 0.01], [0.1, 0.012], [0.105, 0.05], [0.1, 0.3], [0.13, 0.5], [0.185, 0.64]]
          : shape === 2 ? [[0, 0.01], [0.11, 0.012], [0.19, 0.1], [0.215, 0.24], [0.17, 0.4], [0.115, 0.48], [0.125, 0.56]]
            : [[0, 0.01], [0.135, 0.012], [0.15, 0.04], [0.152, 0.34], [0.145, 0.4], [0.118, 0.44], [0.118, 0.5]],
      10,
    ) as [number, number][]
    const tint: Vec3 = kind === 'jar' ? pickOf([[0.8, 0.9, 0.93], [0.82, 0.92, 0.86]] as Vec3[], rand()) : pickOf([[0.84, 0.92, 0.92], [0.8, 0.9, 0.84], [0.9, 0.86, 0.78], [0.82, 0.86, 0.95]] as Vec3[], rand())
    const top = profile[profile.length - 1][1]
    glass(m, profile, tint, top * 0.62, kind === 'jar' ? (t) => (t > 0.9 && Math.sin(t * 150) > 0 ? 1 : 0) : undefined)
    if (kind === 'jar') { m.newPart(); m.lathe([[0.121, 0.425], [0.124, 0.432], [0.121, 0.44]], (a) => mul(hex('#b89a6a'), 0.8 + 0.3 * hash(Math.floor(a * 40), 3)), {}) }
    return { kind, name: kind === 'jar' ? 'a jam jar tied with twine' : pickOf(['a glass cylinder', 'a flared glass vase', 'a round glass vase'], shape / 3), mouth: profile[profile.length - 1][0] - WALL, top, floor: 0.03, clear: true, foot: Math.max(...profile.map((p) => p[0])), inside: insideOf(profile) }
  }
  if (kind === 'ceramic') {
    const shape = Math.floor(rand() * 4), g = pickOf(GLAZES, rand()), pattern = Math.floor(rand() * 4)
    const profile = outline(
      shape === 0 ? [[0, 0], [0.1, 0.005], [0.19, 0.12], [0.21, 0.27], [0.15, 0.43], [0.085, 0.52], [0.08, 0.6], [0.1, 0.64]]
        : shape === 1 ? [[0, 0], [0.13, 0.005], [0.22, 0.14], [0.23, 0.3], [0.18, 0.44], [0.14, 0.5], [0.15, 0.54]]
          : shape === 2 ? [[0, 0], [0.15, 0.005], [0.165, 0.04], [0.17, 0.3], [0.168, 0.52], [0.175, 0.56]]
            : [[0, 0], [0.09, 0.005], [0.12, 0.1], [0.15, 0.3], [0.2, 0.5], [0.205, 0.6], [0.19, 0.66]],
      10,
    ) as [number, number][]
    const top = profile[profile.length - 1][1], body = hex(g.body), accent = hex(g.accent)
    m.newPart()
    m.lathe(profile, (a, _t, p) => {
      let c = body
      if (pattern === 1) c = Math.sin((p[1] / top) * 38) > 0.55 ? accent : body
      else if (pattern === 2) c = mix(accent, body, smooth((p[1] / top - 0.3 + 0.03 * Math.sin(a * 5 + seed)) / 0.04))
      else if (pattern === 3 && hash(Math.floor(a * 60), Math.floor(p[1] * 240), seed) > 0.93) c = mul(body, 0.55)
      return mul(c, 0.94 + 0.12 * noise(p, 9, seed))
    }, { shine: 0.55 })
    plug(m, profile[profile.length - 1][0] - 0.012, top, body)
    return { kind, name: `a ${g.name} ceramic ${['bottle vase', 'jar', 'crock', 'trumpet vase'][shape]}${['', ' with stripes', ', dipped', ', speckled'][pattern]}`, mouth: profile[profile.length - 1][0] - 0.02, top, floor: 0.05, clear: false, foot: Math.max(...profile.map((p) => p[0])) }
  }
  if (kind === 'bucket') {
    const finish = Math.floor(rand() * 3)
    const zinc = hex('#a3a9ab'), enamel = hex('#f0ece0'), green = hex('#5d7a62')
    const base = finish === 0 ? zinc : finish === 1 ? enamel : green
    const profile: [number, number][] = [[0, 0.01], [0.15, 0.01], [0.153, 0.0], [0.158, 0.02], [0.17, 0.14], [0.176, 0.15], [0.172, 0.165], [0.19, 0.36], [0.196, 0.37], [0.192, 0.385], [0.205, 0.5], [0.214, 0.508], [0.214, 0.52], [0.2, 0.52]]
    m.newPart()
    m.lathe(profile, (_a, _t, p) => {
      if (finish === 1 && p[1] > 0.495) return hex('#28407a')
      // zinc has a spangle: big soft crystals of lighter and darker gray
      const k = finish === 0 ? 0.82 + 0.3 * noise(p, 22, seed) * noise(p, 60, seed + 1) * 2 : 0.95 + 0.08 * noise(p, 10, seed)
      return mul(base, k)
    }, { shine: finish === 0 ? 0.35 : 0.5 })
    // a wire handle, hanging down against the side
    m.newPart()
    const R = 0.222, path: Vec3[] = []
    for (let i = 0; i <= 24; i++) { const th = (i / 24) * Math.PI; path.push([R * Math.cos(th), 0.47 - R * 0.9 * Math.sin(th), 0.1 + R * 0.42 * Math.sin(th)]) }
    m.tube(path, () => 0.006, () => mul(zinc, 0.7), { shine: 0.4 })
    for (const s of [-1, 1]) m.ball([s * 0.212, 0.47, 0.02], [0.014, 0.02, 0.02], () => mul(zinc, 0.75), { shine: 0.3 })
    plug(m, 0.2, 0.52, mul(base, 0.8))
    return { kind, name: ['a zinc bucket', 'a white enamel bucket', 'a green florist bucket'][finish], mouth: 0.185, top: 0.52, floor: 0.04, clear: false, foot: 0.22 }
  }
  if (kind === 'pumpkin') {
    const which = Math.floor(rand() * 3)
    const skin = hex(['#e2761c', '#eee3cf', '#93a88f'][which]), crease = hex(['#b4500f', '#cdbf9f', '#6c8272'][which])
    const ribs = 9 + Math.floor(rand() * 4)
    const profile = outline([[0, 0.03], [0.12, 0.0], [0.3, 0.05], [0.4, 0.2], [0.4, 0.32], [0.32, 0.43], [0.2, 0.48], [0.165, 0.47]], 10) as [number, number][]
    const swell = (a: number, t: number) => 1 - 0.075 * Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 3) * smooth(t * 4) + 0.012 * Math.sin(a * 3 + seed)
    m.newPart()
    m.lathe(profile, (a, _t, p) => mul(mix(skin, crease, Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 6) * 0.8), 0.9 + 0.18 * noise(p, 14, seed)), { shine: 0.2 }, { swell })
    // the cut rim: pale flesh
    m.newPart()
    m.lathe([[0.168, 0.47], [0.15, 0.472], [0.14, 0.45]], () => mix(skin, hex('#f4dfa6'), 0.75), {})
    plug(m, 0.145, 0.465, mix(skin, hex('#f4dfa6'), 0.5))
    // its lid beside it, stalk and all
    const lid: Vec3 = [0.5, 0, 0.26]
    m.newPart()
    m.within(lid, [0.08, 0, 0.06, 0.995], 1, () => {
      m.lathe(outline([[0.17, 0.0], [0.15, 0.03], [0.08, 0.055], [0.03, 0.06]], 6) as [number, number][], (a, _t, p) => mul(mix(skin, crease, Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 6) * 0.8), 0.9 + 0.18 * noise(p, 14, seed)), { shine: 0.2 }, { swell: (a) => 1 - 0.06 * Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 3) })
      const stalk: Vec3[] = []
      for (let i = 0; i <= 8; i++) { const t = i / 8; stalk.push([0.05 * t * t, 0.055 + 0.12 * t, 0.02 * Math.sin(t * 3)]) }
      m.tube(stalk, (t) => lerp(0.035, 0.018, t), (_t, a) => mul(hex('#6f6a3a'), 0.8 + 0.3 * Math.abs(Math.cos(a * 3))))
    })
    return { kind, name: ['a hollowed pumpkin', 'a white pumpkin', 'a sage green pumpkin'][which], mouth: 0.135, top: 0.465, floor: 0.08, clear: false, foot: 0.42 }
  }
  if (kind === 'snowman') {
    const white = hex('#f4f3ee'), coal = hex('#26262a'), scarf = hex(pickOf(['#c2262c', '#2f6a4a', '#2a4a8a'], rand())), band = hex('#f1ede0')
    const profile = outline([[0, 0], [0.18, 0.005], [0.27, 0.1], [0.29, 0.24], [0.25, 0.39], [0.175, 0.47], [0.16, 0.5], [0.19, 0.56], [0.2, 0.64], [0.17, 0.73], [0.12, 0.775]], 10) as [number, number][]
    m.newPart()
    m.lathe(profile, (_a, _t, p) => mul(mix(hex('#dfe6ee'), white, smooth(0.4 + 0.6 * noise(p, 6, seed))), 1), { shine: 0.4, shade: 0.7 })
    // a top hat for a mouth
    m.newPart()
    m.lathe([[0.11, 0.765], [0.2, 0.765], [0.205, 0.775], [0.2, 0.785], [0.135, 0.785], [0.135, 0.92], [0.122, 0.92]], (_a, _t, p) => (p[1] > 0.79 && p[1] < 0.825 ? scarf : coal), { shine: 0.25 })
    plug(m, 0.125, 0.92, coal)
    // the face looks along +z
    m.newPart()
    for (const s of [-1, 1]) m.ball([s * 0.07, 0.67, 0.178], [0.02, 0.022, 0.012], () => coal, { shine: 0.5 })
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.03; m.ball([x, 0.585 + 0.012 * Math.abs(i - 2) ** 1.5, 0.19 - Math.abs(x) * 0.25], [0.01, 0.01, 0.007], () => coal) }
    for (let i = 0; i < 3; i++) { const y = 0.16 + i * 0.09; const r = 0.283 - Math.abs(y - 0.24) * 0.3; m.ball([0, y, r], [0.02, 0.02, 0.012], () => coal, { shine: 0.5 }) }
    m.newPart()
    const nose: Vec3[] = [[0, 0.635, 0.19], [0, 0.63, 0.32]]
    m.tube(nose, (t) => lerp(0.025, 0.004, t), (t) => mul(hex('#ee7a22'), 0.9 + 0.2 * Math.sin(t * 40)))
    // a scarf round the neck, and its end hanging down the front
    m.newPart()
    m.lathe(outline([[0.17, 0.455], [0.2, 0.47], [0.205, 0.5], [0.185, 0.53], [0.16, 0.54]], 6) as [number, number][], (a) => (Math.sin(a * 16) > 0.3 ? band : scarf), { shade: 0.9 })
    m.cover((u, v) => [0.1 + (v - 0.5) * 0.085 + u * 0.03, 0.5 - u * 0.25, 0.2 + 0.075 * Math.sin(u * 2.4) + 0.012 * Math.sin(v * 3.14)], Math.round(0.25 / m.step), () => 0.085 / m.step, (u) => (Math.sin(u * 30) > 0.3 ? band : scarf), { thin: true, shade: 0.9 })
    return { kind, name: 'a ceramic snowman', mouth: 0.11, top: 0.92, floor: 0.6, clear: false, foot: 0.3 }
  }
  if (kind === 'boot') {
    const paint = Math.floor(rand() * 4)
    const body = hex(['#f0c22a', '#c8322e', '#2c4a7c', '#7fa087'][paint]), dots = rand() < 0.4
    // the shaft stands on the origin and the foot runs forward along +z; each piece leaves out what the others hide
    const inFoot = (p: Vec3) => (p[0] / 0.128) ** 2 + ((p[1] - 0.12) / 0.115) ** 2 + ((p[2] - 0.16) / 0.27) ** 2 < 1
    const inHeel = (p: Vec3) => (p[0] / 0.128) ** 2 + ((p[1] - 0.12) / 0.115) ** 2 + (p[2] / 0.14) ** 2 < 1
    const inShaft = (p: Vec3) => p[1] > 0.1 && p[1] < 0.7 && Math.hypot(p[0], p[2]) < 0.12
    const color = (p: Vec3) => {
      let c = body
      if (dots) { const a = Math.atan2(p[2], p[0]), gx = a * 3.2, gy = p[1] * 11 + (Math.round(gx) % 2) * 0.5; if (Math.hypot(gx - Math.round(gx), gy - Math.round(gy)) < 0.22) c = hex('#f7f3e6') }
      return mul(c, 0.96 + 0.08 * noise(p, 8, seed))
    }
    const shaft = outline([[0.125, 0.14], [0.122, 0.3], [0.13, 0.5], [0.14, 0.62], [0.148, 0.655]], 8) as [number, number][]
    m.newPart()
    m.lathe(shaft, (_a, _t, p) => (p[1] > 0.61 ? mul(body, 0.72) : color(p)), { shine: 0.6 }, { keep: (p) => !inFoot(p) && !inHeel(p) })
    m.ball([0, 0.12, 0.16], [0.128, 0.115, 0.27], (_n, p) => color(p), { shine: 0.6 }, (p) => !inShaft(p) && !inHeel(p) && p[1] > 0.03)
    m.ball([0, 0.12, 0], [0.128, 0.115, 0.14], (_n, p) => color(p), { shine: 0.6 }, (p) => !inShaft(p) && !inFoot(p) && p[1] > 0.03)
    // a thick sole with a heel
    m.newPart()
    const sole = mul(body, 0.45)
    m.ball([0, 0.025, 0.14], [0.136, 0.03, 0.295], () => sole, {})
    m.ball([0, 0.012, -0.03], [0.12, 0.03, 0.11], () => sole, {})
    plug(m, 0.14, 0.655, body)
    return { kind, name: `a ${['yellow', 'red', 'navy', 'sage'][paint]} rain boot${dots ? ' with white spots' : ''}`, mouth: 0.125, top: 0.655, floor: 0.2, clear: false, foot: 0.3 }
  }
  // a watering can
  const which = Math.floor(rand() * 3)
  const metal = hex(['#9fa6a8', '#3f7a6a', '#d9b23a'][which])
  const paint = (p: Vec3) => mul(metal, which === 0 ? 0.82 + 0.3 * noise(p, 22, seed) * noise(p, 60, seed + 1) * 2 : 0.95 + 0.08 * noise(p, 10, seed))
  m.newPart()
  m.lathe([[0, 0.01], [0.205, 0.01], [0.21, 0.0], [0.212, 0.03], [0.208, 0.2], [0.214, 0.21], [0.208, 0.22], [0.208, 0.48], [0.216, 0.49], [0.216, 0.5], [0.2, 0.5]], (_a, _t, p) => paint(p), { shine: 0.4 })
  // the spout: out of the side low down, up to a rose
  m.newPart()
  const spout: Vec3[] = []
  for (let i = 0; i <= 12; i++) { const t = i / 12; spout.push([0.18 + 0.36 * t, 0.12 + 0.4 * t + 0.04 * Math.sin(t * Math.PI), 0]) }
  m.tube(spout, (t) => lerp(0.04, 0.022, t), (_t, _a, p) => paint(p), { shine: 0.4 })
  m.within([0.54, 0.52, 0], [0, 0, -0.4226, 0.9063], 1, () => m.lathe([[0.022, 0], [0.055, 0.05], [0.058, 0.06], [0, 0.066]], (_a, t, p) => (t > 0.8 && hash(Math.floor(p[0] * 300), Math.floor(p[2] * 300)) > 0.6 ? mul(metal, 0.4) : mul(metal, 0.95)), { shine: 0.4 }))
  // the handle: a hoop at the back
  m.newPart()
  const hoop: Vec3[] = []
  for (let i = 0; i <= 16; i++) { const th = -0.5 + (i / 16) * (Math.PI + 0.3); hoop.push([-0.2 - 0.15 * Math.sin(th) , 0.3 - 0.19 * Math.cos(th), 0]) }
  m.tube(hoop, () => 0.014, (_t, _a, p) => paint(p), { shine: 0.4 })
  plug(m, 0.2, 0.5, metal)
  return { kind: 'can', name: ['a zinc watering can', 'a green watering can', 'a yellow watering can'][which], mouth: 0.185, top: 0.5, floor: 0.04, clear: false, foot: 0.3 }
}

/** The round table the vase stands on: boards with a grain, a shadow under the vase, and an edge. */
export function makeTable(m: Maker, foot: number, seed: number, radius = 0.85) {
  const rand = rng(seed * 31 + 5)
  const wood = hex(pickOf(['#b98a5e', '#8e6a4c', '#d8c3a0', '#6f5b4c', '#c9cdc6'], rand()))
  m.newPart()
  // a coarser cover than the flowers: a table needs no finer
  const step = m.step * 1.8
  m.cover(
    (u, v) => [u * radius * Math.cos(v * 6.2832), 0, -u * radius * Math.sin(v * 6.2832)],
    Math.round(radius / step), (u) => (6.2832 * u * radius) / step,
    (_u, _v, p) => {
      const board = Math.floor(p[0] / 0.16 + 100)
      const grain = 0.9 + 0.16 * noise([p[0] * 6, 0, p[2] * 0.7 + board * 3.1], 9, seed) + (Math.abs(p[0] / 0.16 + 100 - board - 0.5) > 0.47 ? -0.18 : 0)
      // the vase's shadow falls away from the lamp
      const d = Math.hypot(p[0] - LAMP[0] * -0.12, p[2] - LAMP[2] * -0.12)
      const shadow = 1 - 0.45 * smooth(1 - (d - foot * 0.7) / (foot * 0.9 + 0.12))
      return mul(wood, grain * (0.9 + 0.1 * hash(board, 5)) * shadow)
    },
    { glow: true }, { wrap: true },
  )
  m.lathe([[radius, 0], [radius, -0.045], [radius - 0.04, -0.06]], (_a, _t, p) => mul(wood, 0.62 + 0.1 * noise(p, 12, seed)), {})
}
