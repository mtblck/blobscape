/**
 * Tech glitch (Matt's idea, 2026-11-19): pixel art underneath, and every so often a burst of signal corruption that
 * pops in and out, stepped rather than eased, like an unstable data stream. Three kinds, each one a way of reading the
 * finished art from somewhere else:
 *
 *   scanline jitter: bands of rows slid sideways (wrapping round, as a signal that lost its sync);
 *   color split: red read a few pixels to one side and blue to the other;
 *   block corruption: wide blocks of the art, gathered in strips, taken from another place, some with their channels turned.
 *
 * Everything is in art pixels, so the picture stays pixel art. When a burst comes and how it looks is a function of
 * the time alone, in steps (`pace` a second, fitted to a whole number of steps a loop), so a scene's loop exported
 * frame by frame joins up. `glitchAt` works that out once a frame on the CPU; what each row and block does is
 * `glitchHash`, a hash of whole numbers that the GPU works out the same way in unsigned 32-bit arithmetic, so the
 * live pass (pixelPass.ts `toScreen`) and `glitchArt` here, its CPU twin, agree exactly (change one, change both).
 */
import { makeFrame, type Frame } from './pixel.ts'

/** What the page's controls make. */
export interface GlitchLook {
  /** How often a burst comes, 0 (never) to 1 (most of the time). */
  amount: number
  /** How hard a burst is, 0 to 1: how far rows slide, channels split and how many blocks go. */
  strength: number
  /** A burst slides bands of rows sideways. */
  jitter: boolean
  /** A burst reads red to one side and blue to the other. */
  split: boolean
  /** A burst takes blocks of the art from somewhere else. */
  blocks: boolean
  /** Steps a second: a burst changes this often, never in between. */
  pace: number
  /** The scene's loop in seconds, where it has one: steps and bursts repeat with it. */
  loop?: number
  /** Under reduced motion: no bursts at all (a flicker is exactly what that asks to be spared). */
  still?: boolean
  /** Picks another run of bursts. */
  seed?: number
}

/** One step's glitch, in art pixels: what the pass is handed each frame. All whole numbers. */
export interface GlitchState {
  /** A burst is on. */
  on: boolean
  /** The step's own number for `glitchHash`, under 2^24. */
  key: number
  /** Most a row band slides either way, in art pixels (0: no jitter). */
  jitter: number
  /** Rows to a band. */
  band: number
  /** The share of bands that slide, as a threshold over 2^24. */
  rows: number
  /** How far red and blue are read to each side (0: no split). */
  split: number
  /** A corrupted block's height in art pixels (it is `BLOCK_WIDE` times as wide). */
  block: number
  /** The share of blocks corrupted, as a threshold over 2^24 (0: none). */
  blocks: number
}

/** A burst lasts this many steps at most. */
export const RUN_MOST = 4
/** The share of steps a burst starts on at `amount` 1. */
export const START_MOST = 0.3
/** At full strength, how far a band of rows slides either way. */
export const JITTER_MOST = 14
/** At full strength, how far red and blue are read to each side. */
export const SPLIT_MOST = 3
/** At full strength, the share of blocks corrupted. */
export const BLOCKS_MOST = 0.12
/** Steps a second the page offers. */
export const GLITCH_PACES = [8, 12, 20] as const

/** Two primes under 2^31 that spread a cell's two numbers before the hash. */
export const MIX_A = 0x2c1b3c6d, MIX_B = 0x297a2d39
/** The salts that keep a cell's draws apart: each is one question about a row band or a block. */
export const SALT = { slides: 1, slide: 2, broken: 3, fromX: 4, fromY: 5, turned: 6, strip: 7 } as const
/** Broken blocks gather in strips: this share of rows of blocks can break at all (a threshold over 2^24). */
export const STRIPS = 5592405
/** A broken block is this many times as wide as it is high, as a torn line of a picture is. */
export const BLOCK_WIDE = 3
/** The share of broken blocks whose channels are turned (a threshold over 2^24). */
export const TURNED = 4194304

const FULL = 16777216

/** The engine's blob hash (`lodRank` in splat-engine/lod.ts), 0 to 1 in steps of 2^-24: the same steps as the GPU's. */
function rank(i: number): number {
  let h = ((i ^ 61) ^ (i >>> 16)) >>> 0
  h = Math.imul(h, 9) >>> 0
  h = (h ^ (h >>> 4)) >>> 0
  h = Math.imul(h, 0x27d4eb2d) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return (h >>> 8) / FULL
}
const OFF: GlitchState = { on: false, key: 0, jitter: 0, band: 1, rows: 0, split: 0, block: 1, blocks: 0 }

/** A hash of a step number and a salt, 0 to 1, on the CPU only (what `glitchAt` decides). */
const draw = (k: number, salt: number, seed: number) => rank((Math.imul(k, MIX_A) ^ Math.imul(salt + seed * 97, MIX_B)) >>> 0)

/**
 * The 24-bit hash of a row band or block (`a`, `b`, whole and not negative) for one question (`salt`) in the step
 * `key`: the GPU's `glitchHash` in pixelPass.ts, in the same unsigned 32-bit steps.
 */
export function glitchHash(a: number, b: number, key: number, salt: number): number {
  return Math.floor(rank(((Math.imul(a, MIX_A) ^ Math.imul(b, MIX_B) ^ ((key + salt) >>> 0)) >>> 0)) * FULL)
}

/** A whole number from 0 to `m` − 1 out of a 24-bit hash, exact on both sides: (h · m) >> 24. */
export const pickOf = (h: number, m: number) => Math.floor((h * m) / FULL)

/** How many steps a loop of `loop` seconds holds at `pace` a second: whole, and at least one. */
export const stepsIn = (loop: number, pace: number) => Math.max(1, Math.round(loop * pace))

/** The step a moment falls in, and how many steps go round (0 where nothing loops). */
export function stepAt(t: number, look: GlitchLook): { k: number; n: number } {
  const pace = Math.max(1, look.pace)
  if (!look.loop || !(look.loop > 0)) return { k: Math.floor(t * pace + 1e-6), n: 0 }
  const n = stepsIn(look.loop, pace), u = (((t % look.loop) + look.loop) % look.loop) / look.loop
  return { k: Math.floor(u * n + 1e-6) % n, n }
}

/** The glitch at a moment: whether a burst is on and, if so, how it reads the art this step. */
export function glitchAt(t: number, look: GlitchLook): GlitchState {
  if (look.still || !(look.amount > 0) || !(look.jitter || look.split || look.blocks)) return OFF
  const { k, n } = stepAt(t, look)
  const seed = look.seed ?? 0
  const wrap = (j: number) => (n ? ((j % n) + n) % n : j)
  // a burst starts on some steps and runs a few: this step is in one when a start not long before still runs
  let from = -1
  for (let back = RUN_MOST - 1; back >= 0 && from < 0; back--) {
    const j = wrap(k - back)
    if (n && back >= n) continue
    if (draw(j, 1, seed) >= look.amount * START_MOST) continue
    if (back < 1 + Math.floor(draw(j, 2, seed) * RUN_MOST)) from = j
  }
  if (from < 0) return OFF
  // a burst has its own strength; within it every step reads the art afresh, so it flickers in steps
  const s = Math.max(0, Math.min(1, look.strength)) * (0.45 + 0.55 * draw(from, 3, seed))
  const at = (salt: number) => draw(k, salt, seed)
  const jitter = look.jitter ? Math.max(1, Math.round(s * JITTER_MOST * (0.35 + 0.65 * at(4)))) : 0
  const split = look.split ? Math.max(1, Math.round(s * SPLIT_MOST * (0.4 + 0.6 * at(5)))) : 0
  // only a third of the rows of blocks can break, so each takes three times the share: the same number broken, in strips
  const blocks = look.blocks ? Math.min(FULL, Math.floor(s * BLOCKS_MOST * 3 * (0.3 + 0.7 * at(6)) * FULL)) : 0
  return {
    on: true,
    key: Math.floor(at(7) * FULL),
    jitter,
    band: 1 + Math.floor(at(8) * 4),
    rows: Math.floor((0.12 + 0.45 * at(9)) * FULL),
    split,
    block: 3 + Math.floor(at(10) * 6),
    blocks,
  }
}

/**
 * Where the art pixel at column `x`, row `y` (from the top) reads from, in a picture `w` wide and `h` high:
 * `x` for green, red `split` to the right of it and blue `split` to the left, and whether its channels are turned.
 */
export function readFrom(x: number, y: number, w: number, h: number, g: GlitchState): { x: number; y: number; turned: boolean } {
  let sx = x, sy = y, turned = false
  if (g.jitter > 0) {
    const b = Math.floor(y / g.band)
    if (glitchHash(b, 0, g.key, SALT.slides) < g.rows) sx += pickOf(glitchHash(b, 0, g.key, SALT.slide), 2 * g.jitter + 1) - g.jitter
  }
  if (g.blocks > 0) {
    const bx = Math.floor(x / (g.block * BLOCK_WIDE)), by = Math.floor(y / g.block)
    if (glitchHash(by, 0, g.key, SALT.strip) < STRIPS && glitchHash(bx, by, g.key, SALT.broken) < g.blocks) {
      sx += (pickOf(glitchHash(bx, by, g.key, SALT.fromX), 7) - 3) * g.block * BLOCK_WIDE
      sy += (pickOf(glitchHash(bx, by, g.key, SALT.fromY), 5) - 2) * g.block
      turned = glitchHash(bx, by, g.key, SALT.turned) < TURNED
    }
  }
  return { x: wrapX(sx, w), y: Math.min(h - 1, Math.max(0, sy)), turned }
}

/** A column slid off one side comes in at the other. */
export const wrapX = (x: number, w: number) => ((x % w) + w) % w

/**
 * The finished art with this step's glitch laid on: the CPU twin of the live pass's last step (pixelPass.ts
 * `toScreen`). Off, it is the art itself.
 */
export function glitchArt(art: Frame, g: GlitchState): Frame {
  if (!g.on) return art
  const { width: w, height: h, data } = art
  const out = makeFrame(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = readFrom(x, y, w, h, g)
      const c = (f.y * w + f.x) * 4
      const r = (f.y * w + wrapX(f.x + g.split, w)) * 4
      const b = (f.y * w + wrapX(f.x - g.split, w)) * 4
      const rgb = [data[r], data[c + 1], data[b + 2]]
      const o = (y * w + x) * 4
      // turned: green, blue, red in place of red, green, blue
      if (f.turned) { out.data[o] = rgb[1]; out.data[o + 1] = rgb[2]; out.data[o + 2] = rgb[0] }
      else { out.data[o] = rgb[0]; out.data[o + 1] = rgb[1]; out.data[o + 2] = rgb[2] }
      out.data[o + 3] = Math.max(data[r + 3], data[c + 3], data[b + 3])
    }
  }
  return out
}
