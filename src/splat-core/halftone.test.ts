import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HALFTONE_PAPER, dotCover, halftoneAt, inkLinear, plateOff, printed, screenAt, separate, spotAt, spotLevel, type HalftoneLook } from './halftone.ts'
import { HALFTONE_SETS, HALFTONE_START, halftoneLook } from '../splat-engine/styles/halftoneLooks.ts'

const paper = inkLinear(HALFTONE_PAPER)
const setOf = (id: string) => HALFTONE_SETS.find((s) => s.id === id)!
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

test('a dot covers the share of its cell it is cut for', () => {
  const n = 120
  for (const area of [0.05, 0.2, 0.5, 0.8, 0.95]) {
    let inked = 0
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (spotAt((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5) > spotLevel(area)) inked++
    const got = inked / (n * n)
    if (Math.abs(got - area) > 0.01) assert.fail(`a dot cut for ${area} covers ${got.toFixed(3)}`)
  }
  assert.ok(spotLevel(0) >= 1 - 1e-6 && spotLevel(1) <= -1 + 1e-6, 'none and a full field')
})

test('a dot is round and in the middle while small, and its softened edge still covers its share', () => {
  assert.equal(dotCover(0, 0, 0.1, 0.05), 1)
  assert.equal(dotCover(0.45, 0.45, 0.1, 0.05), 0)
  assert.equal(dotCover(0.45, 0.45, 0.9, 0.05), 0, 'a large dot leaves a hole at the corners')
  assert.equal(dotCover(0.3, 0.3, 0, 0.05), 0)
  assert.equal(dotCover(0.3, 0.3, 1, 0.05), 1)
  const n = 80
  for (const area of [0.15, 0.5, 0.85]) {
    let sum = 0
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sum += dotCover((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5, area, 1 / 10)
    if (Math.abs(sum / (n * n) - area) > 0.02) assert.fail(`a softened dot for ${area} covers ${(sum / (n * n)).toFixed(3)}`)
  }
})

test('the separation prints a color back close to itself where the inks can make it', () => {
  const inks = setOf('process').inks
  const colors = inks.map((k) => inkLinear(k.color)), key = inks.findIndex((k) => k.key)
  for (const want of [[0.5, 0.5, 0.5], [0.8, 0.1, 0.1], [0.9, 0.8, 0.2], [0.3, 0.45, 0.75], [0.7, 0.5, 0.4], [0.9, 0.9, 0.9], [0.1, 0.5, 0.2]] as const) {
    const got = printed(paper, colors, separate(inkLinear(want), paper, colors, key)).map(toSrgb)
    const off = Math.max(...want.map((v, c) => Math.abs(v - got[c])))
    if (off > 0.06) assert.fail(`${want} prints as ${got.map((v) => v.toFixed(2))}`)
  }
})

test('black takes the grays in four color, and the colored inks stay out of a neutral', () => {
  const inks = setOf('process').inks
  const colors = inks.map((k) => inkLinear(k.color))
  const a = separate(inkLinear([0.3, 0.3, 0.3]), paper, colors, inks.findIndex((k) => k.key))
  assert.ok(a[0] > 0.4, `black ${a[0]}`)
  const red = separate(inkLinear([0.85, 0.15, 0.12]), paper, colors, 0)
  assert.ok(red[1] < 0.15, `no cyan in a red: ${red[1]}`)
  assert.ok(red[2] > 0.7 && red[3] > 0.7, 'a red is magenta and yellow')
})

test('one ink tells light from dark by luminance', () => {
  const ink = [inkLinear(setOf('newsprint').inks[0].color)]
  const light = separate(inkLinear([0.9, 0.9, 0.2]), paper, ink)[0], dark = separate(inkLinear([0.2, 0.2, 0.6]), paper, ink)[0]
  assert.ok(light < dark, 'yellow is lighter than navy')
  assert.equal(separate(paper, paper, ink)[0], 0, 'the paper is left bare')
})

test('a cell is turned with its screen and plates sit off true by the misregistration', () => {
  const a = screenAt(37, 12, 8, 0), b = screenAt(37, 12, 8, 45)
  assert.deepEqual(a.mid, [36, 12])
  assert.ok(Math.abs(a.u - 0.125) < 1e-9 && Math.abs(a.v) < 1e-9)
  // the point is the same distance from its cell's middle whichever way the screen is turned, measured in the screen
  const d = Math.hypot(37 - b.mid[0], 12 - b.mid[1])
  assert.ok(Math.abs(d - Math.hypot(b.u, b.v) * 8) < 1e-9)
  assert.deepEqual(plateOff(0, 0), [0, 0])
  assert.ok(Math.abs(Math.hypot(...plateOff(2, 3)) - 3) < 1e-9)
  const off = screenAt(37 + 2, 12 + 1, 8, 30, [2, 1])
  const on = screenAt(37, 12, 8, 30)
  assert.ok(Math.abs(off.u - on.u) < 1e-9 && Math.abs(off.v - on.v) < 1e-9, 'a plate off true moves its whole screen')
})

test('a flat gray picture prints, on average, as that gray; nothing prints as the sky or the bare paper', () => {
  const look: HalftoneLook = { ...halftoneLook({ ...HALFTONE_START, texture: 0, shift: 0 }) }
  const gray = inkLinear([0.45, 0.45, 0.45])
  const flat = () => [gray[0], gray[1], gray[2], 1]
  const w = 48, h = 48
  const sum = [0, 0, 0]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = halftoneAt(x + 0.5, y + 0.5, flat, w, h, look); for (let k = 0; k < 3; k++) sum[k] += c[k] / (w * h) }
  const got = sum.map(toSrgb)
  for (const v of got) assert.ok(Math.abs(v - 0.45) < 0.05, `prints as ${got.map((x) => x.toFixed(3))}`)
  const empty = () => [0, 0, 0, 0]
  const bare = halftoneAt(10, 10, empty, w, h, { ...look, sky: undefined })
  bare.forEach((v, k) => assert.ok(Math.abs(v - paper[k]) < 1e-9, 'bare paper'))
  // with a sky, the empty picture is printed in it: darker than the paper somewhere
  let darker = 0
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) if (halftoneAt(x + 0.5, y + 0.5, empty, w, h, look)[2] < paper[2] - 0.05) darker++
  assert.ok(darker > 0)
})

test('every set of inks has at most one key and four inks, and the look carries the choice', () => {
  for (const s of HALFTONE_SETS) {
    assert.ok(s.inks.length >= 1 && s.inks.length <= 4, s.id)
    assert.ok(s.inks.filter((k) => k.key).length <= 1, s.id)
    assert.equal(new Set(s.inks.map((k) => k.angle)).size, s.inks.length, `${s.id}: each ink on its own angle`)
  }
  const look = halftoneLook({ ...HALFTONE_START, inks: 'duotone', sky: false }, [[255, 0, 0], [0, 0, 255]])
  assert.equal(look.inks.length, 2)
  assert.equal(look.sky, undefined)
  assert.deepEqual(halftoneLook(HALFTONE_START, [[255, 0, 0], [0, 0, 255]]).sky, [[1, 0, 0], [0, 0, 1]])
})
