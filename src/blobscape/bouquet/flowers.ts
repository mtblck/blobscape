import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Head, Item, Paint, Petal } from './heads.ts'
import { mix, mul } from './make.ts'

/**
 * The flowers a bouquet is picked from, about ten a season plus greenery.
 * Each is a recipe: which plan its head follows (heads.ts) with its own
 * numbers, the varieties it comes in, what its stem and leaves are like, and
 * what a florist uses it for.
 */

export type Season = 'spring' | 'summer' | 'fall' | 'winter'
export const SEASONS: { id: Season; label: string }[] = [{ id: 'spring', label: 'Spring' }, { id: 'summer', label: 'Summer' }, { id: 'fall', label: 'Fall' }, { id: 'winter', label: 'Winter' }]

/** The season a day falls in, by the month: March to May is spring, and so on round the year. */
export function seasonOn(day: Date): Season {
  const m = day.getMonth()
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'fall' : 'winter'
}

/**
 * What a stem is for in an arrangement: a focal bloom draws the eye, a second bloom supports it, a line flower
 * gives height, a filler softens the gaps and greenery frames the lot.
 */
export type Role = 'focal' | 'second' | 'line' | 'filler' | 'green'

/** Color families, for putting a palette together. */
export type Hue = 'white' | 'cream' | 'yellow' | 'orange' | 'peach' | 'coral' | 'pink' | 'red' | 'wine' | 'purple' | 'lilac' | 'blue' | 'green' | 'brown'

/** One variety of a flower: its name, its family, and up to three colors the recipe paints with. */
export interface Variety { name: string; hue: Hue; a: Vec3; b: Vec3; c?: Vec3 }

export interface Flower {
  id: string
  /** 'peony', and more than one of them: 'peonies'. */
  name: string
  plural: string
  seasons: Season[]
  roles: Role[]
  /** The head's size: one unit of its recipe, in the bouquet's units (a rose is about 0.1). */
  size: number
  varieties: Variety[]
  head: (v: Variety) => Head
  stem: {
    /** Radius, and color. */
    r: number
    color: Vec3
    /** Leaves along it: how many, their shape and paint, and the share of the stem above the vase they sit in. */
    leaves?: { n: number; shape: Petal; paint: Paint; from?: number; to?: number }
    /** How far the head hangs from the way the stem points, in degrees: a hellebore nods. */
    nod?: number
  }
  /** How much the head turns to face out of the bouquet instead of following its stem: 0 for a spike, 1 for a daisy. */
  face: number
  /** How easily it sways, 1 for most. */
  sway?: number
}

/** Every head is made this much bigger than its recipe's `size`: one number to make the whole bouquet fuller or sparser. */
export const BLOOM = 1.3

export const hex = (h: string): Vec3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const v = (name: string, hue: Hue, a: string, b: string, c?: string): Variety => ({ name, hue, a: hex(a), b: hex(b), c: c ? hex(c) : undefined })

const STEM = hex('#5c8a3c'), DARK_STEM = hex('#3f6b34'), PALE_STEM = hex('#8fae62'), WOOD = hex('#6b4a36'), SAGE = hex('#8aa08c')
const LEAF: Paint = { base: hex('#3d6e30'), tip: hex('#5a9140'), veins: 0.25, deep: 0.85 }
const leafOf = (c: string, tip = c): Paint => ({ base: mul(hex(c), 0.85), tip: hex(tip), veins: 0.2, deep: 0.85 })
const OVAL: Petal = { len: 0.3, width: 0.13, widest: 0.45, point: 1.6, open: 40, tip: 5, fold: 0.25 }
const LONG: Petal = { len: 0.5, width: 0.07, widest: 0.35, point: 2.4, open: 62, tip: 10, bend: 1.6, fold: 0.3 }
const YELLOW = hex('#f2c230')


const same = (p: Petal) => ({ inner: p, outer: p })
/** A small flat flower of `n` petals, for sprays, spikes and domes. */
const floret = (n: number, a: Vec3, b: Vec3, eye?: Vec3, shape: Partial<Petal> = {}): Item => ({
  rosette: { n, whorl: n, r: [0.1, 0.1], ...same({ len: 1, width: Math.min(1.1, 4.6 / n), widest: 0.6, point: 0.7, open: 22, tip: 2, cup: 0.25, ...shape }), paint: { base: a, tip: b, deep: 0.82 }, center: eye ? { disc: 0.16, height: 0.1, color: eye } : undefined, loose: 1 },
})

const rose = (v: Variety): Head => ({
  rosette: {
    n: 34, ease: 1.25, r: [0.02, 0.24], rise: 0.3, wild: 0.35, loose: 3,
    inner: { len: 0.55, width: 0.5, widest: 0.6, point: 0.5, open: 86, tip: 104, cup: 0.6 },
    outer: { len: 0.9, width: 1.05, widest: 0.62, point: 0.42, open: 60, tip: -10, bend: 3, cup: 0.35, ruffle: 0.07 },
    paint: { base: mix(v.a, v.b, 0.2), tip: v.b, streak: 0.08, deep: 0.62 },
    paintIn: { base: mul(v.a, 0.85), tip: v.a, deep: 0.5 },
    sepals: { n: 5, len: 0.5, color: DARK_STEM },
  },
})

export const FLOWERS: Flower[] = [
  // ——— spring
  {
    id: 'peony', name: 'peony', plural: 'peonies', seasons: ['spring', 'summer'], roles: ['focal'], size: 0.13, face: 0.55, sway: 0.8,
    varieties: [v('blush', 'pink', '#f2a9bd', '#fbdfe3'), v('coral', 'coral', '#f0705f', '#f8b09a'), v('white', 'white', '#f1e9dc', '#fcf9f2'), v('magenta', 'wine', '#b02a62', '#d85e8c'), v('cream', 'cream', '#f3e2b4', '#fbf4dc')],
    head: (v) => ({
      rosette: {
        n: 46, ease: 1.1, r: [0.03, 0.3], rise: 0.4, wild: 0.6, loose: 4,
        inner: { len: 0.5, width: 0.42, widest: 0.65, point: 0.5, open: 82, tip: 110, cup: 0.5, ruffle: 0.35, ruffles: 4 },
        outer: { len: 0.95, width: 1.05, widest: 0.66, point: 0.4, notch: 0.08, open: 50, tip: 14, bend: 2, cup: 0.45, ruffle: 0.22, ruffles: 3 },
        paint: { base: mix(v.a, v.b, 0.25), tip: v.b, streak: 0.1, deep: 0.62 },
        paintIn: { base: mul(v.a, 0.88), tip: mix(v.a, v.b, 0.3), deep: 0.52 },
        sepals: { n: 5, len: 0.45, color: STEM },
      },
    }),
    stem: { r: 0.014, color: STEM, leaves: { n: 3, shape: { len: 0.38, width: 0.14, widest: 0.45, point: 2, open: 45, tip: 0, fold: 0.3 }, paint: LEAF } },
  },
  {
    id: 'tulip', name: 'tulip', plural: 'tulips', seasons: ['spring'], roles: ['second', 'focal'], size: 0.12, face: 0.15, sway: 1.2,
    varieties: [v('pink', 'pink', '#e8739a', '#f6b3c6'), v('yellow', 'yellow', '#f1c22b', '#f8dc62'), v('red', 'red', '#c9242b', '#e8553f'), v('white', 'white', '#efecd9', '#fbfaf0'), v('purple', 'purple', '#6d3a8c', '#9b63b5'), v('apricot', 'peach', '#f08d4e', '#f9c489')],
    head: (v) => ({
      rosette: {
        n: 6, whorl: 3, r: [0.1, 0.16], wild: 0.25, loose: 1,
        inner: { len: 1, width: 0.72, widest: 0.5, point: 1.1, claw: 0.3, open: 80, tip: 96, bend: 1.5, cup: 0.75 },
        outer: { len: 1.02, width: 0.76, widest: 0.5, point: 1.1, claw: 0.3, open: 68, tip: 90, bend: 1.4, cup: 0.7 },
        paint: { base: mix(v.a, hex('#e9e2a6'), 0.35), tip: v.b, run: 0.6, streak: 0.1, deep: 0.8, edge: mul(v.b, 1.06), edgeAt: 0.8 },
        center: { stamens: 6, len: 0.4, spread: 25, color: hex('#d9d48a'), anther: hex('#3a2f2a'), pistil: hex('#b9c66a') },
      },
    }),
    stem: { r: 0.013, color: PALE_STEM, leaves: { n: 2, shape: { len: 0.6, width: 0.13, widest: 0.4, point: 2, open: 78, tip: 40, bend: 2, fold: 0.5, twist: 20 }, paint: leafOf('#6f9a55', '#8db56c'), from: 0, to: 0.25 } },
  },
  {
    id: 'daffodil', name: 'daffodil', plural: 'daffodils', seasons: ['spring'], roles: ['second'], size: 0.095, face: 0.9,
    varieties: [v('yellow', 'yellow', '#f4d03a', '#f8e06a', '#f0a51e'), v('ice', 'cream', '#f6f0cf', '#fbf8e6', '#f2b53a'), v('white and orange', 'white', '#f6f3e6', '#fdfcf5', '#ee7a2b')],
    head: (v) => ({
      rosette: {
        n: 6, whorl: 3, r: [0.14, 0.16], wild: 0.3,
        inner: { len: 0.9, width: 0.58, widest: 0.5, point: 1.5, claw: 0.35, open: 8, tip: 0, cup: 0.15, twist: 8 },
        outer: { len: 0.92, width: 0.6, widest: 0.5, point: 1.5, claw: 0.35, open: 2, tip: -6, cup: 0.15 },
        paint: { base: v.a, tip: v.b, veins: 0.1, deep: 0.9 }, finish: { shade: 0.7 },
        center: { corona: 0.3, len: 0.55, flare: 1.6, color: v.c!, rim: mul(v.c!, 1.1), ruffle: 0.12 },
      },
    }),
    stem: { r: 0.011, color: PALE_STEM, nod: 55, leaves: { n: 2, shape: { len: 0.7, width: 0.05, widest: 0.5, point: 1.2, open: 86, tip: 70, fold: 0.3 }, paint: leafOf('#6f9a55'), from: 0, to: 0.1 } },
  },
  {
    id: 'ranunculus', name: 'ranunculus', plural: 'ranunculus', seasons: ['spring', 'winter'], roles: ['second', 'focal'], size: 0.085, face: 0.6,
    varieties: [v('peach', 'peach', '#f2a274', '#fbd0ae'), v('pink', 'pink', '#ee8fae', '#f9c9d6'), v('white', 'white', '#f1ecdb', '#fcfaf2'), v('orange', 'orange', '#ee7a25', '#f6ac58'), v('yellow', 'yellow', '#f3c62f', '#f9e078'), v('burgundy', 'wine', '#7e1836', '#b23c5a')],
    head: (v) => ({
      rosette: {
        n: 64, ease: 1.15, r: [0.02, 0.2], rise: 0.25, wild: 0.2, loose: 2,
        inner: { len: 0.32, width: 0.34, widest: 0.6, point: 0.4, open: 88, tip: 125, cup: 0.6 },
        outer: { len: 0.95, width: 0.95, widest: 0.66, point: 0.38, open: 48, tip: 30, bend: 1.4, cup: 0.5 },
        paint: { base: mix(v.a, v.b, 0.3), tip: v.b, deep: 0.6, edge: mul(v.b, 1.05), edgeAt: 0.85 },
        paintIn: { base: mix(v.a, hex('#9aa94a'), 0.35), tip: v.a, deep: 0.55 },
        sepals: { n: 5, len: 0.4, color: STEM },
      },
    }),
    stem: { r: 0.009, color: PALE_STEM, leaves: { n: 2, shape: { ...LONG, len: 0.22, lobes: 3, lobed: 0.5 }, paint: LEAF } },
  },
  {
    id: 'anemone', name: 'anemone', plural: 'anemones', seasons: ['spring', 'winter'], roles: ['second'], size: 0.09, face: 0.85,
    varieties: [v('white', 'white', '#f3f0e6', '#fdfcf8', '#1f1a2e'), v('violet', 'purple', '#6a3fa6', '#9a74cf', '#191527'), v('red', 'red', '#c0202c', '#e04a48', '#1b1620'), v('pink', 'pink', '#e77fa8', '#f6bfd2', '#22192b')],
    head: (v) => ({
      rosette: {
        n: 8, whorl: 4, r: [0.2, 0.22], wild: 0.45, loose: 2,
        inner: { len: 0.95, width: 0.8, widest: 0.6, point: 0.5, claw: 0.3, open: 22, tip: 8, cup: 0.3, ruffle: 0.08 },
        outer: { len: 1, width: 0.85, widest: 0.6, point: 0.5, claw: 0.3, open: 10, tip: -4, cup: 0.3, ruffle: 0.08 },
        paint: { base: v.a, tip: v.b, veins: 0.08, deep: 0.85, throat: mix(v.a, hex('#ffffff'), 0.5), throatTo: 0.2 }, finish: { shade: 0.7 },
        center: { disc: 0.22, height: 0.16, color: v.c!, rim: mix(v.c!, hex('#6a6a8a'), 0.5) },
      },
    }),
    stem: { r: 0.009, color: STEM, leaves: { n: 1, shape: { ...LONG, len: 0.22, lobes: 3, lobed: 0.6 }, paint: LEAF, from: 0.8, to: 0.9 } },
  },
  {
    id: 'hyacinth', name: 'hyacinth', plural: 'hyacinths', seasons: ['spring'], roles: ['second', 'line'], size: 0.26, face: 0, sway: 0.6,
    varieties: [v('blue', 'blue', '#5069c9', '#8ea3ea'), v('pink', 'pink', '#e88bb0', '#f7c6d8'), v('white', 'white', '#f0efe2', '#fcfcf5'), v('lilac', 'lilac', '#a98ad6', '#d2c0ee')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.06, 0.03], stalkColor: PALE_STEM, n: 38, from: 0.12, to: 1, size: [0.17, 0.11], tilt: [80, 25], off: 0.05,
        item: floret(6, v.a, v.b, undefined, { width: 0.42, point: 1.2, open: 55, tip: -30, bend: 1.5 }),
      },
    }),
    stem: { r: 0.016, color: PALE_STEM, leaves: { n: 2, shape: { len: 0.5, width: 0.09, widest: 0.5, point: 1.2, open: 82, tip: 55, fold: 0.5 }, paint: leafOf('#5f9248'), from: 0, to: 0.1 } },
  },
  {
    id: 'lilac', name: 'lilac', plural: 'lilacs', seasons: ['spring'], roles: ['filler', 'second'], size: 0.115, face: 0.2, sway: 0.9,
    varieties: [v('lilac', 'lilac', '#a989cf', '#d4c1ea'), v('deep purple', 'purple', '#6b3f93', '#9a70bd'), v('white', 'white', '#eef0e2', '#fbfcf4')],
    head: (v) => ({ cluster: { n: 80, r: [0.55, 1.25], cap: 150, size: 0.2, heart: mix(v.a, STEM, 0.6), wild: 0.6, item: floret(4, v.a, v.b, mul(v.a, 0.7), { width: 0.8 }) } }),
    stem: { r: 0.011, color: WOOD, leaves: { n: 2, shape: { len: 0.3, width: 0.22, widest: 0.35, point: 1.8, open: 40, tip: 0, fold: 0.25 }, paint: LEAF, from: 0.6, to: 0.9 } },
  },
  {
    id: 'muscari', name: 'grape hyacinth', plural: 'grape hyacinths', seasons: ['spring'], roles: ['filler'], size: 0.14, face: 0, sway: 1.2,
    varieties: [v('blue', 'blue', '#3f4fb8', '#6f7fe0'), v('white', 'white', '#e9ecdf', '#fafbf3')],
    head: (v) => ({ along: { len: 1, stalk: [0.035, 0.02], stalkColor: PALE_STEM, n: 34, from: 0.3, to: 1, size: [0.13, 0.07], tilt: [110, 40], off: 0.02, item: { bead: { r: [0.5, 0.6], color: v.a, tip: v.b, shine: 0.25, eye: mul(v.b, 1.2) } } } }),
    stem: { r: 0.007, color: PALE_STEM },
  },
  {
    id: 'blossom', name: 'cherry blossom', plural: 'cherry blossom branches', seasons: ['spring'], roles: ['line'], size: 0.58, face: 0, sway: 0.7,
    varieties: [v('pale pink', 'pink', '#f6c4d2', '#fdeef1', '#c9516f'), v('white', 'white', '#f5efe8', '#fefcf9', '#d98a9a')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.016, 0.005], stalkColor: hex('#5a3d33'), n: 13, from: 0.1, to: 0.98, per: 2, size: [0.1, 0.075], tilt: [80, 45], off: 0.03, buds: 2, wild: 0.9,
        item: { rosette: { n: 5, whorl: 5, r: [0.12, 0.12], ...same({ len: 1, width: 0.95, widest: 0.62, point: 0.5, notch: 0.22, open: 24, tip: 6, cup: 0.3 }), paint: { base: v.a, tip: v.b, throat: v.c, throatTo: 0.3, deep: 0.9 }, finish: { shade: 0.6 }, center: { stamens: 7, len: 0.4, spread: 40, color: mix(v.b, v.c!, 0.3), anther: YELLOW, dot: 0.03 }, loose: 2 } },
        bud: { bead: { r: [0.18, 0.26], color: mix(v.a, v.c!, 0.5), tip: v.a } },
      },
    }),
    stem: { r: 0.012, color: hex('#5a3d33') },
  },
  {
    id: 'sweetpea', name: 'sweet pea', plural: 'sweet peas', seasons: ['spring', 'summer'], roles: ['filler', 'line'], size: 0.3, face: 0.1, sway: 1.5,
    varieties: [v('lilac', 'lilac', '#b596d8', '#dccbee'), v('pink', 'pink', '#ef9bbb', '#f9d0de'), v('white', 'white', '#f3f0e6', '#fdfcf7'), v('coral', 'coral', '#f08372', '#f8b9a8')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.012, 0.006], stalkColor: PALE_STEM, droop: 25, n: 6, from: 0.35, to: 1, size: [0.2, 0.15], tilt: [70, 35], step: 150, wild: 0.6,
        item: { rosette: { n: 3, whorl: 3, r: [0.05, 0.05], ...same({ len: 1, width: 1.3, widest: 0.62, point: 0.4, notch: 0.12, open: 60, tip: 10, bend: 1.8, cup: 0.2, ruffle: 0.4, ruffles: 3 }), paint: { base: mix(v.a, hex('#ffffff'), 0.3), tip: v.a, edge: v.b, edgeAt: 0.7, deep: 0.85 }, wild: 0.8, loose: 1 } },
      },
    }),
    stem: { r: 0.006, color: PALE_STEM },
  },
  {
    id: 'willow', name: 'pussy willow', plural: 'pussy willow branches', seasons: ['spring', 'winter'], roles: ['line'], size: 0.75, face: 0, sway: 0.6,
    varieties: [v('silver', 'white', '#d9d6cc', '#f3f1ea')],
    head: (v) => ({ along: { len: 1, stalk: [0.013, 0.004], stalkColor: hex('#6a3f2e'), n: 16, from: 0.12, to: 0.98, size: [0.05, 0.035], tilt: [22, 14], off: 0.012, item: { bead: { r: [0.55, 1], color: v.a, tip: v.b } } } }),
    stem: { r: 0.01, color: hex('#6a3f2e') },
  },

  // ——— summer
  {
    id: 'rose', name: 'garden rose', plural: 'garden roses', seasons: ['summer', 'spring', 'fall', 'winter'], roles: ['focal', 'second'], size: 0.105, face: 0.6,
    varieties: [v('blush', 'pink', '#f3b7b9', '#fbe1dc'), v('coral', 'coral', '#ee6f5b', '#f9a58c'), v('butter', 'cream', '#f2dc9a', '#fbf2d6'), v('red', 'red', '#a3182a', '#cf2c3c'), v('white', 'white', '#efe9d6', '#fbf9f1'), v('peach', 'peach', '#f3a678', '#fbd3b2'), v('plum', 'wine', '#6e1f3f', '#9c3f60')],
    head: (v) => rose(v),
    stem: { r: 0.011, color: DARK_STEM, leaves: { n: 3, shape: { ...OVAL, len: 0.26 }, paint: LEAF } },
  },
  {
    id: 'sunflower', name: 'sunflower', plural: 'sunflowers', seasons: ['summer', 'fall'], roles: ['focal'], size: 0.16, face: 0.8, sway: 0.7,
    varieties: [v('golden', 'yellow', '#eeb417', '#f8d53b', '#4a2f1c'), v('rust', 'orange', '#a8431a', '#e08a26', '#2e1c14'), v('lemon', 'cream', '#eed66a', '#f8eea6', '#5a3d22')],
    head: (v) => ({
      rosette: {
        n: 34, whorl: 17, r: [0.42, 0.45], wild: 0.45, loose: 2,
        inner: { len: 0.7, width: 0.24, widest: 0.45, point: 1.8, claw: 0.5, open: 16, tip: 2, cup: 0.4, twist: 10 },
        outer: { len: 0.78, width: 0.25, widest: 0.45, point: 1.8, claw: 0.5, open: 4, tip: -14, cup: 0.4 },
        paint: { base: v.a, tip: v.b, veins: 0.18, deep: 0.85 },
        center: { disc: 0.46, height: 0.1, color: v.c!, rim: mix(v.c!, v.a, 0.45), heart: mix(v.c!, hex('#8a9a3a'), 0.35) },
        sepals: { n: 13, len: 0.42, color: STEM, open: 5 },
      },
    }),
    stem: { r: 0.018, color: STEM, leaves: { n: 2, shape: { len: 0.42, width: 0.3, widest: 0.35, point: 1.8, open: 35, tip: -20, fold: 0.2 }, paint: LEAF } },
  },
  {
    id: 'delphinium', name: 'delphinium', plural: 'delphiniums', seasons: ['summer'], roles: ['line'], size: 0.5, face: 0, sway: 1.1,
    varieties: [v('blue', 'blue', '#3d59c4', '#6f8fe6', '#f3f1ea'), v('sky', 'blue', '#86aee8', '#b9d2f4', '#f3f1ea'), v('white', 'white', '#eeeee6', '#fbfbf6', '#d9d6c0'), v('purple', 'purple', '#5a3aa0', '#8a68c9', '#2c2238'), v('pink', 'pink', '#e497b8', '#f5c9da', '#f3f1ea')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.016, 0.006], stalkColor: STEM, n: 30, from: 0.05, to: 0.97, size: [0.13, 0.05], tilt: [72, 30], buds: 8,
        item: floret(5, v.a, v.b, v.c, { width: 0.85 }),
        bud: { bead: { r: [0.3, 0.45], color: mix(v.a, STEM, 0.5), tip: v.a } },
      },
    }),
    stem: { r: 0.014, color: STEM },
  },
  {
    id: 'hydrangea', name: 'hydrangea', plural: 'hydrangeas', seasons: ['summer', 'fall'], roles: ['focal'], size: 0.17, face: 0.5, sway: 0.6,
    varieties: [v('blue', 'blue', '#6d8fd6', '#a9c0ee'), v('pink', 'pink', '#e58fb0', '#f4c3d4'), v('white', 'white', '#e9eedb', '#f8faf0'), v('antique green', 'green', '#9db36b', '#c9d39a'), v('plum', 'wine', '#7d3f66', '#b0718f')],
    head: (v) => ({ cluster: { n: 70, r: [0.95, 0.8], cap: 115, size: 0.3, heart: mix(v.a, hex('#5c7a4a'), 0.6), wild: 0.5, item: { rosette: { n: 4, whorl: 4, r: [0.06, 0.06], ...same({ len: 1, width: 1.05, widest: 0.6, point: 0.8, open: 22, tip: 0, cup: 0.25 }), paint: { base: v.a, tip: v.b, deep: 0.72, streak: 0.15 }, center: { disc: 0.1, height: 0.06, color: mul(v.a, 0.7) } } } } }),
    stem: { r: 0.016, color: STEM, leaves: { n: 2, shape: { len: 0.4, width: 0.28, widest: 0.42, point: 1.5, open: 40, tip: -10, fold: 0.2 }, paint: LEAF, from: 0.55, to: 0.9 } },
  },
  {
    id: 'daisy', name: 'daisy', plural: 'daisies', seasons: ['summer', 'spring'], roles: ['second', 'filler'], size: 0.085, face: 0.75,
    varieties: [v('white', 'white', '#f4f1e4', '#fdfcf6')],
    head: (v) => ({
      rosette: {
        n: 26, whorl: 13, r: [0.26, 0.28], wild: 0.3, loose: 2,
        inner: { len: 0.8, width: 0.2, widest: 0.6, point: 0.7, claw: 0.5, open: 12, tip: -4, cup: 0.25 },
        outer: { len: 0.86, width: 0.21, widest: 0.6, point: 0.7, claw: 0.5, open: 5, tip: -12, cup: 0.25 },
        paint: { base: v.a, tip: v.b, veins: 0.12, deep: 0.9 }, finish: { shade: 0.6 },
        center: { disc: 0.3, height: 0.12, color: YELLOW, heart: hex('#c99a1c') },
        sepals: { n: 8, len: 0.3, color: STEM },
      },
    }),
    stem: { r: 0.008, color: STEM, leaves: { n: 2, shape: { ...LONG, len: 0.25, lobes: 4, lobed: 0.4 }, paint: LEAF } },
  },
  {
    id: 'cosmos', name: 'cosmos', plural: 'cosmos', seasons: ['summer', 'fall'], roles: ['second', 'filler'], size: 0.085, face: 0.7, sway: 1.5,
    varieties: [v('pink', 'pink', '#e67aa8', '#f5b6cf'), v('white', 'white', '#f5f2ea', '#fdfdf9'), v('magenta', 'wine', '#a8235c', '#d1548a'), v('chocolate', 'brown', '#4a1a1c', '#75302c')],
    head: (v) => ({
      rosette: {
        n: 8, whorl: 8, r: [0.16, 0.16], wild: 0.4, loose: 2,
        ...same({ len: 1, width: 0.72, widest: 0.7, point: 0.35, claw: 0.25, notch: 0.1, open: 12, tip: -6, cup: 0.2, ruffle: 0.1, ruffles: 4 }),
        paint: { base: mul(v.a, 0.92), tip: v.b, veins: 0.22, deep: 0.85 }, finish: { shade: 0.75 },
        center: { disc: 0.17, height: 0.08, color: YELLOW, heart: hex('#b5791a') },
        sepals: { n: 8, len: 0.25, color: STEM },
      },
    }),
    stem: { r: 0.006, color: STEM, leaves: { n: 2, shape: { ...LONG, len: 0.2, width: 0.02 }, paint: LEAF } },
  },
  {
    id: 'zinnia', name: 'zinnia', plural: 'zinnias', seasons: ['summer', 'fall'], roles: ['second'], size: 0.08, face: 0.7,
    varieties: [v('coral', 'coral', '#ee6a52', '#f79a7c'), v('orange', 'orange', '#ef7f1f', '#f8ae4e'), v('pink', 'pink', '#e85f93', '#f49cbb'), v('lime', 'green', '#b5c85a', '#dbe49a'), v('red', 'red', '#c22026', '#e2523f'), v('yellow', 'yellow', '#f2c12b', '#f9de6a')],
    head: (v) => ({
      rosette: {
        n: 42, ease: 0.9, r: [0.16, 0.3], rise: 0.28, wild: 0.25, loose: 2,
        inner: { len: 0.45, width: 0.32, widest: 0.65, point: 0.5, claw: 0.4, open: 40, tip: 10, cup: 0.2 },
        outer: { len: 0.85, width: 0.42, widest: 0.65, point: 0.5, claw: 0.4, open: 6, tip: -14, cup: 0.2 },
        paint: { base: mul(v.a, 0.9), tip: v.b, veins: 0.1, deep: 0.7 },
        center: { disc: 0.17, height: 0.32, color: hex('#8a3a1c'), rim: YELLOW },
        sepals: { n: 8, len: 0.3, color: STEM },
      },
    }),
    stem: { r: 0.009, color: STEM, leaves: { n: 2, shape: { ...OVAL, len: 0.22 }, paint: LEAF, from: 0.6, to: 0.9 } },
  },
  {
    id: 'lavender', name: 'lavender', plural: 'lavender stems', seasons: ['summer'], roles: ['filler', 'line'], size: 0.2, face: 0, sway: 1.6,
    varieties: [v('lavender', 'lilac', '#7a63b8', '#a995dc'), v('deep', 'purple', '#55398f', '#7e5fba')],
    head: (v) => ({ along: { len: 1, stalk: [0.012, 0.008], stalkColor: SAGE, n: 30, from: 0.25, to: 1, per: 2, step: 68, size: [0.075, 0.05], tilt: [50, 20], off: 0.012, item: { bead: { r: [0.45, 0.8], color: mix(v.a, SAGE, 0.3), tip: v.b } } } }),
    stem: { r: 0.004, color: SAGE },
  },
  {
    id: 'lily', name: 'lily', plural: 'lilies', seasons: ['summer'], roles: ['focal'], size: 0.15, face: 0.9, sway: 0.8,
    varieties: [v('white', 'white', '#f3f1e2', '#fdfcf5', '#c7d68a'), v('stargazer', 'pink', '#d8437d', '#f6c2d6', '#f2e6a0'), v('orange', 'orange', '#ee7b1e', '#f7a94a', '#f4d04a'), v('yellow', 'yellow', '#f3cb3a', '#f9e382', '#d9e07a')],
    head: (v) => ({
      rosette: {
        n: 6, whorl: 3, r: [0.08, 0.1], wild: 0.3, loose: 1,
        inner: { len: 1, width: 0.42, widest: 0.5, point: 1.5, claw: 0.3, open: 62, tip: -50, bend: 2, cup: 0.3, ruffle: 0.1 },
        outer: { len: 1, width: 0.34, widest: 0.5, point: 1.6, claw: 0.3, open: 58, tip: -65, bend: 2, cup: 0.3 },
        paint: { base: v.a, tip: v.b, throat: v.c, throatTo: 0.35, veins: 0.12, spots: v.hue === 'white' ? 0 : 0.3, deep: 0.85, edge: v.hue === 'pink' ? hex('#fdf5f5') : undefined, edgeAt: 0.7 },
        center: { stamens: 6, len: 0.8, spread: 30, color: hex('#cfdc9a'), anther: hex('#9a4a1c'), dot: 0.035, pistil: hex('#b7cf7a') },
      },
    }),
    stem: { r: 0.014, color: DARK_STEM, leaves: { n: 5, shape: { ...LONG, len: 0.3, open: 45 }, paint: LEAF, from: 0.3, to: 0.95 } },
  },
  {
    id: 'snapdragon', name: 'snapdragon', plural: 'snapdragons', seasons: ['summer', 'spring'], roles: ['line'], size: 0.42, face: 0, sway: 1,
    varieties: [v('yellow', 'yellow', '#f2cb3c', '#f9e384'), v('pink', 'pink', '#e96f9e', '#f6b4cc'), v('white', 'white', '#f2efe2', '#fcfbf4'), v('coral', 'coral', '#ef6f52', '#f8a487'), v('burgundy', 'wine', '#7d1a36', '#ad3f5a')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.018, 0.007], stalkColor: STEM, n: 26, from: 0.08, to: 0.97, size: [0.12, 0.05], tilt: [60, 25], buds: 7,
        item: { rosette: { n: 5, whorl: 5, r: [0.2, 0.2], ...same({ len: 0.8, width: 0.85, widest: 0.65, point: 0.4, open: 78, tip: -30, bend: 3, cup: 0.4, ruffle: 0.25 }), paint: { base: mul(v.a, 0.9), tip: v.b, throat: mix(v.a, YELLOW, 0.5), deep: 0.8 } } },
        bud: { bead: { r: [0.32, 0.5], color: mix(v.a, STEM, 0.55), tip: v.a } },
      },
    }),
    stem: { r: 0.012, color: STEM, leaves: { n: 4, shape: { ...LONG, len: 0.2, open: 50 }, paint: LEAF, from: 0.5, to: 0.95 } },
  },
  {
    id: 'lace', name: "Queen Anne's lace", plural: "Queen Anne's lace", seasons: ['summer', 'fall'], roles: ['filler'], size: 0.13, face: 0.4, sway: 1.5,
    varieties: [v('white', 'white', '#f1f0e4', '#fcfcf6'), v('chocolate', 'wine', '#8a5a6a', '#c9a3ad')],
    head: (v) => ({ cluster: { n: 60, r: [1, 0.42], cap: 75, size: 0.17, rays: hex('#7fa05a'), wild: 0.4, item: { rosette: { n: 9, r: [0.2, 0.75], ...same({ len: 0.5, width: 0.5, point: 0.5, open: 15, tip: 0 }), paint: { base: v.a, tip: v.b, deep: 0.9 }, finish: { shade: 0.5 }, wild: 0.8 } } } }),
    stem: { r: 0.007, color: hex('#7fa05a') },
  },
  {
    id: 'gypsophila', name: "baby's breath", plural: "baby's breath", seasons: ['summer', 'spring', 'winter'], roles: ['filler'], size: 0.16, face: 0.2, sway: 1.5,
    varieties: [v('white', 'white', '#f3f1e8', '#fdfdf8')],
    head: (v) => ({
      spray: {
        n: 22, len: 1, spread: 62, twig: hex('#9db27e'), twigR: 0.006, size: 0.11, per: 2,
        item: { rosette: { n: 7, r: [0.05, 0.1], inner: { len: 0.8, width: 0.7, point: 0.6, open: 60, tip: 40, cup: 0.3 }, outer: { len: 1, width: 0.8, point: 0.6, open: 20, tip: 0, cup: 0.3 }, paint: { base: v.a, tip: v.b, deep: 0.9 }, finish: { shade: 0.5 } } },
      },
    }),
    stem: { r: 0.005, color: hex('#9db27e') },
  },

  // ——— fall
  {
    id: 'dahlia', name: 'dahlia', plural: 'dahlias', seasons: ['fall', 'summer'], roles: ['focal'], size: 0.13, face: 0.75, sway: 0.8,
    varieties: [v('café au lait', 'peach', '#e9c2a6', '#f8e6d6'), v('burgundy', 'wine', '#6a1228', '#a52c44'), v('orange', 'orange', '#e8691c', '#f6a246'), v('coral', 'coral', '#ee6a58', '#f9a58c'), v('plum', 'purple', '#6b2a66', '#a55a9c'), v('yellow', 'yellow', '#f0c22e', '#f9e27a'), v('red', 'red', '#b01c24', '#d9463a')],
    head: (v) => ({
      rosette: {
        n: 78, ease: 0.85, r: [0.02, 0.2], rise: 0.42, wild: 0.15, loose: 3,
        inner: { len: 0.3, width: 0.22, widest: 0.55, point: 1.3, claw: 0.5, open: 86, tip: 100, cup: 0.9 },
        outer: { len: 0.9, width: 0.42, widest: 0.55, point: 1.4, claw: 0.45, open: 2, tip: -22, bend: 1.5, cup: 0.75 },
        paint: { base: mul(v.a, 0.92), tip: v.b, deep: 0.58, veins: 0.06 },
        paintIn: { base: mul(v.a, 0.8), tip: v.a, deep: 0.5 },
        sepals: { n: 8, len: 0.35, color: STEM },
      },
    }),
    stem: { r: 0.012, color: DARK_STEM, leaves: { n: 2, shape: { ...OVAL, len: 0.28, lobes: 2, lobed: 0.3 }, paint: LEAF, from: 0.5, to: 0.85 } },
  },
  {
    id: 'mum', name: 'chrysanthemum', plural: 'chrysanthemums', seasons: ['fall', 'winter'], roles: ['second', 'focal'], size: 0.1, face: 0.7,
    varieties: [v('bronze', 'orange', '#b9571c', '#e69a3c'), v('yellow', 'yellow', '#ecb923', '#f7dc62'), v('white', 'white', '#f0eddc', '#fcfbf2'), v('mauve', 'lilac', '#a56a9a', '#d3a8c6'), v('red', 'red', '#992020', '#c9473a'), v('green', 'green', '#a8c24a', '#d5e08a')],
    head: (v) => ({
      rosette: {
        n: 110, ease: 0.9, r: [0.02, 0.16], rise: 0.5, wild: 0.3, loose: 3,
        inner: { len: 0.35, width: 0.14, widest: 0.55, point: 1, claw: 0.6, open: 88, tip: 150, cup: 0.8 },
        outer: { len: 1, width: 0.2, widest: 0.55, point: 1, claw: 0.6, open: 4, tip: 40, bend: 2.2, cup: 0.8 },
        paint: { base: mul(v.a, 0.9), tip: v.b, deep: 0.6 },
        paintIn: { base: mul(v.a, 0.8), tip: v.a, deep: 0.55 },
        sepals: { n: 10, len: 0.3, color: STEM },
      },
    }),
    stem: { r: 0.01, color: DARK_STEM, leaves: { n: 3, shape: { ...OVAL, len: 0.22, lobes: 3, lobed: 0.45 }, paint: LEAF, from: 0.4, to: 0.9 } },
  },
  {
    id: 'rudbeckia', name: 'black-eyed Susan', plural: 'black-eyed Susans', seasons: ['fall', 'summer'], roles: ['second'], size: 0.085, face: 0.7,
    varieties: [v('golden', 'yellow', '#eeb21c', '#f8d54a', '#2a1a14'), v('rust', 'orange', '#9a3a18', '#e89a2c', '#24150f')],
    head: (v) => ({
      rosette: {
        n: 14, whorl: 14, r: [0.22, 0.22], wild: 0.5, loose: 2,
        ...same({ len: 1, width: 0.34, widest: 0.5, point: 1, claw: 0.5, notch: 0.06, open: 6, tip: -32, bend: 1.6, cup: -0.25 }),
        paint: { base: v.a, tip: v.b, veins: 0.2, deep: 0.85, throat: mix(v.a, v.c!, 0.45), throatTo: 0.3 },
        center: { cone: 0.24, height: 0.3, color: v.c!, tip: mix(v.c!, hex('#7a6a2a'), 0.4) },
        sepals: { n: 10, len: 0.3, color: STEM },
      },
    }),
    stem: { r: 0.008, color: STEM, leaves: { n: 2, shape: { ...LONG, len: 0.22, width: 0.07 }, paint: LEAF } },
  },
  {
    id: 'marigold', name: 'marigold', plural: 'marigolds', seasons: ['fall', 'summer'], roles: ['second', 'filler'], size: 0.07, face: 0.5,
    varieties: [v('orange', 'orange', '#ea7a12', '#f6a437'), v('gold', 'yellow', '#eeb51a', '#f8d650')],
    head: (v) => ({
      rosette: {
        n: 70, ease: 1, r: [0.02, 0.22], rise: 0.7, wild: 0.6, loose: 2,
        inner: { len: 0.4, width: 0.34, widest: 0.7, point: 0.35, claw: 0.3, open: 85, tip: 60, cup: 0.3, ruffle: 0.5, ruffles: 4 },
        outer: { len: 0.8, width: 0.6, widest: 0.7, point: 0.35, claw: 0.3, open: 20, tip: -20, cup: 0.2, ruffle: 0.4, ruffles: 4 },
        paint: { base: mul(v.a, 0.88), tip: v.b, deep: 0.6 },
        sepals: { n: 1, len: 0.6, color: STEM, open: 60 },
      },
    }),
    stem: { r: 0.008, color: STEM, leaves: { n: 2, shape: { ...LONG, len: 0.2, lobes: 5, lobed: 0.6 }, paint: LEAF } },
  },
  {
    id: 'aster', name: 'aster', plural: 'asters', seasons: ['fall'], roles: ['filler'], size: 0.2, face: 0.3, sway: 1.3,
    varieties: [v('purple', 'purple', '#7651b8', '#a88ada'), v('pink', 'pink', '#d96fa3', '#f0adc9'), v('white', 'white', '#f1f0e8', '#fcfcf8')],
    head: (v) => ({
      spray: {
        n: 11, len: 1, spread: 50, twig: STEM, twigR: 0.012, size: 0.2,
        item: { rosette: { n: 22, whorl: 22, r: [0.22, 0.22], ...same({ len: 0.85, width: 0.13, widest: 0.6, point: 0.8, claw: 0.6, open: 10, tip: -6 }), paint: { base: v.a, tip: v.b, deep: 0.9 }, center: { disc: 0.24, height: 0.1, color: YELLOW }, wild: 0.5, loose: 1 } },
        leaf: { shape: { ...LONG, len: 0.25, width: 0.035 }, paint: LEAF },
      },
    }),
    stem: { r: 0.008, color: STEM },
  },
  {
    id: 'wheat', name: 'wheat', plural: 'wheat stalks', seasons: ['fall'], roles: ['line'], size: 0.3, face: 0, sway: 1.7,
    varieties: [v('golden', 'cream', '#c9a24e', '#ecd596')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.014, 0.008], stalkColor: v.a, droop: 14, n: 16, from: 0.3, to: 0.95, per: 2, step: 90, size: [0.085, 0.07], tilt: [20, 14], off: 0.01,
        item: { bead: { r: [0.4, 0.8], color: v.a, tip: v.b } },
        bud: { needles: 5, len: 4.2, spread: 16, color: v.b, width: 0.05 }, buds: 16,
      },
    }),
    stem: { r: 0.005, color: hex('#c9a24e') },
  },
  {
    id: 'hypericum', name: 'hypericum berries', plural: 'hypericum berry stems', seasons: ['fall', 'winter', 'summer'], roles: ['filler'], size: 0.13, face: 0.2, sway: 1,
    varieties: [v('red', 'red', '#b1262a', '#d95a4a'), v('peach', 'peach', '#e9a17c', '#f6cfae'), v('green', 'green', '#93ad4c', '#c3d184'), v('burgundy', 'wine', '#6a1a2c', '#96384a')],
    head: (v) => ({
      spray: {
        n: 9, len: 1, spread: 48, twig: hex('#7a6a3a'), twigR: 0.016, size: 0.15, per: 3,
        item: { bead: { r: [0.42, 0.52], color: v.a, tip: v.b, shine: 0.6, eye: hex('#3a2a1c') } },
        leaf: { shape: { ...OVAL, len: 0.36, width: 0.16 }, paint: LEAF },
      },
    }),
    stem: { r: 0.009, color: hex('#7a5a3a') },
  },
  {
    id: 'amaranthus', name: 'hanging amaranthus', plural: 'hanging amaranthus', seasons: ['fall', 'summer'], roles: ['filler', 'green'], size: 0.6, face: 0, sway: 1.6,
    varieties: [v('burgundy', 'wine', '#7c1c3a', '#a9365a'), v('green', 'green', '#93b254', '#c2d68c')],
    head: (v) => ({ along: { len: 1, stalk: [0.014, 0.008], stalkColor: mul(v.a, 0.8), droop: 172, n: 170, from: 0.18, to: 1, per: 2, step: 97, size: [0.014, 0.018], tilt: [80, 60], off: 0.008, wild: 0.9, item: { bead: { r: [0.7, 0.8], color: v.a, tip: v.b } } } }),
    stem: { r: 0.009, color: hex('#8a4a4a') },
  },
  {
    id: 'physalis', name: 'Chinese lantern', plural: 'Chinese lantern stems', seasons: ['fall'], roles: ['line'], size: 0.6, face: 0, sway: 1,
    varieties: [v('orange', 'orange', '#e8611a', '#f59a3a')],
    head: (v) => ({ along: { len: 1, stalk: [0.012, 0.005], stalkColor: hex('#8a7a4a'), droop: 30, n: 7, from: 0.25, to: 0.98, step: 160, size: [0.08, 0.05], tilt: [140, 120], off: 0.02, wild: 0.5, item: { bead: { r: [0.62, 0.85], color: v.b, tip: v.a, ribs: 10, shine: 0.1 } } } }),
    stem: { r: 0.008, color: hex('#8a7a4a') },
  },
  {
    id: 'sedum', name: 'sedum', plural: 'sedum heads', seasons: ['fall'], roles: ['filler'], size: 0.11, face: 0.3, sway: 0.7,
    varieties: [v('dusky pink', 'pink', '#b9677a', '#dba0aa'), v('rust', 'brown', '#8f4a36', '#bb7a5c'), v('green', 'green', '#9fb27a', '#c9d6a6')],
    head: (v) => ({ cluster: { n: 90, r: [1, 0.4], cap: 80, size: 0.14, heart: mix(v.a, STEM, 0.5), wild: 0.4, item: floret(5, v.a, v.b, mul(v.a, 0.6), { width: 0.6, point: 1.4 }) } }),
    stem: { r: 0.012, color: PALE_STEM, leaves: { n: 4, shape: { ...OVAL, len: 0.18, width: 0.11, point: 0.8 }, paint: leafOf('#7fa06a', '#9dba86') } },
  },
  {
    id: 'oak', name: 'oak leaves', plural: 'oak branches', seasons: ['fall'], roles: ['green'], size: 0.6, face: 0, sway: 1,
    varieties: [v('russet', 'orange', '#a8501c', '#d98a2e'), v('gold', 'yellow', '#c9952a', '#e6c458'), v('red', 'red', '#8f2a1e', '#c0503a')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.014, 0.004], stalkColor: WOOD, droop: 25, n: 10, from: 0.15, to: 1, step: 144, size: [0.3, 0.2], tilt: [65, 35], off: 0.01, wild: 0.7,
        item: { leaf: { len: 1, width: 0.6, widest: 0.6, point: 0.8, claw: 0.25, open: 0, tip: -15, fold: 0.25, lobes: 4, lobed: 0.55, twist: 15 }, paint: { base: mul(v.a, 0.9), tip: v.b, veins: 0.25, streak: 0.25, deep: 0.95 } },
      },
    }),
    stem: { r: 0.01, color: WOOD },
  },

  // ——— winter
  {
    id: 'amaryllis', name: 'amaryllis', plural: 'amaryllis', seasons: ['winter'], roles: ['focal'], size: 0.2, face: 0.1, sway: 0.5,
    varieties: [v('red', 'red', '#b01a22', '#d8392f', '#f4eec0'), v('white', 'white', '#f1efe0', '#fcfbf3', '#b9d07a'), v('candy stripe', 'pink', '#e0566e', '#f9e2e2', '#e9f0c0')],
    head: (v) => ({
      along: {
        len: 0.32, stalk: [0.09, 0.07], stalkColor: PALE_STEM, n: 3, from: 0.85, to: 1, step: 120, size: [0.85, 0.85], tilt: [78, 78], off: 0.05, wild: 0.15,
        item: {
          rosette: {
            n: 6, whorl: 3, r: [0.08, 0.1], wild: 0.25, loose: 1,
            inner: { len: 1, width: 0.6, widest: 0.6, point: 1.3, claw: 0.3, open: 72, tip: 0, bend: 2.6, cup: 0.35 },
            outer: { len: 1, width: 0.52, widest: 0.6, point: 1.3, claw: 0.3, open: 66, tip: -20, bend: 2.6, cup: 0.35 },
            paint: { base: v.a, tip: v.b, throat: v.c, throatTo: 0.3, veins: 0.14, streak: v.hue === 'pink' ? 0.5 : 0.08, deep: 0.85 },
            center: { stamens: 6, len: 0.75, spread: 16, color: hex('#e9e6c8'), anther: hex('#e6c24a'), dot: 0.05 },
          },
        },
      },
    }),
    stem: { r: 0.02, color: PALE_STEM },
  },
  {
    id: 'hellebore', name: 'hellebore', plural: 'hellebores', seasons: ['winter', 'spring'], roles: ['second'], size: 0.075, face: 0.9, sway: 1.1,
    varieties: [v('white', 'white', '#eef0dc', '#fafbf0', '#b9cf6a'), v('dusky plum', 'wine', '#5f2f4c', '#8f5a78', '#c9d08a'), v('green', 'green', '#a9c36a', '#d3e0a0', '#e6e08a'), v('blush', 'pink', '#d9a3ad', '#f1d6d6', '#c9d08a')],
    head: (v) => ({
      rosette: {
        n: 5, whorl: 5, r: [0.16, 0.16], wild: 0.35,
        ...same({ len: 1, width: 0.98, widest: 0.58, point: 0.9, claw: 0.35, open: 26, tip: 12, cup: 0.3 }),
        paint: { base: v.a, tip: v.b, veins: 0.14, spots: v.hue === 'wine' ? 0 : 0.2, deep: 0.85, throat: v.c, throatTo: 0.22 },
        center: { stamens: 26, len: 0.38, spread: 62, color: hex('#e3e0a8'), anther: hex('#f0e6a0'), pistil: v.c },
      },
    }),
    stem: { r: 0.009, color: hex('#7a8a5a'), nod: 45, leaves: { n: 1, shape: { ...OVAL, len: 0.22, lobes: 2, lobed: 0.3 }, paint: leafOf('#3f6a3a', '#5a8a4a'), from: 0.75, to: 0.9 } },
  },
  {
    id: 'poinsettia', name: 'poinsettia', plural: 'poinsettias', seasons: ['winter'], roles: ['focal'], size: 0.15, face: 0.85, sway: 0.7,
    varieties: [v('red', 'red', '#b3161f', '#da3a30'), v('white', 'cream', '#eee8c8', '#faf6e0'), v('blush', 'pink', '#e0909a', '#f4c6c6')],
    head: (v) => ({
      rosette: {
        n: 17, ease: 1, r: [0.06, 0.1], rise: 0.12, wild: 0.5, loose: 1,
        inner: { len: 0.5, width: 0.26, widest: 0.42, point: 2.2, claw: 0.15, open: 30, tip: 10, fold: 0.3 },
        outer: { len: 1, width: 0.5, widest: 0.42, point: 2.2, claw: 0.15, open: 8, tip: -18, fold: 0.3, lobes: 1, lobed: 0.12 },
        paint: { base: mul(v.a, 0.9), tip: v.b, veins: 0.3, deep: 0.8 },
        center: { cone: 0.1, height: 0.06, color: hex('#c9c23a'), tip: hex('#9a3a2a') },
      },
    }),
    stem: { r: 0.012, color: DARK_STEM, leaves: { n: 3, shape: { len: 0.4, width: 0.2, widest: 0.42, point: 2.2, open: 20, tip: -15, fold: 0.3 }, paint: leafOf('#27522c', '#3f7340'), from: 0.82, to: 0.97 } },
  },
  {
    id: 'camellia', name: 'camellia', plural: 'camellias', seasons: ['winter', 'spring'], roles: ['focal', 'second'], size: 0.095, face: 0.75, sway: 0.7,
    varieties: [v('red', 'red', '#b01c33', '#d6405a'), v('pink', 'pink', '#ea8ca9', '#f8c8d6'), v('white', 'white', '#f3efe2', '#fdfcf6')],
    head: (v) => ({
      rosette: {
        n: 40, ease: 0.9, r: [0.02, 0.18], rise: 0.25, wild: 0.12, loose: 2,
        inner: { len: 0.3, width: 0.3, widest: 0.6, point: 0.6, open: 85, tip: 100, cup: 0.5 },
        outer: { len: 0.95, width: 0.8, widest: 0.62, point: 0.55, open: 12, tip: -8, cup: 0.35 },
        paint: { base: mul(v.a, 0.92), tip: v.b, deep: 0.6 }, finish: { shine: 0.12 },
        paintIn: { base: mul(v.a, 0.85), tip: v.a, deep: 0.55 },
        sepals: { n: 5, len: 0.35, color: DARK_STEM },
      },
    }),
    stem: { r: 0.011, color: WOOD, leaves: { n: 3, shape: { ...OVAL, len: 0.3, width: 0.16 }, paint: { ...leafOf('#1f4a2a', '#2f6a3a'), veins: 0.1 }, from: 0.7, to: 0.97 } },
  },
  {
    id: 'paperwhite', name: 'paperwhite', plural: 'paperwhites', seasons: ['winter'], roles: ['filler', 'second'], size: 0.13, face: 0.3, sway: 1.1,
    varieties: [v('white', 'white', '#f4f2e6', '#fdfdf8', '#f1d04a')],
    head: (v) => ({
      spray: {
        n: 7, len: 0.9, spread: 55, twig: PALE_STEM, twigR: 0.02, size: 0.3,
        item: { rosette: { n: 6, whorl: 3, r: [0.14, 0.16], ...same({ len: 0.9, width: 0.6, widest: 0.5, point: 1.4, claw: 0.35, open: 6, tip: -4, cup: 0.15 }), paint: { base: v.a, tip: v.b, deep: 0.92 }, finish: { shade: 0.6 }, center: { corona: 0.24, len: 0.25, flare: 1.4, color: v.c! }, wild: 0.3 } },
      },
    }),
    stem: { r: 0.011, color: PALE_STEM, leaves: { n: 2, shape: { len: 0.6, width: 0.045, widest: 0.5, point: 1.2, open: 86, tip: 72, fold: 0.3 }, paint: leafOf('#6f9a55'), from: 0, to: 0.1 } },
  },
  {
    id: 'ilex', name: 'winterberry', plural: 'winterberry branches', seasons: ['winter', 'fall'], roles: ['line'], size: 0.7, face: 0, sway: 0.5,
    varieties: [v('red', 'red', '#c01a1e', '#e2402e'), v('orange', 'orange', '#e2671c', '#f29a3a')],
    head: (v) => ({ along: { len: 1, stalk: [0.015, 0.005], stalkColor: hex('#4a362c'), n: 30, from: 0.1, to: 0.99, per: 3, size: [0.034, 0.028], tilt: [85, 60], off: 0.014, wild: 1, item: { bead: { r: [0.5, 0.5], color: v.a, tip: v.b, shine: 0.7, eye: hex('#2a1c16') } } } }),
    stem: { r: 0.011, color: hex('#4a362c') },
  },
  {
    id: 'pinecone', name: 'pine cone', plural: 'pine cones', seasons: ['winter', 'fall'], roles: ['second'], size: 0.14, face: 0.3, sway: 0.5,
    varieties: [v('brown', 'brown', '#5a3a26', '#9a7350')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.2, 0.05], stalkColor: mul(v.a, 0.7), n: 56, from: 0.02, to: 0.97, size: [0.36, 0.14], tilt: [100, 25], off: 0.12, wild: 0.15,
        item: { leaf: { len: 1, width: 1, widest: 0.7, point: 0.4, claw: 0.5, open: 0, tip: 45, bend: 2, cup: -0.3 }, paint: { base: v.a, tip: v.b, deep: 0.55, edge: mul(v.b, 1.2), edgeAt: 0.8 } },
      },
    }),
    stem: { r: 0.012, color: WOOD },
  },
  {
    id: 'cotton', name: 'cotton', plural: 'cotton stems', seasons: ['winter', 'fall'], roles: ['second', 'line'], size: 0.42, face: 0, sway: 0.6,
    varieties: [v('white', 'white', '#f3f1ea', '#fdfdfb')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.022, 0.012], stalkColor: hex('#5a4030'), n: 4, from: 0.3, to: 1, step: 140, size: [0.17, 0.15], tilt: [55, 15], off: 0.03, wild: 0.5,
        item: { rosette: { n: 5, whorl: 5, r: [0.3, 0.3], ...same({ len: 0.9, width: 0.7, widest: 0.4, point: 2, open: 30, tip: 70, cup: 0.5 }), paint: { base: hex('#4a3526'), tip: hex('#8a6a4a'), deep: 0.9 }, center: { bolls: 4, r: 0.52, color: v.b } } },
      },
    }),
    stem: { r: 0.011, color: hex('#5a4030') },
  },
  {
    id: 'eryngium', name: 'sea holly', plural: 'sea holly stems', seasons: ['winter', 'summer', 'fall'], roles: ['filler'], size: 0.2, face: 0.2, sway: 0.9,
    varieties: [v('steel blue', 'blue', '#5f78a8', '#a3b6d6'), v('silver', 'white', '#a9b4b0', '#d9e0dc')],
    head: (v) => ({
      spray: {
        n: 5, len: 1, spread: 42, twig: mix(v.a, SAGE, 0.5), twigR: 0.02, size: 0.3,
        item: { rosette: { n: 11, whorl: 11, r: [0.3, 0.3], ...same({ len: 1, width: 0.2, widest: 0.3, point: 2.6, claw: 0.6, open: 12, tip: 30, fold: 0.5, lobes: 2, lobed: 0.4 }), paint: { base: v.a, tip: v.b, deep: 0.9 }, center: { cone: 0.32, height: 0.7, color: mul(v.a, 0.85), tip: v.b }, wild: 0.5 } },
      },
    }),
    stem: { r: 0.009, color: SAGE },
  },
  {
    id: 'waxflower', name: 'waxflower', plural: 'waxflower sprigs', seasons: ['winter', 'spring'], roles: ['filler'], size: 0.19, face: 0.2, sway: 1.2,
    varieties: [v('pink', 'pink', '#e493b3', '#f6cddb', '#8a2a4a'), v('white', 'white', '#f2f0e8', '#fdfcf8', '#9aa85a')],
    head: (v) => ({
      spray: {
        n: 16, len: 1, spread: 50, twig: hex('#6f7a4a'), twigR: 0.01, size: 0.1, per: 2,
        item: floret(5, v.a, v.b, v.c, { width: 0.95, point: 0.5 }),
        leaf: { shape: { ...LONG, len: 0.22, width: 0.02 }, paint: LEAF },
      },
    }),
    stem: { r: 0.007, color: hex('#6f7a4a') },
  },

  // ——— greenery
  {
    id: 'eucalyptus', name: 'eucalyptus', plural: 'eucalyptus stems', seasons: ['spring', 'summer', 'fall', 'winter'], roles: ['green'], size: 0.62, face: 0, sway: 1.2,
    varieties: [v('silver dollar', 'green', '#7f9c8e', '#a9bfb0')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.012, 0.004], stalkColor: hex('#8a7f6a'), droop: 35, n: 13, from: 0.08, to: 1, per: 2, step: 90, size: [0.2, 0.09], tilt: [70, 45], off: 0.01,
        item: { leaf: { len: 1, width: 1, widest: 0.5, point: 0.6, claw: 0.2, open: 0, tip: 10, cup: 0.12 }, paint: { base: v.a, tip: v.b, veins: 0.08, deep: 0.9 } },
      },
    }),
    stem: { r: 0.009, color: hex('#8a7f6a') },
  },
  {
    id: 'fern', name: 'fern', plural: 'fern fronds', seasons: ['spring', 'summer', 'fall'], roles: ['green'], size: 0.5, face: 0, sway: 1.3,
    varieties: [v('leatherleaf', 'green', '#2f6a35', '#4c8f45')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.01, 0.003], stalkColor: hex('#4a7a3c'), droop: 55, n: 22, from: 0.1, to: 1, per: 2, step: 0, size: [0.3, 0.04], tilt: [78, 60], wild: 0.12,
        item: { leaf: { len: 1, width: 0.34, widest: 0.3, point: 1.6, claw: 0.7, open: 0, tip: -12, lobes: 6, lobed: 0.45 }, paint: { base: v.a, tip: v.b, veins: 0.15, deep: 0.95 } },
      },
    }),
    stem: { r: 0.008, color: hex('#4a7a3c') },
  },
  {
    id: 'grass', name: 'grass', plural: 'grasses', seasons: ['summer', 'fall'], roles: ['green'], size: 0.6, face: 0, sway: 1.8,
    varieties: [v('green', 'green', '#5d8f3a', '#9fb85a'), v('dried', 'cream', '#b79a5c', '#e1cf98')],
    head: (v) => ({ blades: { n: 4, spread: 16, blade: { len: 1, width: 0.035, widest: 0.3, point: 2.5, claw: 0.7, open: 90, tip: 0, bend: 2.2, fold: 0.4 }, paint: { base: v.a, tip: v.b, deep: 0.95 } } }),
    stem: { r: 0.006, color: STEM },
  },
  {
    id: 'ruscus', name: 'ruscus', plural: 'ruscus stems', seasons: ['spring', 'summer', 'winter'], roles: ['green'], size: 0.52, face: 0, sway: 1,
    varieties: [v('green', 'green', '#2c6a34', '#4a9048')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.01, 0.004], stalkColor: hex('#3f7a3a'), droop: 40, n: 20, from: 0.05, to: 1, step: 165, size: [0.24, 0.14], tilt: [50, 35], wild: 0.4,
        item: { leaf: { len: 1, width: 0.42, widest: 0.4, point: 2, claw: 0.2, open: 0, tip: -8, fold: 0.15 }, paint: { base: v.a, tip: v.b, veins: 0.1, deep: 0.95 }, finish: { shine: 0.2 } },
      },
    }),
    stem: { r: 0.008, color: hex('#3f7a3a') },
  },
  {
    id: 'pine', name: 'pine', plural: 'pine sprigs', seasons: ['winter'], roles: ['green'], size: 0.5, face: 0, sway: 0.8,
    varieties: [v('green', 'green', '#2a5a3a', '#4a8558')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.02, 0.008], stalkColor: hex('#5a4030'), droop: 25, n: 26, from: 0.08, to: 1, per: 2, size: [0.2, 0.14], tilt: [55, 20], off: 0.01, wild: 0.6,
        item: { needles: 7, len: 1, spread: 26, color: mix(v.a, v.b, 0.5), width: 0.022 },
      },
    }),
    stem: { r: 0.012, color: hex('#5a4030') },
  },
  {
    id: 'holly', name: 'holly', plural: 'holly sprigs', seasons: ['winter'], roles: ['green'], size: 0.45, face: 0, sway: 0.6,
    varieties: [v('green', 'green', '#1d4a2a', '#2f6e3c', '#c01a1e')],
    head: (v) => ({
      along: {
        len: 1, stalk: [0.018, 0.006], stalkColor: hex('#4a4a30'), droop: 15, n: 12, from: 0.1, to: 1, step: 150, size: [0.3, 0.22], tilt: [60, 35], wild: 0.6,
        item: { leaf: { len: 1, width: 0.55, widest: 0.5, point: 2.2, claw: 0.2, open: 0, tip: -12, fold: 0.3, lobes: 4, lobed: 0.5, ruffle: 0.3, ruffles: 4 }, paint: { base: v.a, tip: v.b, veins: 0.06, deep: 0.95 }, finish: { shine: 0.35 } },
      },
    }),
    stem: { r: 0.011, color: hex('#4a4a30') },
  },
  {
    id: 'miller', name: 'dusty miller', plural: 'dusty miller', seasons: ['winter', 'fall', 'spring'], roles: ['green'], size: 0.3, face: 0.3, sway: 0.9,
    varieties: [v('silver', 'white', '#a9b5ad', '#dfe6e0')],
    head: (v) => ({ blades: { n: 9, spread: 60, wild: 0.5, blade: { len: 1, width: 0.42, widest: 0.6, point: 0.8, claw: 0.25, open: 90, tip: 30, bend: 1.5, fold: 0.2, lobes: 4, lobed: 0.6, ruffle: 0.2 }, paint: { base: v.a, tip: v.b, deep: 0.85 }, finish: { shade: 0.5 } } }),
    stem: { r: 0.009, color: hex('#a9b5ad') },
  },
]

/** A flower by its id. Throws when there is none. */
export function flower(id: string): Flower {
  const f = FLOWERS.find((x) => x.id === id)
  if (!f) throw new Error(`no flower ${id}`)
  return f
}

/** The flowers and greens a season offers. */
export const inSeason = (s: Season) => FLOWERS.filter((f) => f.seasons.includes(s))

/** A set of color families that go together, for one season. */
export interface Palette { id: string; label: string; hues: Hue[] }

/** The palettes a season's bouquets come in. Greens and browns go with all of them. */
export const PALETTES: Record<Season, Palette[]> = {
  spring: [
    { id: 'pastel', label: 'Pastel', hues: ['pink', 'lilac', 'peach', 'cream', 'white'] },
    { id: 'sunny', label: 'Sunny', hues: ['yellow', 'orange', 'blue', 'white', 'cream'] },
    { id: 'orchard', label: 'Orchard', hues: ['pink', 'coral', 'purple', 'white'] },
  ],
  summer: [
    { id: 'meadow', label: 'Meadow', hues: ['yellow', 'blue', 'white', 'lilac', 'cream'] },
    { id: 'sunset', label: 'Sunset', hues: ['coral', 'orange', 'peach', 'pink', 'yellow'] },
    { id: 'cool', label: 'Cool', hues: ['blue', 'purple', 'lilac', 'white', 'green'] },
  ],
  fall: [
    { id: 'harvest', label: 'Harvest', hues: ['orange', 'yellow', 'red', 'brown', 'cream'] },
    { id: 'jewel', label: 'Jewel', hues: ['wine', 'purple', 'red', 'coral', 'pink'] },
    { id: 'rustic', label: 'Rustic', hues: ['peach', 'brown', 'cream', 'orange', 'green', 'white'] },
  ],
  winter: [
    { id: 'evergreen', label: 'Evergreen', hues: ['red', 'white', 'green', 'brown'] },
    { id: 'frost', label: 'Frost', hues: ['white', 'blue', 'cream', 'green'] },
    { id: 'berry', label: 'Berry', hues: ['wine', 'red', 'pink', 'white'] },
  ],
}
