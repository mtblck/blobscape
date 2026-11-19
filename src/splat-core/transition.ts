/**
 * Screen transitions: how one picture gives way to the next when the scene changes. Each is a rule that says, for a
 * pixel and a moment, how much of the old picture still shows and how much of a cover color lies over the new one.
 * The page draws that over the live view (the new scene shows wherever neither does), so the new scene moves while
 * it arrives. Some go straight from old to new; the others close onto the cover color, then open onto the new scene.
 *
 * Pure, so Node tests can hold it; `TRANSITION_GLSL` is its shader twin (change both). Ranks and the hash are whole
 * numbers and plain arithmetic, so both give the same pixels. An idea from Silicon Jungle's Ink Studio, whose
 * transition presets these are a few of, reworked to draw over a live view.
 */

export type TransitionKind = 'fade' | 'black' | 'wipe' | 'clock' | 'blinds' | 'checker' | 'flood' | 'dither' | 'blocks' | 'iris' | 'diamond'

export interface Transition {
  id: TransitionKind
  /** Its name on its chip. */
  name: string
  /** Seconds it takes. */
  seconds: number
  /** Closes onto the cover color first, then opens onto the new scene, rather than going straight from one to the other. */
  through: boolean
}

export const TRANSITIONS: Transition[] = [
  { id: 'dither', name: 'Dither', seconds: 0.9, through: false },
  { id: 'fade', name: 'Cross-fade', seconds: 0.8, through: false },
  { id: 'black', name: 'Through black', seconds: 1.2, through: true },
  { id: 'iris', name: 'Iris', seconds: 1.3, through: true },
  { id: 'diamond', name: 'Diamond iris', seconds: 1.3, through: true },
  { id: 'wipe', name: 'Wipe', seconds: 0.8, through: false },
  { id: 'clock', name: 'Clock', seconds: 1, through: false },
  { id: 'blinds', name: 'Blinds', seconds: 0.9, through: false },
  { id: 'checker', name: 'Checkerboard', seconds: 0.9, through: false },
  { id: 'flood', name: 'Tile flood', seconds: 1, through: false },
  { id: 'blocks', name: 'Blocks', seconds: 1.2, through: true },
]

/** Kinds in the order the shader numbers them. */
export const KIND_NUMBER: Record<TransitionKind, number> = { fade: 0, black: 1, wipe: 2, clock: 3, blinds: 4, checker: 5, flood: 6, dither: 7, blocks: 8, iris: 9, diamond: 10 }

/** How a pixel's picture is made: `old` of the old picture and `cover` of the cover color over the live view, whose share is what is left. */
export interface Overlay { old: number; cover: number }

/** Blinds across the picture. */
export const BLIND_BANDS = 8
/** Tiles of the checkerboard, flood and blocks are this many cells a side. */
export const TILE_CELLS = 4
/** Blocks come in this many waves. */
export const BLOCK_WAVES = 12
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** A hash of three whole numbers under 2^24, as the shader works it out in unsigned 32-bit arithmetic: 0 to 1. */
export function transitionHash(x: number, y: number, seed: number): number {
  let n = (Math.imul(x, 1664525) + Math.imul(y, 1013904223) + Math.imul(seed, 374761393)) >>> 0
  n = Math.imul(n ^ (n >>> 16), 2246822519) >>> 0
  n = Math.imul(n ^ (n >>> 13), 3266489917) >>> 0
  n = (n ^ (n >>> 16)) >>> 0
  return (n >>> 8) / 16777216
}

/**
 * When pixel (`x`, `y`, counted from the top left) of a `w` × `h` picture turns, 0 to 1: it shows the new picture once
 * the transition's value reaches it. `cell` is the size of a cell in pixels (an art pixel, in pixel art), `seed` deals
 * the random ones. For the kinds that go through the cover, the same rank opens the new scene and, turned round,
 * closed the old one (an iris closes onto the middle and opens from it).
 */
export function rankAt(kind: TransitionKind, x: number, y: number, w: number, h: number, cell: number, seed: number): number {
  const cx = x + 0.5, cy = y + 0.5
  const tile = Math.max(1, cell * TILE_CELLS)
  const tx = Math.floor(cx / tile), ty = Math.floor(cy / tile)
  const short = Math.min(w, h)
  switch (kind) {
    case 'fade': case 'black': return 0
    case 'wipe': return cx / w
    case 'clock': {
      const a = Math.atan2(cx - w / 2, h / 2 - cy) / (2 * Math.PI)
      return a < 0 ? a + 1 : a
    }
    case 'blinds': {
      const s = (cy / h) * BLIND_BANDS, b = Math.floor(s)
      return ((b % 2) + (s - b)) * 0.5
    }
    case 'checker': return (((tx + ty) % 2) + transitionHash(tx, ty, seed)) * 0.5
    case 'flood': {
      const gx = Math.max(1, Math.floor(w / tile)), gy = Math.max(1, Math.floor(h / tile))
      const mx = Math.floor(gx / 2), my = Math.floor(gy / 2)
      const r = Math.hypot((tx - mx) / gx, (ty - my) / gy)
      return Math.min(0.995, (0.84 * r) / Math.hypot(0.5, 0.5) + 0.16 * transitionHash(tx, ty, seed))
    }
    case 'dither': {
      const px = Math.floor(cx / Math.max(1, cell)), py = Math.floor(cy / Math.max(1, cell))
      return (BAYER[(px & 3) + (py & 3) * 4] + 0.5) / 16
    }
    case 'blocks': return (Math.floor(transitionHash(tx, ty, seed) * BLOCK_WAVES) + 0.5) / BLOCK_WAVES
    case 'iris': case 'diamond': {
      const dx = Math.abs(cx - w / 2) / short, dy = Math.abs(cy - h / 2) / short
      const lx = w / 2 / short, ly = h / 2 / short
      return kind === 'iris' ? Math.hypot(dx, dy) / Math.hypot(lx, ly) : (dx + dy) / (lx + ly)
    }
  }
}

/** Eased in and out, so a transition starts and ends gently. */
export const eased = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

/** Whether a pixel of rank `rank` has turned at `value`. A fade turns smoothly. */
const turned = (kind: TransitionKind, rank: number, value: number) => (kind === 'fade' || kind === 'black' ? value : value >= rank ? 1 : 0)

/**
 * What lies over pixel (`x`, `y`) of the live view `progress` of the way through (0 to 1): at 0 the old picture
 * whole, at 1 nothing. Going through the cover, the first half closes the old picture onto it (by the rank turned
 * round) and the second opens it onto the new one.
 */
export function overlayAt(t: Transition, progress: number, x: number, y: number, w: number, h: number, cell: number, seed: number): Overlay {
  if (progress <= 0) return { old: 1, cover: 0 }
  if (progress >= 1) return { old: 0, cover: 0 }
  const rank = rankAt(t.id, x, y, w, h, cell, seed)
  if (!t.through) {
    const shown = turned(t.id, rank, eased(progress))
    return { old: 1 - shown, cover: 0 }
  }
  if (progress < 0.5) {
    const closed = turned(t.id, 1 - rank, eased(progress * 2))
    return { old: 1 - closed, cover: closed }
  }
  const shown = turned(t.id, rank, eased(progress * 2 - 1))
  return { old: 0, cover: 1 - shown }
}

/**
 * The shader twin of `overlayAt`, as a GLSL ES 3.0 fragment shader drawing the overlay: the old picture (`u_from`,
 * rows from the top) and the cover color, premultiplied by how much of each lies over the view.
 */
export const TRANSITION_GLSL = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_from;
uniform vec2 u_size;
uniform vec3 u_cover;
uniform float u_progress, u_cell, u_seed;
uniform int u_kind, u_through;
out vec4 outColor;
float hash3(uint x, uint y, uint seed) {
  uint n = x * 1664525u + y * 1013904223u + seed * 374761393u;
  n = (n ^ (n >> 16u)) * 2246822519u;
  n = (n ^ (n >> 13u)) * 3266489917u;
  n = n ^ (n >> 16u);
  return float(n >> 8u) / 16777216.0;
}
float rankAt(vec2 c) {
  float w = u_size.x, h = u_size.y, shortSide = min(w, h);
  float tile = max(1.0, u_cell * ${TILE_CELLS}.0);
  uint tx = uint(floor(c.x / tile)), ty = uint(floor(c.y / tile));
  uint seed = uint(u_seed);
  if (u_kind <= 1) return 0.0;
  if (u_kind == 2) return c.x / w;
  if (u_kind == 3) { float a = atan(c.x - w / 2.0, h / 2.0 - c.y) / 6.283185307179586; return a < 0.0 ? a + 1.0 : a; }
  if (u_kind == 4) { float s = c.y / h * ${BLIND_BANDS}.0, b = floor(s); return (mod(b, 2.0) + (s - b)) * 0.5; }
  if (u_kind == 5) return (float((tx + ty) % 2u) + hash3(tx, ty, seed)) * 0.5;
  if (u_kind == 6) {
    float gx = max(1.0, floor(w / tile)), gy = max(1.0, floor(h / tile));
    float mx = floor(gx / 2.0), my = floor(gy / 2.0);
    float r = length(vec2((float(tx) - mx) / gx, (float(ty) - my) / gy));
    return min(0.995, 0.84 * r / length(vec2(0.5)) + 0.16 * hash3(tx, ty, seed));
  }
  if (u_kind == 7) {
    const float bayer[16] = float[16](${BAYER.map((b) => `${b}.0`).join(', ')});
    int px = int(floor(c.x / max(1.0, u_cell))), py = int(floor(c.y / max(1.0, u_cell)));
    return (bayer[(px & 3) + (py & 3) * 4] + 0.5) / 16.0;
  }
  if (u_kind == 8) return (floor(hash3(tx, ty, seed) * ${BLOCK_WAVES}.0) + 0.5) / ${BLOCK_WAVES}.0;
  float dx = abs(c.x - w / 2.0) / shortSide, dy = abs(c.y - h / 2.0) / shortSide;
  float lx = w / 2.0 / shortSide, ly = h / 2.0 / shortSide;
  return u_kind == 9 ? length(vec2(dx, dy)) / length(vec2(lx, ly)) : (dx + dy) / (lx + ly);
}
float eased(float t) { return t <= 0.0 ? 0.0 : t >= 1.0 ? 1.0 : t * t * (3.0 - 2.0 * t); }
float turned(float rank, float value) { return u_kind <= 1 ? value : (value >= rank ? 1.0 : 0.0); }
void main() {
  // the pixel's place counted from the top left, as the CPU twin counts it
  vec2 c = vec2(floor(gl_FragCoord.x), floor(u_size.y - gl_FragCoord.y)) + 0.5;
  float old = 0.0, cover = 0.0;
  if (u_progress <= 0.0) old = 1.0;
  else if (u_progress < 1.0) {
    float rank = rankAt(c);
    if (u_through == 0) old = 1.0 - turned(rank, eased(u_progress));
    else if (u_progress < 0.5) { cover = turned(1.0 - rank, eased(u_progress * 2.0)); old = 1.0 - cover; }
    else cover = 1.0 - turned(rank, eased(u_progress * 2.0 - 1.0));
  }
  vec3 from = texture(u_from, c / u_size).rgb;
  outColor = vec4(from * old + u_cover * cover, old + cover);
}`
