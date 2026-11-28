// Blobscape's portfolio covers: one scene, drawn twice (2400 × 800 and 1000 × 800).
//
// Verb: Blobscape *builds scenes out of soft blobs*. Picture: a small landscape
// on a horizon, a tree, a hill and a rock, each made of overlapping see-through
// ellipses (splats), with a few blobs still drifting down into place. In the
// middle the mark's own blob, the coral Gaussian with eyes, sits on the axis
// and watches: the mark is a splat, so it belongs in a scene made of them.
// Front-on elevation throughout. Flat fills, no gradients; the only effect is
// each splat's own opacity, which is what a splat is.
//
//   node brand/portfolio/draw.mjs     writes cover.svg and cover-mobile.svg next to this file
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const C = {
  paper: '#fbf6ee',
  haze: '#fde4dc',
  deep: '#1d2440',
  deepSoft: '#3a4470',
  blob: '#f2553a',
  sage: '#7f9c86',
  sageLight: '#a9c1ad',
  stone: '#cfc5b6',
}

// The mark's blob and eyes, from src/shared/logoPaths.ts (a 256 grid, its axis at y 204–224).
const BLOB = 'M28,177.74l2,-1.38l2,-1.46l2,-1.54l2,-1.61l2,-1.69l2,-1.77l2,-1.84l2,-1.91l2,-2l2,-2.06l2,-2.14l2,-2.21l2,-2.27l2,-2.34l2,-2.4l2,-2.45l2,-2.51l2,-2.55l2,-2.6l2,-2.63l2,-2.65l4,-5.38l2,-2.71l4,-5.4l2,-2.68l2,-2.65l2,-2.62l2,-2.58l2,-2.53l2,-2.46l2,-2.4l2,-2.31l2,-2.23l2,-2.13l2,-2.02l2,-1.91l2,-1.79l2,-1.66l2,-1.52l2,-1.39l2,-1.23l2,-1.08l2,-0.92l2,-0.77l2,-0.59l2,-0.43l2,-0.25l2,-0.09l2,0.09l2,0.25l2,0.43l2,0.59l2,0.77l2,0.92l2,1.08l2,1.23l2,1.39l2,1.52l2,1.66l2,1.79l2,1.91l2,2.02l2,2.13l2,2.23l2,2.31l2,2.4l2,2.46l2,2.53l2,2.58l2,2.62l2,2.65l2,2.68l4,5.4l2,2.71l4,5.38l2,2.65l2,2.63l2,2.6l2,2.55l2,2.51l2,2.45l2,2.4l2,2.34l2,2.27l2,2.21l2,2.14l2,2.06l2,2l2,1.91l2,1.84l2,1.77l2,1.69l2,1.61l2,1.54l2,1.46l2,1.38c3.62,2.47 5.21,7.02 3.92,11.21c-1.29,4.19 -5.17,7.05 -9.56,7.05h-188.72c-4.39,0 -8.26,-2.86 -9.56,-7.05c-1.29,-4.19 0.29,-8.74 3.92,-11.21zM93,140c0,10.49 5.82,19 13,19c7.18,0 13,-8.51 13,-19c0,-10.49 -5.82,-19 -13,-19c-7.18,0 -13,8.51 -13,19zM137,140c0,10.49 5.82,19 13,19c7.18,0 13,-8.51 13,-19c0,-10.49 -5.82,-19 -13,-19c-7.18,0 -13,8.51 -13,19z'

/** A small seeded random, so the splats land in the same places every run. */
function random(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r1 = (n) => Math.round(n * 10) / 10

/** One splat: an ellipse turned by `a` degrees, flat color, its own opacity. */
const splat = (x, y, rx, ry, a, fill, o) =>
  `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" transform="rotate(${r1(a)} ${r1(x)} ${r1(y)})" fill="${fill}" fill-opacity="${o}"/>`

/** Fill a rough shape (inside(x, y) → bool, within a box) with `n` splats. */
function splats(rand, n, box, inside, size, colors, opacity) {
  const out = []
  let tries = 0
  while (out.length < n && tries++ < n * 40) {
    const x = box[0] + rand() * (box[2] - box[0])
    const y = box[1] + rand() * (box[3] - box[1])
    if (!inside(x, y)) continue
    const rx = size * (0.7 + rand() * 0.6)
    const ry = rx * (0.45 + rand() * 0.3)
    out.push(splat(x, y, rx, ry, rand() * 180, colors[Math.floor(rand() * colors.length)], opacity))
  }
  return out.join('')
}

function scene(W, H, { title, s, tree, hill, rock, drift, seed }) {
  const rand = random(seed)
  const cx = W / 2
  const horizon = 560 // the axis line the scene stands on
  const p = []
  p.push(`<rect width="${W}" height="${H}" fill="${C.paper}"/>`)
  // Ground below the axis, edge to edge.
  p.push(`<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="${C.haze}"/>`)

  // The hill: a wide, low bell of sage splats behind everything, its foot on the axis.
  {
    const [hx, hw, hh] = hill
    const top = (x) => horizon - hh * Math.exp(-(((x - hx) / (hw / 4)) ** 2) / 2)
    p.push(splats(rand, Math.round(70 * s), [hx - hw / 2, horizon - hh, hx + hw / 2, horizon], (x, y) => y > top(x) + 14 * s && y < horizon - 34 * s, 46 * s, [C.sageLight, C.sage], 0.55))
  }
  // The tree: a trunk of two long thin splats and a round crown of many.
  {
    const [tx, th] = tree
    const crownY = horizon - th, crownR = th * 0.36
    p.push(splat(tx - 5 * s, horizon - th * 0.36, th * 0.38, 15 * s, 91, C.deepSoft, 0.9))
    p.push(splat(tx + 7 * s, horizon - th * 0.5, th * 0.26, 10 * s, 84, C.deep, 0.8))
    p.push(splats(rand, Math.round(60 * s + 20), [tx - crownR, crownY - crownR, tx + crownR, crownY + crownR], (x, y) => (x - tx) ** 2 + ((y - crownY) * 1.12) ** 2 < crownR * crownR, 40 * s, [C.sage, C.sageLight, C.deepSoft], 0.62))
  }
  // The rock: a squat cluster of stone and deep splats.
  {
    const [rx, rw] = rock
    const rh = rw * 0.5
    p.push(splats(rand, Math.round(26 * s + 8), [rx - rw / 2, horizon - rh, rx + rw / 2, horizon], (x, y) => ((x - rx) / (rw / 2)) ** 2 + ((y - horizon) / rh) ** 2 < 1 && y < horizon - 22 * s, 30 * s, [C.stone, C.stone, C.deepSoft], 0.7))
  }
  // A few blobs still drifting down into place over the scene: one line each, in a fall.
  for (const [x, y, w] of drift) {
    p.push(splat(cx + x, y, w, w * 0.6, 20 + rand() * 40, C.sage, 0.6))
    p.push(`<rect x="${r1(cx + x - 3)}" y="${r1(y - w * 2.6)}" width="6" height="${r1(w * 1.6)}" rx="3" fill="${C.deepSoft}" fill-opacity="0.25"/>`)
  }
  // The axis: the mark's round-ended bar, as the scene's horizon, stopped short of the quiet edges.
  const ax0 = W * 0.08, ax1 = W * 0.92, aw = 20 * s
  p.push(`<rect x="${r1(ax0)}" y="${r1(horizon - aw / 2)}" width="${r1(ax1 - ax0)}" height="${r1(aw)}" rx="${r1(aw / 2)}" fill="${C.deep}"/>`)
  // The focal point: the coral Gaussian with eyes, sitting on the axis in the middle.
  {
    const k = 1.25 * s
    // In the mark, the bell's foot is at y 196 and it is centered on x 128.
    p.push(`<path d="${BLOB}" transform="translate(${r1(cx - 128 * k)} ${r1(horizon - aw / 2 - 8 * k - 196 * k)}) scale(${k})" fill="${C.blob}" fill-rule="evenodd"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}"><title>${title}</title>${p.join('')}</svg>\n`
}

const brand = JSON.parse((await import('node:fs')).readFileSync(join(here, '..', 'brand.json'), 'utf8'))
const alt = brand.portfolio.alt

writeFileSync(
  join(here, 'cover.svg'),
  scene(2400, 800, {
    title: alt,
    seed: 7,
    s: 1,
    tree: [780, 330],
    hill: [1660, 620, 220],
    rock: [1470, 170],
    drift: [[-200, 170, 22], [260, 120, 18], [520, 230, 16]],
  })
)
writeFileSync(
  join(here, 'cover-mobile.svg'),
  scene(1000, 800, {
    title: alt,
    seed: 7,
    s: 0.9,
    tree: [290, 280],
    hill: [740, 320, 180],
    rock: [630, 120],
    drift: [[-80, 170, 19], [180, 140, 16]],
  })
)
console.log('alt:', alt)
