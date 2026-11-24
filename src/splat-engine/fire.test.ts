import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIRE_CELLS, FIRE_TICK, FIRE_FLAMES, Fire, fireColor, powerAt, runFire, type FireColors, type FireShape } from './fire.ts'
import { CATCH, DIE, FUEL_EMBERS, FUEL_LOW, SceneFire, burningAt, fireShape, fuelUnder, shapeUnder, smokeAt } from './sceneFire.ts'
import { skyState } from './skyRecipes.ts'
import { checkScene, compileScene, litFor, type SceneDoc } from './sceneDoc.ts'

// one short loop of a campfire serves every test here: playing it is the heavy part
const SHAPE: FireShape = { tall: 3.6, quick: 1, sparks: 2, seed: 1 }
const LOOP = 4
const kept = runFire(SHAPE, LOOP)
const lit = (f: number) => { const out: number[] = []; for (let i = 0; i < FIRE_FLAMES; i++) if (kept.size[f * kept.count + i] > 0.05) out.push(f * kept.count + i); return out }

test('hot gas rises off the bed, draws air in at its foot and cools on the way up', () => {
  const fire = new Fire(SHAPE, LOOP)
  for (let k = 0; k < 60; k++) fire.tick(k * FIRE_TICK)
  const mid = (fire.nx - 1) / 2, flow = [0, 0, 0]
  // over the bed the gas goes up, and quicker a little way up than at the bed, where it starts from rest
  fire.flowAt(mid, 1, mid, flow)
  const low = flow[1]
  fire.flowAt(mid, FIRE_CELLS * 1.5, mid, flow)
  assert.ok(low > 0 && flow[1] > low, `rises ${low.toFixed(1)} at the bed and ${flow[1].toFixed(1)} above it`)
  // beside the bed, low down, air comes in toward the middle from both sides to take its place
  fire.flowAt(mid + FIRE_CELLS * 1.6, 1.5, mid, flow)
  const right = flow[0]
  fire.flowAt(mid - FIRE_CELLS * 1.6, 1.5, mid, flow)
  assert.ok(right < 0 && flow[0] > 0, `air comes in at ${right.toFixed(2)} from the right and ${flow[0].toFixed(2)} from the left`)
  // the bed is hottest, the gas cooler the higher it has got, and there is none well off to the side
  const at = (y: number) => fire.heatAt(mid, y, mid)
  assert.ok(at(0.5) > at(FIRE_CELLS * 2) && at(FIRE_CELLS * 2) > at(fire.ny - 2))
  assert.ok(fire.heatAt(1, FIRE_CELLS, 1) < 0.02)
  for (const f of [fire.u, fire.v, fire.w, fire.heat]) for (const x of f) if (!Number.isFinite(x)) assert.fail('the fire blew up')
})

test('the flames stand about as tall as asked and stay over the bed', () => {
  const tops: number[] = []
  for (let f = 0; f < kept.frames; f += 3) {
    const ys = lit(f).map((o) => kept.place[o * 3 + 1]).sort((a, b) => a - b)
    assert.ok(ys.length > FIRE_FLAMES / 4, `only ${ys.length} tracers alight at moment ${f}`)
    tops.push(ys[Math.floor(ys.length * 0.97)])
    for (const o of lit(f)) if (Math.hypot(kept.place[o * 3], kept.place[o * 3 + 2]) > 2.2) assert.fail('a flame tracer is far off to the side')
  }
  const mean = tops.reduce((a, b) => a + b, 0) / tops.length
  assert.ok(mean > SHAPE.tall * 0.6 && mean < SHAPE.tall * 1.4, `flames stand ${mean.toFixed(2)} bed radii tall, asked ${SHAPE.tall}`)
  // and it flickers: its top is not at one height all the time
  assert.ok(Math.max(...tops) - Math.min(...tops) > 0.3)
})

test('the loop joins: its last moment is followed by its first as closely as any moment by the next', () => {
  const step = (a: number, b: number) => {
    let sum = 0, n = 0
    for (let i = 0; i < FIRE_FLAMES; i++) {
      const p = a * kept.count + i, q = b * kept.count + i
      if (kept.size[p] <= 0.05 || kept.size[q] <= 0.05) continue
      sum += Math.hypot(kept.place[p * 3] - kept.place[q * 3], kept.place[p * 3 + 1] - kept.place[q * 3 + 1], kept.place[p * 3 + 2] - kept.place[q * 3 + 2]); n++
    }
    return sum / n
  }
  const steps = Array.from({ length: kept.frames - 1 }, (_, f) => step(f, f + 1)).sort((a, b) => a - b)
  assert.ok(step(kept.frames - 1, 0) <= steps[steps.length - 1] * 1.15, 'the seam jumps further than any step within the loop')
})

test('the same shape burns the same way, and another seed differently', () => {
  const again = runFire(SHAPE, LOOP), other = runFire({ ...SHAPE, seed: 2 }, LOOP)
  assert.deepEqual(again.place.subarray(0, 600), kept.place.subarray(0, 600))
  assert.notDeepEqual(other.place.subarray(0, 600), kept.place.subarray(0, 600))
})

test('a wind leans the flames downwind', () => {
  const blown = runFire({ ...SHAPE, wind: [1.5, 0] }, LOOP)
  const lean = (k: typeof kept) => { let x = 0, n = 0; for (let f = 0; f < k.frames; f += 4) for (let i = 0; i < FIRE_FLAMES; i++) { const o = f * k.count + i; if (k.size[o] > 0.05 && k.place[o * 3 + 1] > 1.5) { x += k.place[o * 3]; n++ } } return x / n }
  assert.ok(lean(blown) > lean(kept) + 0.25, `leans ${lean(blown).toFixed(2)} in a wind, ${lean(kept).toFixed(2)} in still air`)
})

test('the fire\'s power wavers about its mean, and its colors run from its coolest to its hottest', () => {
  let sum = 0, least = 9, most = 0
  for (let k = 0; k < 96; k++) { const p = powerAt(kept, (k / 96) * LOOP); sum += p; least = Math.min(least, p); most = Math.max(most, p) }
  assert.ok(Math.abs(sum / 96 - 1) < 0.05 && least > 0.4 && most < 1.9 && most - least > 0.15)
  assert.ok(Math.abs(powerAt(kept, 0) - powerAt(kept, LOOP)) < 1e-6)
  const colors: FireColors = [[0.8, 0.3, 0.1], [0.95, 0.6, 0.15], [1, 0.8, 0.4], [1, 0.95, 0.7]]
  const c = (h: number) => { const out = [0, 0, 0]; fireColor(h, colors, out); return out }
  assert.deepEqual(c(0), colors[0]); assert.deepEqual(c(1), colors[3])
  assert.ok(c(0.45)[1] > c(0.2)[1] && c(0.8)[2] > c(0.45)[2])
})

const DOC: SceneDoc = {
  name: 'Hearth', loop: LOOP, palette: ['#101010', '#6e4a2e', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0'],
  camera: { target: [0, 0.3, 0], distance: 3, azimuth: 0, elevation: 10 },
  parts: [{ shape: { kind: 'box', at: [0, -0.05, 0], half: [0.5, 0.05, 0.5] }, paint: '#6e4a2e' }],
  fires: [{ at: [0, 0.02, 0], r: 0.11, lit: 'dark' }, { at: [0.6, 0.02, 0], r: 0.11, height: 0.4, sparks: 2, seed: 1, lit: 'always' }],
  lights: [{ at: [0, 0.2, 0], color: '#f59a2a', strength: 2, range: 1, lit: 'dark', flicker: { by: 0.25, times: 3 }, fire: 0 }, { at: [0.6, 0.2, 0], color: '#f59a2a', strength: 2, range: 1, lit: 'always', fire: 1 }],
}

test('a described fire is checked, compiled with its lights, and gone with its light when it is not lit', () => {
  assert.deepEqual(checkScene(DOC), [])
  assert.ok(checkScene({ ...DOC, fires: [{ at: [0, 0, 0], r: 9 }] }).some((e) => e.startsWith('fires[0].r')))
  assert.ok(checkScene({ ...DOC, lights: [{ ...DOC.lights![0], fire: 5 }] }).some((e) => e.startsWith('lights[0].fire')))
  const c = compileScene(DOC, { puffs: false })
  assert.equal(c.fires.length, 2)
  assert.ok(Math.abs(c.fires[0].height - 0.11 * 3.6) < 1e-9)
  assert.deepEqual(c.fires.map((f) => f.lights.map((l) => l.index)), [[0], [1]])
  // by day the first is out: it is not there, and the second's light still names it, at its new place
  const day = litFor(DOC, false)
  assert.equal(day.fires!.length, 1)
  assert.equal(day.lights![0].strength, 0); assert.equal(day.lights![0].fire, undefined)
  assert.equal(day.lights![1].fire, 0)
  assert.deepEqual(compileScene(day, { puffs: false }).fires[0].lights.map((l) => l.index), [1])
})

test('a scene\'s fire is blobs of its own that glow, and its light burns as it does', () => {
  const c = compileScene(litFor(DOC, false), { puffs: false })
  assert.deepEqual(fireShape(c.fires[0]), SHAPE)
  const fire = new SceneFire(c)
  // every tracer three times over (the ways of burning it changes between), then its embers; all glow but the smoke
  assert.ok(fire.actor.blobs.count > kept.count * 3)
  assert.ok(fire.actor.soft && fire.actor.glow!.subarray(0, FIRE_FLAMES).every((g) => g === 255) && fire.actor.glow!.some((g) => g === 0))
  fire.show(1.3, [0.6, 0.4, 3])
  const { center, opacity, color, scale } = fire.actor.blobs
  let shown = 0, bright = 0
  for (let i = 0; i < FIRE_FLAMES; i++) {
    if (!opacity[i]) continue
    shown++
    // over its own bed, in the scene's units, longer than wide, and no dimmer than its coolest color
    assert.ok(Math.hypot(center[i * 3] - 0.6, center[i * 3 + 2]) < 0.11 * 2.5 && center[i * 3 + 1] > 0.02)
    assert.ok(scale[i * 3 + 1] >= scale[i * 3])
    if (color[i * 3 + 2] > c.fires[0].colors[1][2] + 0.05) bright++
  }
  assert.ok(shown > FIRE_FLAMES / 4 && bright > 10 && bright < shown, `${shown} alight, ${bright} of them bright`)
  // the same moment again is the same picture, and the loop's end is its start
  const first = Float32Array.from(center.subarray(0, 300))
  fire.show(2.9); fire.show(1.3, [0.6, 0.4, 3])
  assert.deepEqual(Float32Array.from(center.subarray(0, 300)), first)
  // its light: the written strength times how hard it burns, whatever flicker it was written with
  const lights = c.lights(1.3), was = lights[1].color[0]
  const lit = fire.shine(lights, 1.3)
  assert.ok(Math.abs(lit[1].color[0] / was - powerAt(kept, 1.3)) < 1e-6)
  assert.equal(lit[0].color[0], 0)
})

test('weather takes a fire\'s fuel: light rain and snow leave it, rain and heavy snow halve it, heavy rain, a thunderstorm and a gale put it out', () => {
  const under = (weather: string, wind?: number) => fuelUnder({ ...skyState(weather as never), ...(wind === undefined ? {} : { wind }) })
  assert.equal(under(undefined as never), 1); assert.equal(under('light-rain'), 1); assert.equal(under('snow'), 1)
  assert.ok(Math.abs(under('rain') - FUEL_LOW) < 1e-9); assert.ok(Math.abs(under('heavy-snow') - FUEL_LOW) < 1e-9)
  assert.equal(under('heavy-rain'), 0); assert.equal(under('thunderstorm'), 0)
  assert.equal(under(undefined as never, 1), 1); assert.equal(under(undefined as never, 2), 1); assert.equal(under(undefined as never, 3), 0)
  // the ways of burning always add up to the whole fire, and a fire that is out is its embers
  for (const f of [1, 0.8, 0.5, 0.4, 0.36, 0.2, 0]) assert.ok(Math.abs(burningAt(f).reduce((n, b) => n + b.share, 0) - 1) < 1e-9, `at ${f}`)
  assert.deepEqual(burningAt(0), [{ fuel: FUEL_EMBERS, share: 1 }])
  assert.equal(shapeUnder(SHAPE, 3, FUEL_EMBERS).sparks, 0); assert.ok(shapeUnder(SHAPE, 2, 1).sparks > SHAPE.sparks)
  assert.equal(smokeAt(1), 0); assert.equal(smokeAt(FUEL_LOW), 1); assert.ok(smokeAt(0) > 0.2 && smokeAt(0) < 1)
})

test('a fire in heavy rain dies down to embers and smoke, its light with it, and catches again when it clears', () => {
  const c = compileScene(litFor(DOC, false), { puffs: false })
  const fire = new SceneFire(c), { opacity, center } = fire.actor.blobs
  const alight = () => { let n = 0; for (let i = 0; i < fire.actor.blobs.count; i++) if (opacity[i] && fire.actor.glow![i] && center[i * 3 + 1] > 0.02 + 0.11 * 0.5) n++; return n }
  const smoking = () => { let n = 0; for (let i = 0; i < fire.actor.blobs.count; i++) if (opacity[i] && !fire.actor.glow![i]) n++; return n }
  const light = () => fire.shine(c.lights(1.3), 1.3)[1].color[0]
  fire.under(skyState(), 0); fire.show(1.3)
  const full = alight(), bright = light()
  assert.ok(full > FIRE_FLAMES / 4 && smoking() === 0)
  // told of the storm, it is no different a moment later and well down half way through its dying
  const storm = skyState('thunderstorm')
  fire.under(storm, 0.01); fire.show(1.3)
  assert.ok(alight() > full * 0.8)
  // loops it has not played are played a little a call, and it burns as it did meanwhile: tell it until it has gone out
  let told = 0
  while (fire.fuel[0] > 0 && told++ < 20000) fire.under(storm, 0.05)
  assert.equal(fire.fuel[0], 0)
  assert.ok(told * 0.05 >= DIE * 0.99, 'it went out quicker than a fire dies')
  for (let k = 0; k < 40; k++) fire.under(storm, 0.05)
  fire.show(1.3)
  assert.ok(alight() < full * 0.05, `${alight()} still alight of ${full}`)
  assert.ok(smoking() > 5, 'no smoke off the embers')
  // and it throws no sparks: nothing that glows is in the air over it
  let sparks = 0
  for (const t of [0.4, 1.3, 2.2, 3.1]) { fire.show(t); for (let i = 0; i < fire.actor.blobs.count; i++) if (opacity[i] && fire.actor.glow![i] && center[i * 3 + 1] > 0.02 + 0.11 * 1.2) sparks++ }
  assert.equal(sparks, 0, 'a fire that is out still throws sparks')
  fire.show(1.3)
  assert.ok(light() < bright * 0.15 && light() > 0, `its light ${light().toFixed(3)} of ${bright.toFixed(3)}`)
  // the storm over, it catches again
  // (loops are played a few milliseconds a call, so on a slow machine it takes more calls: tell it until it has caught)
  let clear = 0
  while (fire.fuel[0] < 1 && clear++ < 20000) fire.under(skyState(), 0.05)
  assert.equal(fire.fuel[0], 1)
  assert.ok(clear * 0.05 >= CATCH * 0.99, 'it caught quicker than a fire catches')
  for (let k = 0; k < 40; k++) fire.under(skyState(), 0.05)
  fire.show(1.3)
  assert.ok(alight() > full * 0.9 && smoking() === 0)
  // off screen it is there at once
  fire.under(storm, Infinity)
  assert.equal(fire.fuel[0], 0)
})
