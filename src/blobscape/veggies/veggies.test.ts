import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GAP_FIRST, GAP_LEAST, GRAVITY, HEARTS, KINDS, TREATS_FROM, Game, comboBonus, gapAt, kindOf, segmentDistance, volleyAt, type GameEvent } from './game.ts'
import { DEBRIS_EACH, WORDS, buildDebris, buildVeggies, buildWords, debrisColors, modelOf, reachOf } from './models.ts'
import { DEBRIS_LIFE, Show, wordSize, WORD_LIFE } from './view.ts'

// built once for the file: the models are the heaviest thing here
const veggies = buildVeggies(), debris = buildDebris(), words = buildWords()

/** Runs a game untouched for `seconds`, in steps of a sixtieth. */
function run(g: Game, seconds: number) {
  const out: GameEvent[] = []
  for (let i = 0; i < seconds * 60 && g.state === 'playing'; i++) out.push(...g.step(1 / 60))
  return out
}

test('throws come faster over time, and in bigger volleys', () => {
  assert.equal(gapAt(0), GAP_FIRST)
  assert.ok(gapAt(60) < gapAt(30) && gapAt(30) < gapAt(0))
  assert.ok(gapAt(1000) >= GAP_LEAST && gapAt(1000) < GAP_LEAST + 0.01)
  assert.ok(volleyAt(0) === 1 && volleyAt(200) > volleyAt(40))
  assert.deepEqual([comboBonus(1), comboBonus(2), comboBonus(3)], [0, 2, 6])
  assert.ok(Math.abs(segmentDistance(0, 0, 2, 0, 1, 1) - 1) < 1e-9 && Math.abs(segmentDistance(0, 0, 0, 0, 3, 4) - 5) < 1e-9)
})

test('a seed plays the same game, and one left alone loses a heart for each veggie that falls back', () => {
  const a = new Game(4), b = new Game(4)
  const ea = run(a, 120), eb = run(b, 120)
  assert.deepEqual(ea.map((e) => e.type), eb.map((e) => e.type))
  assert.equal(a.state, 'over')
  assert.equal(a.hearts, 0)
  const misses = ea.filter((e) => e.type === 'miss')
  assert.equal(misses.length, HEARTS)
  for (const m of misses) if (m.type === 'miss') assert.equal(kindOf(m.flyer.kind).group, 'veggie')
  // nothing sweet before the treats start
  for (const e of ea) if (e.type === 'throw' && e.flyer.id > 0 && kindOf(e.flyer.kind).group === 'treat') assert.ok(a.t >= TREATS_FROM)
})

test('every throw comes up from below, rises between half and nine tenths of the view, stays across it and falls back', () => {
  const g = new Game(9)
  g.setView(4, 3)
  const H = 6, grav = GRAVITY * H
  for (let i = 0; i < 400; i++) {
    const f = g.throwOne()
    if (!f) { g.flying.length = 0; continue }
    const k = kindOf(f.kind), apex = f.y + (f.vy * f.vy) / (2 * grav), flight = (2 * f.vy) / grav
    if (!(f.y < -3 && apex >= -3 + H * 0.5 - 1e-9 && apex <= -3 + H * 0.9 + 1e-9)) assert.fail(`apex ${apex} from ${f.y} for ${k.id}`)
    const land = f.x + f.vx * flight
    if (!(Math.abs(f.x) <= 4 && Math.abs(land) <= 4)) assert.fail(`from ${f.x} to ${land}`)
    g.flying.length = 0
  }
})

test('no more of a kind fly at once than it has models for', () => {
  const g = new Game(2)
  for (let i = 0; i < 50; i++) g.throwOne({ kind: 'pumpkin', variant: 0 })
  assert.equal(g.flying.length, kindOf('pumpkin').copies)
  assert.deepEqual(g.flying.map((f) => f.copy).sort(), [0, 1])
})

test('a tap bursts a veggie, a swipe through two is a combo, a pumpkin takes three hits and a treat costs a heart', () => {
  const g = new Game(3)
  g.setView(4, 3)
  const carrot = g.throwOne({ kind: 'carrot', variant: 0 })!
  carrot.x = -2; carrot.y = 0
  let e = g.slash(1, -2, 0, -2, 0, 0.1)
  assert.equal(e[0].type, 'burst')
  assert.equal(g.score, 1)
  assert.equal(g.tally.carrot, 1)
  assert.deepEqual(g.endStroke(1), [])
  const a = g.throwOne({ kind: 'tomato', variant: 0 })!, b = g.throwOne({ kind: 'broccoli', variant: 0 })!
  a.x = -1; a.y = 1; b.x = 1; b.y = 1
  e = g.slash(2, -3, 1, 0, 1, 0.1)
  e.push(...g.slash(2, 0, 1, 3, 1, 0.1))
  e.push(...g.endStroke(2))
  assert.deepEqual(e.map((x) => x.type), ['burst', 'burst', 'combo'])
  assert.equal(g.score, 1 + 1 + 3 + comboBonus(2))
  const p = g.throwOne({ kind: 'pumpkin', variant: 0 })!
  p.x = 0; p.y = 0
  const hits = [3, 4, 5].map((s) => g.slash(s, 0, 0, 0, 0, 0.1)[0])
  assert.deepEqual(hits.map((h) => h.type), ['chip', 'chip', 'burst'])
  assert.deepEqual(hits.slice(0, 2).map((h) => h.type === 'chip' && h.piece), [0, 1])
  // one stroke hits a thing once, however long it lingers on it
  const q = g.throwOne({ kind: 'pumpkin', variant: 0 })!
  q.x = 0; q.y = 0
  assert.equal(g.slash(9, 0, 0, 0, 0, 0.1).length + g.slash(9, 0, 0, 0.1, 0, 0.1).length, 1)
  const cookie = g.throwOne({ kind: 'cookie', variant: 0 })!
  cookie.x = 2; cookie.y = -1
  const before = g.score
  e = g.slash(10, 2, -1, 2, -1, 0.1)
  assert.equal(e[0].type, 'treat')
  assert.equal(g.hearts, HEARTS - 1)
  assert.equal(g.score, before)
})

test('with treats off, none is thrown', () => {
  const g = new Game(5)
  g.treats = false
  g.t = TREATS_FROM + 100
  for (let i = 0; i < 500; i++) assert.notEqual(kindOf(g.pick().kind).group, 'treat')
})

test('Space aims at the veggie that falls out soonest, never a treat', () => {
  const g = new Game(6)
  g.setView(4, 3)
  const high = g.throwOne({ kind: 'onion', variant: 0 })!, low = g.throwOne({ kind: 'tomato', variant: 0 })!, sweet = g.throwOne({ kind: 'donut', variant: 0 })!
  high.y = 2; high.vy = 0; low.y = -1; low.vy = -2; sweet.y = -2.5; sweet.vy = -5
  assert.equal(g.nearestToFalling(), low)
})

test('every model fits its kind and the veggies have grumpy faces; every actor stays within a byte of bones', () => {
  for (const k of KINDS) for (let v = 0; v < k.variants; v++) {
    const m = modelOf(k.id, v), reach = reachOf(k.id, v)
    assert.ok(m.cells.length > 100, `${k.id} has ${m.cells.length} cells`)
    if (!(reach > k.radius * 0.7 && reach < k.radius * 1.35)) assert.fail(`${k.id} reaches ${reach.toFixed(2)} for a radius of ${k.radius}`)
    const pupils = m.cells.filter((c) => c.c === '#1b1420').length
    if (k.group === 'treat' && k.id !== 'donut') assert.ok(pupils >= 2, `${k.id} has a face`)
    if (k.group !== 'treat') assert.ok(pupils >= 2 && m.cells.some((c) => c.c === '#5a1622'), `${k.id} has a frown`)
    // no two cells in one place
    assert.equal(new Set(m.cells.map((c) => `${c.x},${c.y},${c.z}`)).size, m.cells.length)
  }
  assert.equal(modelOf('pumpkin').pieces, 3)
  for (const a of [veggies, debris, words]) assert.ok(a.skeleton.count <= 256 && a.skin.joints.every((j) => j < a.skeleton.count))
  assert.equal(veggies.slots.size, KINDS.reduce((s, k) => s + k.variants * k.copies, 0))
  assert.equal(debris.pools.size, debrisColors().length)
  for (const w of Object.values(WORDS).flat()) assert.ok(words.pools.get(w)?.width, w)
})

test('a flurry of bursts never takes more cubes than the pools hold, and they are gone after their time', () => {
  const show = new Show(veggies, debris, words, 1)
  const g = new Game(1)
  g.setView(4, 3)
  const f = g.throwOne({ kind: 'carrot', variant: 0 })!
  const events: GameEvent[] = Array.from({ length: 30 }, (_, i) => ({ type: 'burst', flyer: f, points: 1, at: 0, stroke: i }))
  show.hear(events, 1, g)
  assert.ok(show.busy.cubes <= DEBRIS_EACH * 2, `${show.busy.cubes} cubes`)
  show.poseBursts(debris.skeleton, words.skeleton, 1.2, 3)
  const shown = [...debris.skeleton.size].slice(1).filter((s) => s > 0).length
  assert.ok(shown > 0 && shown <= DEBRIS_EACH * 2)
  show.poseBursts(debris.skeleton, words.skeleton, 1 + DEBRIS_LIFE + 0.01, 3)
  assert.equal(show.busy.cubes, 0)
  assert.equal([...debris.skeleton.size].slice(1).filter((s) => s > 0).length, 0)
  assert.ok(wordSize(0.3) === 1 && wordSize(WORD_LIFE) === 0 && wordSize(0.01) < 1)
})

test('only what flies is shown, where the game has it', () => {
  const show = new Show(veggies, debris, words, 1)
  const g = new Game(1)
  const f = g.throwOne({ kind: 'lettuce', variant: 0 })!
  f.x = 1.5; f.y = 0.5
  const sk = veggies.skeleton
  show.poseVeggies(sk, g)
  const slot = veggies.slots.get('lettuce/0/0')!
  assert.equal(sk.size[slot.bone], 1)
  assert.ok(Math.abs(sk.posedHead[slot.bone * 3] - 1.5) < 1e-6 && Math.abs(sk.posedHead[slot.bone * 3 + 1] - 0.5) < 1e-6)
  let shown = 0
  for (const s of veggies.slots.values()) if (sk.size[s.bone] > 0) shown++
  assert.equal(shown, 1)
})
