import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BURN, FROST_LIFE, Ground, LAYERS, Patches, SPLASH, STEAM_LIFE, STEAM_MAX } from './ground.ts'
import { BURN_EVERY, CHILL_SPEED, Game, HALF, HERO_BURN, MAX_HP, PILLARS, RULES, SPELL_COST } from './game.ts'

const run = (g: Ground, seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += 0.05) g.step(0.05) }
const reach = (g: Ground, field: Float32Array, x: number, z: number) => { let m = 0; for (let i = 0; i < field.length; i++) if (field[i] > 0) { const [cx, cz] = g.center(i); m = Math.max(m, Math.hypot(cx - x, cz - z)) } return m }

test('fire catches where a bolt lands, spreads a few cells, burns out and leaves the stone scorched', () => {
  const g = new Ground(HALF, PILLARS)
  assert.equal(g.n, 28)
  g.light(0.2, -1.1, 'fire')
  const lit = g.count('fire')
  assert.ok(lit >= 4 && lit <= 12, `${lit} cells lit`)
  assert.ok(reach(g, g.fire, 0.2, -1.1) <= SPLASH + 1e-9)
  assert.ok(g.at(0.2, -1.1).fire > 0)
  const v = g.version
  run(g, 1.6)
  assert.ok(g.version > v)
  const spread = g.count('fire'), far = reach(g, g.fire, 0.2, -1.1)
  assert.ok(spread > lit * 2, `${spread} cells after spreading`)
  assert.ok(far > 1.2 && far < 3.6, `reached ${far} m`)
  assert.ok(g.at(0.2, -1.1).fire === 1)
  run(g, BURN + 6)
  assert.equal(g.count('fire'), 0)
  assert.ok(g.at(0.2, -1.1).char > 0.5, 'scorched')
  // scorched stone doesn't catch from a neighbor, and cools in time
  let most = 0
  for (const c of g.char) most = Math.max(most, c)
  assert.ok(most <= 1)
  run(g, 30)
  assert.equal(g.at(0.2, -1.1).char, 0)
  // the whole hall never burns from one bolt
  assert.ok(spread < g.n * g.n * 0.15)
})

test('frost lies longer than fire burns, then melts, and never forms inside a pillar', () => {
  const g = new Ground(HALF, PILLARS)
  const p = PILLARS[0]
  g.light(p.x, p.z + 0.3, 'frost')
  run(g, 3)
  assert.ok(g.count('frost') > 15)
  assert.equal(g.at(p.x, p.z).frost, 0)
  assert.ok(g.at(p.x, p.z + 0.9).frost > 0.9)
  run(g, FROST_LIFE - 4)
  assert.ok(g.count('frost') > 15, 'still frozen when a fire would be long out')
  run(g, 12)
  assert.equal(g.count('frost'), 0)
})

test('fire and frost cancel where they meet', () => {
  const g = new Ground(HALF, [])
  g.light(-1, 0, 'frost')
  run(g, 3)
  const frozen = g.count('frost')
  assert.ok(g.at(-1, 0).frost > 0.9)
  // a fire bolt on frozen floor melts its splash and lights nothing there
  g.light(-1, 0, 'fire')
  assert.equal(g.at(-1, 0).frost, 0)
  assert.equal(g.at(-1, 0).fire, 0)
  assert.ok(g.count('frost') < frozen)
  // a frost bolt on burning floor puts it out
  const h = new Ground(HALF, [])
  h.light(2, 2, 'fire')
  run(h, 0.5)
  assert.ok(h.at(2, 2).fire > 0.9)
  h.light(2, 2, 'frost')
  assert.equal(h.at(2, 2).fire, 0)
  assert.equal(h.at(2, 2).frost, 0)
  // fire spreading toward frost melts it and stops there: no cell is ever both
  const k = new Ground(HALF, [])
  k.light(-1.2, 0, 'frost')
  run(k, 2)
  k.light(1.2, 0, 'fire')
  for (let t = 0; t < 6; t += 0.05) {
    k.step(0.05)
    for (let i = 0; i < k.fire.length; i++) assert.ok(!(k.fire[i] > 0.05 && k.frost[i] > 0.05), `cell ${i} burns and is frozen`)
  }
})

test('the same bolts give the same floor, clear puts it back, and sampling is smooth', () => {
  const make = () => { const g = new Ground(HALF, PILLARS); g.light(1, 1, 'fire'); g.light(-3, 2, 'frost'); run(g, 2.5); return g }
  const a = make(), b = make()
  assert.deepEqual([...a.fire], [...b.fire])
  assert.deepEqual([...a.frost], [...b.frost])
  // between two cell middles the sample lies between the two cells
  const i = a.index(1, 1), [x, z] = a.center(i)
  assert.ok(Math.abs(a.sample(a.fire, x, z) - a.fire[i]) < 1e-6)
  const mid = a.sample(a.fire, x + a.cell / 2, z), lo = Math.min(a.fire[i], a.fire[i + 1]), hi = Math.max(a.fire[i], a.fire[i + 1])
  assert.ok(mid >= lo - 1e-6 && mid <= hi + 1e-6)
  assert.equal(a.sample(a.fire, 99, 99), a.fire[a.n * a.n - 1])
  a.clear()
  assert.equal(a.count('fire') + a.count('frost'), 0)
  a.light(1, 1, 'fire'); a.light(-3, 2, 'frost'); run(a, 2.5)
  assert.deepEqual([...a.fire], [...b.fire])
})

test('patches stand on the strongest cells, apart, and stay put while their cell lasts', () => {
  const g = new Ground(HALF, [])
  g.light(0, 0, 'fire')
  run(g, 1.5)
  const p = new Patches(4, 0.9)
  p.update(g, g.fire)
  const on = [...p.cells].filter((c) => c >= 0)
  assert.ok(on.length >= 2, `${on.length} flames`)
  for (const a of on) for (const b of on) if (a !== b) { const [ax, az] = g.center(a), [bx, bz] = g.center(b); assert.ok(Math.hypot(ax - bx, az - bz) >= 0.9) }
  const before = [...p.cells]
  run(g, 0.3)
  p.update(g, g.fire)
  for (let k = 0; k < 4; k++) if (before[k] >= 0 && g.fire[before[k]] >= 0.25) assert.equal(p.cells[k], before[k])
  run(g, 12)
  p.update(g, g.fire)
  assert.deepEqual([...p.cells], [-1, -1, -1, -1])
})

const idle = { forward: 0, turn: 0 }
const play = (g: Game, seconds: number, input: { forward: number; turn: number; cast?: boolean; frost?: boolean } = idle) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) g.step(1 / 30, input) }

test('a fire bolt lights the floor where it lands, and a slime standing in the fire keeps burning', () => {
  const g = new Game()
  g.hold()
  g.hero.z = -5
  const s = g.place('purple', 0, -1)
  g.step(1 / 30, { ...idle, cast: true })
  assert.equal(g.hero.spell, 'fire')
  assert.equal(g.hero.mp, 100 - SPELL_COST)
  let lit = false, burned = 0
  for (let t = 0; t < 4; t += 1 / 30) {
    g.step(1 / 30, idle)
    for (const e of g.events) { if (e.type === 'lit' && e.element === 'fire') lit = true; if (e.type === 'hit' && e.by === 'fire') burned++ }
    // held where it was hit, as if it could not leave
    s.x = 0; s.z = -1 + 0.2
  }
  assert.ok(lit)
  assert.ok(g.ground.count('fire') > 0 || g.ground.at(0, -0.8).char > 0)
  assert.ok(burned >= 2 && burned <= Math.ceil(4 / BURN_EVERY), `burned ${burned} times`)
  assert.equal(s.hp, RULES.purple.hp - 2 - burned)
})

test('a frost bolt hits softer, chills the slime it hits and freezes the floor, where slimes go slowly', () => {
  const far = (frost: boolean) => {
    const g = new Game()
    g.hold()
    g.hero.x = 5; g.hero.z = -5
    const s = g.place('green', -4, 4)
    if (frost) { g.ground.light(-4, 4, 'frost'); g.ground.light(-3, 3, 'frost'); g.ground.light(-2, 2, 'frost') }
    play(g, 3)
    return Math.hypot(s.x + 4, s.z - 4)
  }
  const free = far(false), iced = far(true)
  assert.ok(free > 1.5, `free ${free}`)
  assert.ok(iced < free * (CHILL_SPEED + 0.2), `on ice ${iced}, free ${free}`)
  const g = new Game()
  g.hold()
  g.hero.z = -5
  const s = g.place('purple', 0, -2)
  g.step(1 / 30, { ...idle, frost: true })
  play(g, 0.8)
  assert.equal(g.hero.spell, 'frost')
  assert.equal(s.hp, RULES.purple.hp - 1)
  assert.ok(s.chill > 1.5)
  assert.ok(g.ground.at(s.x, s.z).frost > 0 || g.ground.count('frost') > 0)
})

test('the hero is burned by standing in fire and slowed on ice, and a restart clears the floor', () => {
  const g = new Game()
  g.hold()
  g.ground.light(g.hero.x, g.hero.z, 'fire')
  let scorched = 0
  for (let t = 0; t < 1.6; t += 1 / 30) { g.step(1 / 30, idle); for (const e of g.events) if (e.type === 'scorch') scorched++ }
  assert.ok(scorched >= 2)
  assert.equal(g.hero.hp, MAX_HP - scorched * HERO_BURN)
  g.restart()
  g.hold()
  assert.equal(g.ground.count('fire'), 0)
  assert.equal(g.hero.hp, MAX_HP)
  const ran = (ice: boolean) => {
    const k = new Game()
    k.hold()
    k.hero.z = -6
    if (ice) for (let z = -6; z <= 0; z += 0.6) k.ground.light(0, z, 'frost')
    play(k, 1.5, { forward: 1, turn: 0 })
    return k.hero.z + 6
  }
  assert.ok(ran(true) < ran(false) * 0.8, `on ice ${ran(true)}, free ${ran(false)}`)
})

test('frost by a wall creeps up it a course at a time, flames lick only the lowest courses, and both go again', () => {
  const g = new Ground(HALF, PILLARS)
  // a column for each floor cell along the four walls, and some round each pillar
  const walls = g.columns.filter((c) => Math.abs(c.x) > HALF - 0.1 || Math.abs(c.z) > HALF - 0.1).length
  assert.equal(walls, g.n * 4)
  assert.ok(g.columns.length > walls + PILLARS.length * 4)
  const near = (x: number, z: number) => g.columns.findIndex((c) => Math.hypot(c.x - x, c.z - z) < 0.3)
  g.light(0, HALF - 0.3, 'frost')
  const k = near(0.25, HALF)
  assert.ok(k >= 0)
  run(g, 0.5)
  const top = (field: Float32Array, k: number) => { let j = -1; for (let l = 0; l < LAYERS; l++) if (field[k * LAYERS + l] > 0) j = l; return j }
  const early = top(g.upFrost, k)
  run(g, 5)
  const later = top(g.upFrost, k)
  assert.ok(later > early && later >= 2, `frost up the wall: layer ${early} then ${later}`)
  run(g, FROST_LIFE + 12)
  assert.equal(top(g.upFrost, k), -1, 'melted')
  // fire by the opposite wall climbs, but no higher than the second course
  g.light(0, -HALF + 0.3, 'fire')
  run(g, 2)
  let highest = -1
  for (let c = 0; c < g.columns.length; c++) highest = Math.max(highest, top(g.upFire, c))
  assert.ok(highest >= 0 && highest <= 1, `fire up to layer ${highest}`)
  // the floor and the walls are the same for the same bolts
  const h = new Ground(HALF, PILLARS)
  h.light(0, HALF - 0.3, 'frost'); run(h, 5.5 + FROST_LIFE + 12); h.light(0, -HALF + 0.3, 'fire'); run(h, 2)
  assert.deepEqual([...h.upFire], [...g.upFire])
  assert.deepEqual([...h.upFrost], [...g.upFrost])
})

test('steam rises where fire meets frost, and drifts away', () => {
  const g = new Ground(HALF, [])
  g.light(1, 1, 'frost')
  run(g, 1)
  assert.equal(g.puffs().length, 0)
  g.light(1, 1, 'fire')
  const puffs = g.puffs()
  assert.ok(puffs.length >= 3, `${puffs.length} puffs`)
  assert.ok(puffs.every((p) => Math.hypot(p.x - 1, p.z - 1) < SPLASH + 0.5 && p.age === 0))
  g.puff(0, 0.5, 0)
  run(g, STEAM_LIFE + 0.2)
  assert.equal(g.puffs().length, 0)
  for (let i = 0; i < 40; i++) g.puff(i, 0, 0)
  assert.equal(g.steam.length, STEAM_MAX)
})
