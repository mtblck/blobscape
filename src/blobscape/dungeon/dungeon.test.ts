import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Dungeon } from './dungeon.ts'
import { BURST, Game, KINDS, MAX_MP, PROPS, RULES, SWING, SWORD_REACH } from './game.ts'
import { makeHero, poseHero } from './hero.ts'
import { rotate } from '../../splat-engine/rig.ts'
import { PIECES, cutPieces, pieceFlight } from './breakables.ts'
import { CRYSTALS, FLAMES, paintFloor } from './elements.ts'
import { Ground } from './ground.ts'
import { Blobs } from '../../splat-core/blobs.ts'
import { MAX_LIGHTS } from '../../splat-engine/engine.ts'
import { torchLight } from './hall.ts'

test('the dungeon builds every actor once, with a pool of slimes per color hidden until they come out', () => {
  const t0 = performance.now()
  const d = new Dungeon({ detail: 1, look: 'forest', difficulty: 'normal', light: 'baked' })
  const ms = performance.now() - t0
  assert.ok(d.blobCount > 100000 && d.blobCount < 200000, `${d.blobCount} blobs`)
  assert.ok(ms < 4000, `built in ${ms} ms`)
  for (const k of KINDS) assert.equal(d.slimes[k].length, RULES[k].pool)
  // nothing out yet: every slime is hidden
  for (const k of KINDS) for (const s of d.slimes[k]) assert.ok(s.skeleton.scale[0] < 1e-6)
})

test('a slime that comes out shows, and bursting it flings its shards out and down onto the floor', () => {
  const d = new Dungeon({ detail: 0.3, look: 'dusk', difficulty: 'normal', light: 'live' })
  d.game.hold()
  const s = d.game.place('red', 2, 2)
  d.update(1 / 30, { forward: 0, turn: 0 })
  const sk = d.slimes.red[s.slot].skeleton
  assert.ok(sk.scale[0] > 0.5)
  const shard = sk.index('shard0')
  assert.equal(sk.scale[shard], 0)
  s.hp = 0
  s.phase = 'burst'
  s.t = 0
  for (let t = 0; t < 1; t += 1 / 30) d.update(1 / 30, { forward: 0, turn: 0 })
  assert.ok(sk.scale[shard] > 0.5, 'shards show')
  const y = sk.posedHead[shard * 3 + 1]
  assert.ok(y >= 0 && y < 0.1, `landed at ${y}`)
  assert.ok(Math.hypot(sk.posedHead[shard * 3] - 2, sk.posedHead[shard * 3 + 2] - 2) > 0.6, 'flew out')
  for (let t = 0; t < BURST; t += 1 / 30) d.update(1 / 30, { forward: 0, turn: 0 })
  assert.ok(sk.scale[0] < 1e-6, 'gone once faded')
})

test('torchlight is warm by a torch and cold and dim in the middle of the hall', () => {
  const near = torchLight([3.2, 0, 5.8]), mid = torchLight([0, 0, 0])
  assert.ok(near[0] > mid[0] * 1.5 && near[0] > near[2] * 1.3)
  assert.ok(mid[2] >= mid[0] * 0.6)
})

test('live lights: eight torches, the orb dimming with the magic, a light per bolt and a flash per burst, never more than the engine takes', () => {
  const d = new Dungeon({ detail: 0.3, look: 'forest', difficulty: 'normal', light: 'live' })
  d.game.hold()
  const orb = () => d.lights()[8]
  const full = orb().color[2]
  d.game.hero.mp = 0
  d.update(1 / 30, { forward: 0, turn: 0 })
  assert.ok(orb().color[2] < full * 0.5)
  d.game.hero.mp = MAX_MP
  for (let k = 0; k < 4; k++) d.game.place(KINDS[k], -3 + 2 * k, 3)
  d.update(1 / 30, { forward: 0, turn: 0, cast: true })
  for (let t = 0; t < 0.3; t += 1 / 30) d.update(1 / 30, { forward: 0, turn: 0 })
  assert.ok(d.lights().length >= 10, 'a bolt lights')
  for (const s of d.game.slimes) { s.phase = 'burst'; s.t = 0 }
  d.update(1 / 30, { forward: 0, turn: 0 })
  const ls = d.lights()
  assert.ok(ls.length > 12 && ls.length <= MAX_LIGHTS, `${ls.length} lights`)
  for (const l of ls) assert.ok(l.range > 0 && l.color.every((c) => c >= 0 && Number.isFinite(c)))
})

test('a fire bolt colors the floor, stands flames on it and lights it; when it has burned out the flames are gone and the stone is scorched', () => {
  const d = new Dungeon({ detail: 0.3, look: 'forest', difficulty: 'normal', light: 'live' })
  const idle = { forward: 0, turn: 0 }
  d.game.hold()
  assert.ok(d.takeRepaint().includes(d.floor))
  d.update(1 / 30, idle)
  assert.deepEqual(d.takeRepaint(), [], 'a floor nothing happened to is left alone')
  const floor = d.floor.blobs, own = floor.color.slice(0, floor.count * 3)
  const flames = () => { let n = 0; for (let i = 0; i < FLAMES; i++) if (d.blaze.skeleton.size[i + 1] > 0) n++; return n }
  assert.equal(flames(), 0)
  assert.equal(d.stainedBlobs, 0)
  const lights = d.lights().length
  d.game.place('purple', 0, 1.5)
  d.update(1 / 30, { ...idle, cast: true })
  // the fire bolt shows, not the frost one in the same slot
  for (let t = 0; t < 0.3; t += 1 / 30) d.update(1 / 30, idle)
  const slot = d.game.bolts[0].slot
  assert.ok(d.bolts.fire[slot].skeleton.scale[0] > 0.5 && d.bolts.frost[slot].skeleton.scale[0] < 1e-6)
  for (let t = 0; t < 1.2; t += 1 / 30) d.update(1 / 30, idle)
  assert.ok(d.takeRepaint().includes(d.floor))
  assert.ok(flames() >= 2, `${flames()} flames`)
  assert.ok(d.stainedBlobs > 50, `${d.stainedBlobs} blobs recolored`)
  assert.ok(d.lights().length > lights)
  // a burning blob is redder than its stone, and every flame stands on a cell that burns
  let redder = 0
  for (let i = 0; i < floor.count; i++) if (floor.color[i * 3] > own[i * 3] + 0.2 && floor.color[i * 3] > floor.color[i * 3 + 2] * 2) redder++
  assert.ok(redder > 30, `${redder} glowing blobs`)
  const sk = d.blaze.skeleton
  for (let i = 0; i < FLAMES; i++) if (sk.size[i + 1] > 0) assert.ok(d.game.ground.at(sk.posedHead[(i + 1) * 3], sk.posedHead[(i + 1) * 3 + 2]).fire > 0)
  for (let t = 0; t < 6; t += 1 / 30) d.update(1 / 30, idle)
  assert.equal(flames(), 0)
  assert.equal(d.game.ground.count('fire'), 0)
  let darker = 0
  for (let i = 0; i < floor.count; i++) if (floor.color[i * 3] < own[i * 3] * 0.8) darker++
  assert.ok(darker > 30, `${darker} scorched blobs`)
  // starting again gives the floor its own colors back
  d.game.restart()
  d.update(1 / 30, idle)
  assert.equal(d.stainedBlobs, 0)
  assert.deepEqual([...floor.color.subarray(0, 300)], [...own.subarray(0, 300)])
})

test('a frost bolt grows ice on the floor and turns it pale blue, dimmer where baked light is dim', () => {
  const d = new Dungeon({ detail: 0.3, look: 'forest', difficulty: 'normal', light: 'baked' })
  const idle = { forward: 0, turn: 0 }
  d.game.hold()
  d.game.place('red', 0, 1.5)
  d.update(1 / 30, { ...idle, frost: true })
  for (let t = 0; t < 2; t += 1 / 30) d.update(1 / 30, idle)
  let ice = 0
  for (let i = 0; i < CRYSTALS; i++) if (d.ice.skeleton.size[i + 1] > 0.3) ice++
  assert.ok(ice >= 2, `${ice} clumps of ice`)
  assert.ok(d.stainedBlobs > 50)
  // the same frost on a bright blob and a dim one: the dim one stays dimmer
  const g = new Ground(4)
  g.light(0, 0, 'frost')
  g.step(1)
  const two = new Blobs(2)
  for (let k = 0; k < 2; k++) two.push({ center: [0.01, 0, 0.01], scale: [0.1, 0.1, 0.1], quat: [0, 0, 0, 1], color: [0, 0, 0], opacity: 1 })
  const base = new Float32Array([0.6, 0.55, 0.5, 0.12, 0.11, 0.12])
  assert.equal(paintFloor(two, base, g, false), 2)
  assert.ok(two.color[2] > two.color[0] && two.color[5] > two.color[3], 'both turn blue')
  assert.ok(two.color[5] < two.color[2] * 0.6, `dim ${two.color[5]} against bright ${two.color[2]}`)
  paintFloor(two, base, g, true)
  assert.ok(two.color[5] > 0.5, 'with live lights the frost is its own color and the lights dim it')
})

test('a prop is cut into pieces of its own blobs: whole, they sit where they were cut; broken, they fly on from the blow and lie on the floor', () => {
  const d = new Dungeon({ detail: 0.3, look: 'forest', difficulty: 'normal', light: 'baked' })
  const idle = { forward: 0, turn: 0 }
  d.game.hold()
  d.update(1 / 30, idle)
  assert.equal(d.props.length, PROPS.length)
  for (const kind of ['crate', 'urn', 'barrel'] as const) {
    const p = d.game.props.find((p) => p.kind === kind)!
    const prop = d.props[p.slot], sk = prop.skeleton
    // every blob rides one piece, and every piece has blobs: nothing hidden waits to stand in for the body
    const per = new Array(PIECES).fill(0)
    for (let i = 0; i < prop.blobs.count; i++) {
      const j = prop.skin.joints[i * 4]
      assert.ok(j >= 2 && j < 2 + PIECES && prop.skin.weights[i * 4] === 1, `${kind} blob ${i} on bone ${j}`)
      per[j - 2]++
    }
    assert.ok(per.every((n) => n > prop.blobs.count / PIECES / 4), `${kind} pieces: ${per}`)
    assert.ok(sk.scale[1] > 0.9, `${kind} stands`)
    for (let i = 0; i < PIECES; i++) {
      const h = prop.pieces[i].home
      assert.ok(Math.hypot(sk.posedHead[(2 + i) * 3] - p.x - 0, 0) < 1 && Math.abs(sk.posedHead[(2 + i) * 3 + 1] - h[1]) < 1e-5, `${kind} piece ${i} sits where it was cut`)
    }
    // a blow going +x
    Object.assign(p, { phase: 'broken', hp: 0, t: 0, dx: 1, dz: 0 })
    for (let t = 0; t < 1.5; t += 1 / 30) d.update(1 / 30, idle)
    let sum = 0
    for (let i = 0; i < PIECES; i++) {
      const b = 2 + i, piece = prop.pieces[i]
      const y = sk.posedHead[b * 3 + 1]
      assert.ok(Math.abs(y - piece.rest) < 1e-4 && piece.rest > 0 && piece.rest < 0.4, `${kind} piece ${i} lies at ${y}, rest ${piece.rest}`)
      sum += sk.posedHead[b * 3] - p.x
      // a piece landed is the same however long ago it broke
      assert.ok(pieceFlight(piece, i, 1, 0, 1.5).landed)
      assert.deepEqual(pieceFlight(piece, i, 1, 0, 1.5).at, pieceFlight(piece, i, 1, 0, 9).at)
    }
    assert.ok(sum / PIECES > 0.5, `${kind}'s pieces went the blow's way: ${sum / PIECES}`)
  }
})

test('cutPieces spreads its seeds and gives every blob to the nearest', () => {
  // a row of 100 points along x: ten pieces should be ten runs of about ten
  const c = new Float32Array(300)
  for (let i = 0; i < 100; i++) c[i * 3] = i
  const of = cutPieces(c, 100, 10)
  const sizes = new Array(10).fill(0)
  for (let i = 0; i < 100; i++) sizes[of[i]]++
  assert.ok(sizes.every((n) => n >= 5 && n <= 16), `${sizes}`)
  for (let i = 1; i < 100; i++) if (of[i] !== of[i - 1]) assert.ok(!Array.from(of.subarray(0, i - 1)).includes(of[i]), 'each piece is one run')
})

test('the swing is a low sweep: while it can hit, the blade is below a slime\'s top and reaches out in front, right to left', () => {
  const hero = makeHero(3000, 'forest'), sk = hero.skeleton
  const g = new Game()
  g.hold()
  Object.assign(g.hero, { x: 0, z: 0, heading: 0 })
  const clock = { idle: 0, walk: 0, down: -1, flicker: true }
  const sword = sk.index('sword')
  const tip = (u: number) => {
    g.hero.swingT = u * SWING
    poseHero(sk, g.hero, clock, 0)
    const d = rotate(sk.quat.subarray(sword * 4, sword * 4 + 4), [0, 0, 0.84])
    return [sk.posedHead[sword * 3] + d[0], sk.posedHead[sword * 3 + 1] + d[1], sk.posedHead[sword * 3 + 2] + d[2]]
  }
  // a green slime's top is 0.57 m up; the sweep's middle (the hit window is 0.1 to 0.24 s of the swing's 0.42)
  let reach = 0
  for (let u = 0.34; u <= 0.5; u += 0.02) {
    const [x, y, z] = tip(u)
    assert.ok(y > 0.1 && y < 0.6, `the tip is ${y.toFixed(2)} m up at ${u.toFixed(2)}`)
    assert.ok(z > 0.5, `the tip is ${z.toFixed(2)} m in front at ${u.toFixed(2)}`)
    reach = Math.max(reach, Math.hypot(x, z))
  }
  assert.ok(Math.abs(reach - SWORD_REACH) < 0.2, `the blade reaches ${reach.toFixed(2)} m, the rules say ${SWORD_REACH}`)
  // it starts on the hero's right (−x) and ends on the left
  assert.ok(tip(0.3)[0] < -0.8 && tip(0.56)[0] > 0.6)
})

test('a slime a fire bolt hits burns on its body, a frost bolt puts it out in steam, and frost by a wall frosts the wall', () => {
  const d = new Dungeon({ detail: 0.3, look: 'forest', difficulty: 'normal', light: 'live' })
  const idle = { forward: 0, turn: 0 }
  const g = d.game
  g.hold()
  const s = g.place('red', 0, 1.5)
  s.hp = 99
  const shown = (sk: { count: number; size: Float32Array }) => { let n = 0; for (let i = 1; i < sk.count; i++) if (sk.size[i] > 0.05) n++; return n }
  assert.equal(shown(d.bodyFlames.skeleton), 0)
  d.update(1 / 30, { ...idle, cast: true })
  for (let t = 0; t < 0.5; t += 1 / 30) d.update(1 / 30, idle)
  assert.ok(s.alight > 0.5, `alight ${s.alight}`)
  assert.equal(shown(d.bodyFlames.skeleton), 1)
  const at = d.bodyFlames.skeleton.posedHead
  assert.ok(Math.hypot(at[3] - s.x, at[5] - s.z) < 0.05, 'the flame rides on the slime')
  // the frost bolt meets the burning slime: out, in a puff of steam
  for (let t = 0; t < 0.6; t += 1 / 30) d.update(1 / 30, idle)
  d.update(1 / 30, { ...idle, frost: true })
  for (let t = 0; t < 0.4; t += 1 / 30) d.update(1 / 30, idle)
  assert.equal(s.alight, 0)
  assert.ok(shown(d.steam.skeleton) >= 1, 'steam rises')
  assert.equal(shown(d.bodyFlames.skeleton), 0)
  // frost on the floor by a wall climbs it, and the wall's blobs turn pale
  g.ground.light(0, 6.7, 'frost')
  for (let t = 0; t < 5; t += 1 / 30) d.update(1 / 30, idle)
  const w = d.walls.blobs
  let pale = 0
  for (let i = 0; i < w.count; i++) if (w.color[i * 3 + 2] > 0.6 && w.center[i * 3 + 1] > 0.5) pale++
  assert.ok(pale > 10, `${pale} frosted wall blobs above the first course`)
})
