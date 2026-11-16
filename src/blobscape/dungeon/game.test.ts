import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BURST, DOORS, Game, HALF, KINDS, MAX_HP, PILLARS, PROPS, RULES, SPELL_COST, SWING, hopShape, keepIn, slimeR, PROP_RULES, HERO_R, CRATE_HEAL, URN_MAGIC, BARREL_HARM } from './game.ts'

const idle = { forward: 0, turn: 0 }
const run = (g: Game, seconds: number, input = idle) => { for (let t = 0; t < seconds; t += 1 / 30) g.step(1 / 30, input) }

test('the hero runs forward, turns, and stays inside the walls and out of the pillars', () => {
  const g = new Game()
  g.hold()
  g.hero.z = -4.5
  run(g, 1, { forward: 1, turn: 0 })
  assert.ok(g.hero.z > -4.5 + 1.5, `ran ${g.hero.z}`)
  run(g, 20, { forward: 1, turn: 0.3 })
  const h = g.hero
  assert.ok(Math.abs(h.x) < HALF && Math.abs(h.z) < HALF)
  for (const p of PILLARS) assert.ok(Math.hypot(h.x - p.x, h.z - p.z) >= p.r + 0.29)
  for (const d of DOORS) assert.ok(Math.abs(d.x) < HALF && Math.abs(d.z) < HALF)
})

test('a sword swing hits a slime in front, once per swing, and not one behind', () => {
  const g = new Game()
  g.hold()
  g.hero.z = -4.5
  const front = g.place('blue', 0, -3.6)
  const back = g.place('green', 0, -5.6)
  g.step(1 / 30, { ...idle, swing: true })
  run(g, SWING + 0.05)
  assert.equal(front.hp, RULES.blue.hp - 1)
  assert.equal(back.hp, RULES.green.hp)
  // a second swing hits again
  g.step(1 / 30, { ...idle, swing: true })
  run(g, SWING + 0.05)
  assert.ok(front.hp <= RULES.blue.hp - 2)
})

test('slimes burst when their health runs out, and are gone once the splats fade', () => {
  const g = new Game()
  g.hold()
  g.hero.z = -4.5
  const s = g.place('green', 0, -3.6)
  let bursts = 0
  for (let k = 0; k < 4 && s.phase !== 'burst'; k++) {
    g.step(1 / 30, { ...idle, swing: true })
    bursts += g.events.filter((e) => e.type === 'burst').length
    for (let t = 0; t < SWING + 0.1; t += 1 / 30) { g.step(1 / 30, idle); bursts += g.events.filter((e) => e.type === 'burst').length }
  }
  assert.equal(s.phase, 'burst')
  assert.equal(bursts, 1)
  assert.equal(g.score, 1)
  run(g, BURST + 0.1)
  assert.equal(g.slimes.length, 0)
})

test('magic costs mana, flies to a slime and does two damage; without mana it fizzles', () => {
  const g = new Game()
  g.hold()
  g.hero.z = -4.5
  const s = g.place('purple', 0.5, 1)
  g.step(1 / 30, { ...idle, cast: true })
  assert.equal(Math.round(g.hero.mp), 100 - SPELL_COST)
  // the bolt itself does two; the fire it leaves on the floor is checked in ground.test.ts
  let landed = false
  for (let t = 0; t < 1.2 && !landed; t += 1 / 30) { g.step(1 / 30, idle); landed = g.events.some((e) => e.type === 'hit' && e.by === 'magic') }
  assert.ok(landed)
  assert.equal(s.hp, RULES.purple.hp - 2)
  g.hero.mp = 5
  g.step(1 / 30, { ...idle, cast: true })
  assert.ok(g.events.some((e) => e.type === 'fizzle'))
  assert.equal(g.hero.castT, -1)
})

test('a slime hops to the hero, hurts on touch with a grace time after, and the hero can go down', () => {
  const g = new Game('normal')
  g.hold()
  g.hero.z = -4.5
  g.place('red', 0, -1)
  let hurts = 0
  for (let t = 0; t < 6 && g.state === 'playing'; t += 1 / 30) { g.step(1 / 30, idle); hurts += g.events.filter((e) => e.type === 'hurt').length }
  assert.ok(hurts >= 1)
  assert.ok(g.hero.hp < MAX_HP)
  // never two hurts closer than the grace time: at most one per 0.9 s
  assert.ok(hurts <= Math.ceil(6 / 0.9))
  g.hero.hp = 1
  g.hero.hurt = 0
  run(g, 4)
  assert.equal(g.state, 'down')
  g.restart()
  assert.equal(g.state, 'playing')
  assert.equal(g.hero.hp, MAX_HP)
  assert.equal(g.wave, 1)
})

test('waves come through the doors, never more of a color than its pool, and the next wave follows a cleared one', () => {
  const g = new Game('normal', 3)
  const seen = new Set<string>()
  for (let t = 0; t < 400 && g.wave < 5; t += 1 / 30) {
    // a hero who can't be hurt and bursts anything that comes near
    g.hero.hp = MAX_HP
    g.step(1 / 30, { forward: 0, turn: 0.5, swing: true, cast: true })
    for (const k of KINDS) assert.ok(g.slimes.filter((s) => s.kind === k).length <= RULES[k].pool)
    for (const s of g.slimes) {
      seen.add(s.kind)
      if (s.phase === 'live' && s.t > 3) { s.hp = 0.5; s.hitBy = -1 }
      assert.ok(Math.abs(s.x) < HALF && Math.abs(s.z) < HALF)
    }
    // a slime left hopping somewhere out of reach would stall the wave: burst it from here
    for (const s of g.slimes) if (s.phase === 'live' && s.t > 4) { s.phase = 'burst'; s.t = 0 }
  }
  assert.ok(g.wave >= 4, `got to wave ${g.wave}`)
  assert.ok(seen.has('green') && seen.has('blue') && seen.has('red'))
})

test('the hop squashes on landing, stretches in the air and is on the floor otherwise', () => {
  const land = hopShape(0.04, 1)
  assert.ok(land.squash > 0.15 && land.y === 0 && !land.air)
  const mid = hopShape(0.55 + 0.45 / 2, 1)
  assert.ok(mid.air && mid.y > 0.3 && mid.squash < 0)
  for (let t = 0; t < 1; t += 0.01) assert.ok(hopShape(t, 1).y >= 0)
})

test('keepIn pushes out of pillars and walls', () => {
  const [x, z] = keepIn(PILLARS[0].x, PILLARS[0].z + 0.1, 0.3)
  assert.ok(Math.hypot(x - PILLARS[0].x, z - PILLARS[0].z) >= PILLARS[0].r + 0.3 - 1e-9)
  const [x2] = keepIn(HALF + 3, 0, slimeR({ kind: 'purple' }))
  assert.ok(x2 < HALF - slimeR({ kind: 'purple' }))
})

test('once the hero is down, a bolt still in flight bursts nothing and gives nothing back', () => {
  const g = new Game()
  g.hold()
  const s = g.place('gold', 0, 2)
  g.step(1 / 30, { ...idle, cast: true })
  run(g, 0.25)
  g.state = 'down'
  g.hero.hp = 0
  run(g, 1)
  assert.equal(g.score, 0)
  assert.equal(g.hero.hp, 0)
  assert.equal(s.hp, RULES.gold.hp)
})

test('props: a crate takes two swings and gives health, an urn one and gives magic, and whole ones are in the way', () => {
  const g = new Game()
  g.hold()
  const crate = g.props.find((p) => p.kind === 'crate')!, urn = g.props.find((p) => p.kind === 'urn')!
  // walking at a crate stops at its edge
  g.hero.x = crate.x
  g.hero.z = crate.z - 1.5
  g.hero.heading = 0
  run(g, 1.5, { ...idle, forward: 1 })
  assert.ok(Math.abs(Math.hypot(g.hero.x - crate.x, g.hero.z - crate.z) - (PROP_RULES.crate.r + HERO_R)) < 0.05, 'stopped at the crate')
  g.hero.hp = 50
  const swing = () => { let seen: string[] = []; g.step(1 / 30, { ...idle, swing: true }); for (let t = 0; t < 0.6; t += 1 / 30) { seen = seen.concat(g.events.map((e) => e.type)); g.step(1 / 30, idle) } return seen }
  assert.ok(swing().includes('knock'))
  assert.equal(crate.phase, 'whole')
  assert.equal(crate.hp, 1)
  assert.ok(swing().includes('break'))
  assert.equal(crate.phase, 'broken')
  assert.equal(g.hero.hp, 50 + CRATE_HEAL)
  // broken, it is no longer in the way
  run(g, 1, { ...idle, forward: 1 })
  assert.ok(g.hero.z > crate.z)
  g.hero.x = urn.x
  g.hero.z = urn.z - 0.8
  g.hero.heading = 0
  g.hero.mp = 20
  swing()
  assert.equal(urn.phase, 'broken')
  assert.ok(g.hero.mp >= 20 + URN_MAGIC && g.hero.mp < 20 + URN_MAGIC + 5)
})

test('props: a barrel breaks into fire and throws back the slimes beside it; fire on the floor burns a crate but not an urn', () => {
  const g = new Game()
  g.hold()
  const barrel = g.props.find((p) => p.kind === 'barrel')!
  const near = g.place('purple', barrel.x + 0.9, barrel.z), far = g.place('green', barrel.x + 4, barrel.z + 2)
  g.hero.x = barrel.x
  g.hero.z = barrel.z - 4
  g.hero.heading = 0
  // two frost bolts would take two; one fire bolt is enough
  g.step(1 / 30, { ...idle, cast: true })
  let blast = false
  for (let t = 0; t < 1.5; t += 1 / 30) { g.step(1 / 30, idle); if (g.events.some((e) => e.type === 'hit' && e.by === 'blast')) blast = true }
  assert.equal(barrel.phase, 'broken')
  assert.ok(blast)
  assert.ok(near.hp <= RULES.purple.hp - BARREL_HARM)
  assert.equal(far.hp, RULES.green.hp)
  assert.ok(g.ground.at(barrel.x, barrel.z).fire > 0 || g.ground.at(barrel.x, barrel.z).char > 0)
  // fire lit under a crate and an urn
  const h = new Game()
  h.hold()
  const crate = h.props.find((p) => p.kind === 'crate')!, urn = h.props.find((p) => p.kind === 'urn')!
  h.hero.x = 0
  h.hero.z = -5
  for (let k = 0; k < 3; k++) { h.ground.light(crate.x, crate.z, 'fire'); h.ground.light(urn.x, urn.z, 'fire'); run(h, 2.5) }
  assert.equal(crate.phase, 'broken')
  assert.equal(urn.phase, 'whole')
})

test('props: the next wave finds them back, except where someone stands, and starting again resets them', () => {
  const g = new Game()
  for (const p of g.props) { p.phase = 'broken'; p.hp = 0; p.t = 5 }
  g.hero.x = g.props[0].x
  g.hero.z = g.props[0].z
  // clear wave 1 by hand: nothing left to come, nothing alive
  g.hold()
  g.slimes = []
  ;(g as unknown as { nextWaveAt: number }).nextWaveAt = 0
  run(g, 4)
  assert.equal(g.wave, 2)
  assert.equal(g.props[0].phase, 'broken')
  for (const p of g.props.slice(1)) { assert.equal(p.phase, 'whole'); assert.equal(p.hp, PROP_RULES[p.kind].hp) }
  g.restart()
  assert.ok(g.props.every((p) => p.phase === 'whole'))
})

test('props: none stands in a pillar, a door or another prop, and a swing at a crate or an urn never reaches a barrel', () => {
  for (const [i, p] of PROPS.entries()) {
    const r = PROP_RULES[p.kind].r
    assert.deepEqual(keepIn(p.x, p.z, r), [p.x, p.z], `${p.kind} ${i} is inside the walls and clear of the pillars`)
    for (const d of DOORS) assert.ok(Math.hypot(d.x - p.x, d.z - p.z) > 1.5, `${p.kind} ${i} is clear of a door`)
    assert.ok(Math.hypot(p.x, p.z + 2.5) > 2, 'clear of where the hero starts')
    for (const [j, q] of PROPS.entries()) {
      if (j <= i) continue
      const d = Math.hypot(p.x - q.x, p.z - q.z)
      assert.ok(d > r + PROP_RULES[q.kind].r + 0.1, `${i} and ${j} overlap`)
      if ((p.kind === 'barrel') !== (q.kind === 'barrel')) assert.ok(d > 2, `barrel beside ${p.kind === 'barrel' ? q.kind : p.kind} (${i}, ${j})`)
    }
  }
})
