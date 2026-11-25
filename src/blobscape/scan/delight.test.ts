import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linearToSrgb, srgbToLinear } from '../../splat-core/color.ts'
import { CAPTURED_AT, buildScene, capture, lampAt } from '../lighting/relight.ts'
import { litScan, takeOutLight, wayInWords } from './delight.ts'

// the Lighting is baked lesson's ball and box on a table, "scanned" under its lamp: every blob knows its true paint
const s = buildScene(0.35)
const scanned = s.blobs.clone()
const seen = capture(s)
for (let k = 0; k < seen.length; k++) scanned.color[k] = linearToSrgb(seen[k])
const delit = takeOutLight(scanned)

/** How far colors are from the true paint once scaled to it as a whole (mean, linear). */
function off(colors: Float32Array) {
  let num = 0, den = 0
  for (let k = 0; k < s.albedo.length; k++) { const c = srgbToLinear(colors[k]); num += c * s.albedo[k]; den += c * c }
  const g = num / den
  let e = 0
  for (let k = 0; k < s.albedo.length; k++) e += Math.abs(srgbToLinear(colors[k]) * g - s.albedo[k])
  return e / s.albedo.length
}

test('the scanned light is found from where the lamp stood', () => {
  const lamp = lampAt(CAPTURED_AT)
  const l = Math.hypot(...lamp)
  const dot = (delit.found.way[0] * lamp[0] + delit.found.way[1] * lamp[1] + delit.found.way[2] * lamp[2]) / l
  assert.ok(dot > 0.9, `found ${delit.found.way.map((v) => v.toFixed(2))} for ${lamp.map((v) => (v / l).toFixed(2))}`)
  assert.ok(delit.found.strength > 0.5 && delit.found.explained > 0.3, JSON.stringify(delit.found))
})

test('taking it out comes much closer to the true paint', () => {
  const before = off(scanned.color), after = off(delit.blobs.color)
  assert.ok(after < before * 0.6, `${before.toFixed(4)} → ${after.toFixed(4)}`)
})

test('outsides face out: the table up, the ball away from its middle', () => {
  let up = 0, table = 0
  for (let i = 0; i < s.blobs.count; i++) {
    if (!s.table[i]) continue
    // a scan never holds what lay hidden under things: leave out the table under and right beside the ball and box
    const x = s.blobs.center[i * 3], z = s.blobs.center[i * 3 + 2]
    if (Math.hypot(x + 0.35, z - 0.1) < 0.45 || (x > 0.05 && x < 0.69 && z > -0.45 && z < 0.19)) continue
    table++
    if (delit.normal[i * 3 + 1] > 0) up++
  }
  assert.ok(up / table > 0.9, `${up} of ${table}`)
  let agree = 0, n = 0
  for (let i = 0; i < s.blobs.count; i++) {
    if (s.table[i]) continue
    n++
    if (delit.normal[i * 3] * s.normal[i * 3] + delit.normal[i * 3 + 1] * s.normal[i * 3 + 1] + delit.normal[i * 3 + 2] * s.normal[i * 3 + 2] > 0) agree++
  }
  // the ball wedged a cell or two from the box, and its foot on the table, are hard to call either way
  assert.ok(agree / n > 0.8, `${agree} of ${n}`)
})

test('evenly lit paint is left almost as it was', () => {
  const even = s.blobs.clone()
  const r = takeOutLight(even)
  let most = 0
  for (let k = 0; k < even.count * 3; k++) most = Math.max(most, Math.abs(r.blobs.color[k] - even.color[k]))
  assert.ok(r.found.strength <= 0.5 || r.found.explained < 0.1, JSON.stringify(r.found))
  assert.ok(most < 0.35, `${most}`)
})

test('a baked sun lights the paint, facing it brighter than away', () => {
  const lit = litScan(delit, { dir: [0, 1, 0], ambient: 0.3, shadow: 0.8 })
  let top = 0, side = 0, nt = 0, ns = 0
  for (let i = 0; i < s.blobs.count; i++) {
    if (s.table[i]) continue
    const y = s.normal[i * 3 + 1], c = srgbToLinear(lit.color[i * 3]) / Math.max(srgbToLinear(delit.blobs.color[i * 3]), 1e-3)
    if (y > 0.8) { top += c; nt++ } else if (Math.abs(y) < 0.2) { side += c; ns++ }
  }
  assert.ok(top / nt > (side / ns) * 1.5, `${top / nt} vs ${side / ns}`)
})

test('the way in words', () => {
  assert.equal(wayInWords([0, 1, 0]), 'straight above')
  assert.equal(wayInWords([-0.5, 0.75, 0.43]), 'high up')
  assert.equal(wayInWords([0, 0.1, -1]), 'low down')
})
