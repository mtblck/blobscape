import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CEL_CAST, CEL_SHADE, CEL_TURN, SAME_COLOR, SHADOW_FAR, celColor, celTones, gatherColors, shadowView } from './cel.ts'
import { toOklab } from './color.ts'

test('light is cut into two tones, or three, and nothing in between away from an edge', () => {
  for (let f = 0; f <= 1.0001; f += 0.01) for (const through of [0, 0.2, 0.8, 1]) {
    const two = celTones(f, through), three = celTones(f, through, { tones: 3 })
    assert.equal(two.bright, 0)
    if (Math.abs(f - CEL_TURN) > 0.03 && Math.abs(through - CEL_CAST) > 0.03) assert.ok(two.lit === 0 || two.lit === 1, `facing ${f}, through ${through}: ${two.lit}`)
    assert.ok(three.bright <= three.lit && three.lit === two.lit)
  }
  assert.deepEqual(celTones(1, 1), { lit: 1, bright: 0 })
  assert.deepEqual(celTones(1, 1, { tones: 3 }), { lit: 1, bright: 1 })
  assert.equal(celTones(0.2, 1).lit, 0, 'turned away')
  assert.equal(celTones(1, 0).lit, 0, 'in a cast shadow')
  assert.equal(celTones(1, 0, { shadows: false }).lit, 1, 'cast shadows off')
  // a soft edge is wider, and still whole either side of it
  const soft = celTones(CEL_TURN + 0.05, 1, { soft: 1 }).lit
  assert.ok(soft > 0 && soft < 1)
  assert.equal(celTones(CEL_TURN + 0.05, 1).lit, 1)
})

test('shade multiplies a color, light leaves it, and the brightest tone goes toward white', () => {
  const rgb = [0.5, 0.25, 0.1]
  assert.deepEqual(celColor(rgb, { lit: 1, bright: 0 }, CEL_SHADE), rgb)
  celColor(rgb, { lit: 0, bright: 0 }, CEL_SHADE).forEach((c, k) => assert.ok(Math.abs(c - rgb[k] * CEL_SHADE[k]) < 1e-12))
  const top = celColor(rgb, { lit: 1, bright: 1 }, CEL_SHADE, 0.2)
  top.forEach((c, k) => assert.ok(c > rgb[k] && c < 1))
})

test('the light sees the whole scene from far off, and small moves of its bounds leave the view where it was', () => {
  const from = [0.4, 0.8, 0.45]
  const v = shadowView([0.3, 1.1, -0.2], 2.4, from)
  // the scene's ball is inside the view's
  assert.ok(Math.hypot(v.target[0] - 0.3, v.target[1] - 1.1, v.target[2] + 0.2) + 2.4 <= v.radius + 1e-9)
  assert.ok(v.near > 0 && Math.abs(v.far - v.near - 2 * v.radius) < 1e-9)
  // the ball just fits the view: its edge is a tangent of the cone
  assert.ok(Math.abs(Math.sin((v.fov * Math.PI) / 360) - 1 / SHADOW_FAR) < 1e-9)
  const len = Math.hypot(...from), d = [0, 1, 2].map((k) => (v.eye[k] - v.target[k]) / (v.radius * SHADOW_FAR))
  d.forEach((x, k) => assert.ok(Math.abs(x - from[k] / len) < 1e-9))
  // bounds that breathe as a creature moves give the same view
  assert.deepEqual(shadowView([0.31, 1.09, -0.21], 2.38, from), v)
  // straight overhead still has an up
  assert.deepEqual(shadowView([0, 0, 0], 1, [0, 1, 0]).up, [0, 0, -1])
})

test('a part\'s colors are gathered into a few: mottle becomes one color, a stripe stays, and parts keep to themselves', () => {
  // a part of mottled greens beside a part striped cream and gray
  const n = 600, color = new Float32Array(n * 3), partOf = new Uint16Array(n)
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < n; i++) {
    partOf[i] = i < 300 ? 0 : 1
    const c = i < 300 ? [0.3 + rand() * 0.04, 0.6 + rand() * 0.04, 0.25 + rand() * 0.04] : i % 2 ? [0.98, 0.96, 0.9] : [0.74, 0.73, 0.77]
    color.set(c, i * 3)
  }
  const flat = gatherColors(color, partOf, 3)
  const seen = (from: number, to: number) => new Set(Array.from({ length: to - from }, (_, k) => Array.from(flat.subarray((from + k) * 3, (from + k) * 3 + 3)).map((v) => v.toFixed(4)).join()))
  assert.equal(seen(0, 300).size, 1, 'the mottled part is one color')
  assert.equal(seen(300, 600).size, 2, 'the striped part keeps both')
  // each blob stays near its own color
  for (let i = 0; i < n; i++) {
    const a = toOklab([color[i * 3], color[i * 3 + 1], color[i * 3 + 2]]), b = toOklab([flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]])
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < SAME_COLOR)
  }
  assert.deepEqual(gatherColors(color, partOf, 3), flat, 'the same blobs give the same colors')
  // one color a part
  const one = gatherColors(color, partOf, 1)
  assert.equal(new Set(Array.from({ length: 300 }, (_, k) => one[(300 + k) * 3].toFixed(4))).size, 1)
})

test('speckle finer than the reach goes, and a stripe wider than it keeps its edge', () => {
  // a sheet of blobs, dark on the left half and light on the right, with lone blobs of the other color scattered in
  const side = 40, n = side * side, color = new Float32Array(n * 3), at = new Float32Array(n * 3)
  const dark = [0.1, 0.2, 0.5], light = [0.9, 0.9, 0.8]
  const lone = (x: number, y: number) => x % 7 === 3 && y % 5 === 2
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = y * side + x, left = x < side / 2
    color.set(lone(x, y) ? (left ? light : dark) : left ? dark : light, i * 3)
    at.set([x, y, 0], i * 3)
  }
  const plain = gatherColors(color, undefined, 2), tidy = gatherColors(color, undefined, 2, { at, reach: 1.5 })
  let speckPlain = 0, speck = 0, wrong = 0
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = y * side + x, isDark = tidy[i * 3] < 0.5
    if (lone(x, y)) { if ((plain[i * 3] < 0.5) !== x < side / 2) speckPlain++; if (isDark !== x < side / 2) speck++ }
    else if (isDark !== x < side / 2) wrong++
  }
  assert.ok(speckPlain > 30, 'without a reach the lone blobs stay')
  assert.equal(speck, 0, 'with one they take the color round them')
  assert.equal(wrong, 0, 'and the edge between the halves has not moved')
})
