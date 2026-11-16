import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BURST, DOORS, Game, HALF, KINDS, MAX_HP, PILLARS, RULES, SPELL_COST, SWING, hopShape, keepIn, slimeR } from './game.ts'

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
