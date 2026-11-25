import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CRT_BACK, THERMAL_STOPS, clayFrame, clayShade, pressed, printProfile, crtAt, crtCurve, dimPlaces, dimsAt, gridAt, heatOf, hollowOf, paletteRamp, printAt, PRINT_LIP, rampAt, scanShade,
  shadowAt, thermalAt, tileAt, tileCover, toLinear, wobbleAt, type Picture, type ThermalLook,
} from './filters.ts'
import { THERMAL_RAMPS, blueprintColors, BLUEPRINT_START, THERMAL_START, thermalLook } from '../splat-engine/styles/filterLooks.ts'

const iron: ThermalLook = { kind: 'thermal', ramp: THERMAL_RAMPS[0].ramp }

test('a heat ramp runs from its first color to its last, and stepped takes whole stops', () => {
  const ramp = [[0, 0, 0], [0.5, 0, 0], [1, 1, 1]]
  assert.deepEqual(rampAt(ramp, 0), [0, 0, 0])
  assert.deepEqual(rampAt(ramp, 1), [1, 1, 1])
  assert.deepEqual(rampAt(ramp, 2), [1, 1, 1], 'past the top holds the top')
  assert.deepEqual(rampAt(ramp, 0.25), [0.25, 0, 0])
  assert.deepEqual(rampAt(ramp, 0.3, true), [0.5, 0, 0])
})

test('a palette becomes a heat ramp from its darkest color to its lightest, at most a few stops', () => {
  const r = paletteRamp([[255, 255, 255], [0, 0, 0], [128, 20, 20], [0, 0, 0]])
  assert.equal(r.length, 3, 'repeats once')
  assert.deepEqual(r[0], [0, 0, 0])
  assert.deepEqual(r[2], [1, 1, 1])
  const many = paletteRamp(Array.from({ length: 30 }, (_, i) => [i * 8, i * 8, i * 8]))
  assert.equal(many.length, THERMAL_STOPS)
  for (let i = 1; i < many.length; i++) assert.ok(many[i][0] >= many[i - 1][0])
  const look = thermalLook({ ...THERMAL_START, palette: 'x' }, [[10, 10, 10], [250, 200, 0]])
  assert.ok(look.stepped, 'a palette is stepped through, not blended')
})

test('a flame runs hotter than a lit wall, a white cloud cooler than a dark field in the same light, and the sky is cold', () => {
  const flame = heatOf([3, 1.5, 0.3], iron), wall = heatOf([0.6, 0.45, 0.3], iron)
  const cloud = heatOf([0.9, 0.9, 0.9], iron), field = heatOf([0.4, 0.5, 0.2], iron)
  assert.ok(flame > wall + 0.5, `flame ${flame} wall ${wall}`)
  assert.ok(cloud < field + 0.05, `cloud ${cloud} field ${field}`)
  const white = heatOf([4, 4, 4], iron)
  assert.ok(white < flame, 'a white glow (the moon) is not a fire')
  const empty: Picture = () => [0, 0, 0, 0]
  const sky = thermalAt(10, 10, empty, 100, { ...iron, noise: 0 })
  const fire: Picture = () => [3, 1.5, 0.3, 1]
  const hot = thermalAt(10, 10, fire, 100, { ...iron, noise: 0 })
  assert.ok(hot[0] + hot[1] + hot[2] > sky[0] + sky[1] + sky[2] + 1)
})

test('a fire warms what is round it on the screen', () => {
  const look = { ...iron, noise: 0 }
  const wall: Picture = () => [0.2, 0.2, 0.2, 1]
  const byFire: Picture = (x) => (x > 15 ? [3, 1.5, 0.3, 1] : [0.2, 0.2, 0.2, 1])
  const lum = (c: number[]) => c[0] + c[1] + c[2]
  assert.ok(lum(thermalAt(10, 10, byFire, 100, look)) > lum(thermalAt(10, 10, wall, 100, look)))
})

test('the television bulges, dims between scanlines, and its wobble joins round the loop', () => {
  assert.deepEqual(crtCurve(0.5, 0.5, 0.4), [0.5, 0.5])
  assert.equal(crtCurve(0, 0, 1), undefined, 'the corners fall off the tube')
  assert.ok(crtCurve(0, 0, 0))
  assert.ok(scanShade(0.5, 1) > scanShade(0, 1))
  assert.equal(scanShade(0, 0), 1, 'no scanlines, no change')
  const look = { kind: 'crt' as const, period: 12 }
  for (const v of [0.1, 0.5, 0.9]) assert.ok(Math.abs(wobbleAt(v, 40, 0, look) - wobbleAt(v, 40, 12, look)) < 1e-6)
  const still = { ...look, still: true }
  assert.equal(wobbleAt(0.5, 40, 3, still), wobbleAt(0.5, 40, 0, still))
  const empty: Picture = () => [0, 0, 0, 0]
  const at = crtAt(50, 50, empty, 100, 100, { kind: 'crt', noise: 0, curve: 0, scan: 0, wobble: 0 })
  const sky = toLinear(CRT_BACK[0]).map((t, i) => (t + toLinear(CRT_BACK[1])[i]) / 2)
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(at[i] - sky[i]) < 0.02, 'an empty screen shows the backdrop')
})

test('the blueprint grid draws heavier every fifth line, and dimension lines sit beside the subject', () => {
  assert.ok(gridAt(0, 7, 16) > gridAt(16, 7, 16), 'the fifth line is heavier')
  assert.ok(gridAt(16, 7, 16) > 0)
  assert.equal(gridAt(8, 8, 16), 0, 'between lines is clear')
  const box = [100, 100, 300, 200] as const
  const p = dimPlaces(box, 800, 600)!
  assert.ok(p.yd > 200 && p.xd > 300, 'under and to the right where there is room')
  const tight = dimPlaces([100, 100, 795, 595], 800, 600)!
  assert.ok(tight.yd < 100 && tight.xd < 100, 'over and to the left where there is not')
  assert.equal(dimPlaces([0, 0, 10, 10], 800, 600), undefined, 'none for a tiny box')
  assert.ok(dimsAt(200, p.yd, box, 800, 600) > 0.9)
  assert.equal(dimsAt(200, 150, box, 800, 600), 0, 'none over the subject')
})

test('tiles cover their middles, leave grout at their edges, and bricks shift every other row', () => {
  const t = tileAt(15, 5, 10)
  assert.deepEqual(t.cell, [1, 0])
  assert.deepEqual(t.mid, [15, 5])
  assert.equal(tileCover(0, 0, t.cell, 10, 1.5), 1)
  assert.equal(tileCover(0.5, 0.5, t.cell, 10, 1.5), 0)
  const b = tileAt(15, 15, 10, true)
  assert.deepEqual(b.mid, [20, 15], 'the second row is half a tile along')
})

test('a nearer layer casts on the one behind it toward the light, and the card takes any shadow', () => {
  // a layer at depth 1 covers x < 50; the one behind it (depth 2) is everywhere else, and the card is under y > 80
  const at = (x: number, y: number) => (y > 80 ? { depth: 0, part: -1 } : x < 50 ? { depth: 1, part: 1 } : { depth: 2, part: 2 })
  const look = { kind: 'cutout' as const, light: 180, shadow: 6, soft: 0 }
  assert.equal(shadowAt(53, 40, at, look), 1, 'just right of the near layer, with the light on the left')
  assert.equal(shadowAt(70, 40, at, look), 0)
  assert.equal(shadowAt(30, 40, at, look), 0, 'the near layer itself is lit')
  assert.equal(shadowAt(70, 90, (_x, y) => (y < 85 ? { depth: 2, part: 2 } : { depth: 0, part: -1 }), { kind: 'cutout', light: 90, shadow: 6, soft: 0 }), 1)
})

test('clay is shut in where nearer clay surrounds it, held still between stop-motion frames, and lit from the top left', () => {
  assert.equal(hollowOf(10, [10, 10, 0]), 0)
  assert.equal(hollowOf(10, [9, 9]), 1)
  assert.equal(hollowOf(0, [1]), 0, 'no clay, no crease')
  assert.equal(clayFrame(0.05, 12), 0)
  assert.equal(clayFrame(1 / 12, 12), 1)
  assert.equal(clayFrame(5, 0), 0)
  const up = clayShade([-0.45, 0.6, 0.66], 0).shade, away = clayShade([0.45, -0.6, -0.66], 0).shade
  assert.ok(up > away)
  const [bottom] = printProfile(0), [lip] = printProfile(1), [, wall] = printProfile(0.5)
  assert.ok(bottom < -0.99 && lip > 0 && wall > 0, 'a print is a dent with a lip, rising outward')
  // a dent in clay facing the viewer: its wall toward the light (up and left) faces away from it, the far wall into it
  const face = [0, 0, 1] as const
  const near = pressed(face, [-0.8, 0.8, 0], -0.5, 1), far = pressed(face, [0.8, -0.8, 0], -0.5, 1)
  const lightOf = (p: { n: number[]; light: number }) => clayShade(p.n as [number, number, number], 0).shade * p.light
  assert.ok(lightOf(near) < lightOf(far) - 0.25, `the near wall is in shade (${lightOf(near).toFixed(2)} against ${lightOf(far).toFixed(2)})`)
  assert.ok(pressed(face, [0, 0, 0], -1, 1).light < 1, 'the bottom is shut in')
  const none = pressed(face, [0.8, -0.8, 0], -0.5, 0)
  assert.deepEqual([none.n, none.light], [[0, 0, 1], 1], 'no prints, no change')
  let dents = 0
  for (let i = 0; i < 400; i++) { const p = printAt([(i % 20) * 0.2, Math.floor(i / 20) * 0.2, 0.3], 0, 0.4); if (p.h < -0.3) dents++; if (!(Number.isFinite(p.g[0]) && p.h <= PRINT_LIP)) assert.fail(`print at ${i}`) }
  assert.ok(dents > 10, `prints are pressed in (${dents})`)
})

test('a blueprint in a palette takes its darkest color as the paper and its lightest as the ink', () => {
  const c = blueprintColors({ ...BLUEPRINT_START, palette: 'x' }, [[200, 220, 255], [10, 20, 60], [100, 100, 100]])
  assert.ok(c.paper[2] < 0.3 && c.ink[2] > 0.9)
})
