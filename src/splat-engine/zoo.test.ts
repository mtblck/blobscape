import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readRiggedGlb, recordClip, sampleClip, writeRiggedGlb } from './glb.ts'
import { aim, dir, restDir, worldQuat } from './posing.ts'
import { Skeleton, mulQ, posedPoint, rotate, skinBlob } from './rig.ts'
import { BREATH, FLAME, breathAt, dragonBreath, dragonFire, makeDragon } from './zoo/dragon.ts'
import { ELF_BONES, QUIVER, clearCloak, clearPlait } from './zoo/elf.ts'
import { ElfCloth } from './zoo/elfCloth.ts'
import { ZOO } from './zoo/index.ts'
import { closestOnSegment } from './xpbd.ts'
import { gaitOf, layout, legRoom, makeMonster, monsterSpecies, planMonster } from './zoo/monster.ts'

const near = (a: number, b: number, e = 1e-4) => Math.abs(a - b) < e

// made-up monsters go through the same checks as the zoo, across a spread of seeds
const MONSTERS = [1, 2, 3, 42, 777, 4821, 31337, 99999].map(monsterSpecies)

for (const sp of [...ZOO, ...MONSTERS]) {
  test(`the ${sp.name} is made with about as many blobs as asked, every one hung on real bones`, () => {
    const c = sp.make(sp.detail[0], sp.looks[0].id)
    const n = c.blobs.count
    assert.ok(Math.abs(n - sp.detail[0]) < sp.detail[0] * 0.08, `${n} blobs for ${sp.detail[0]}`)
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += c.skin.weights[i * 4 + k]
        assert.ok(c.skin.joints[i * 4 + k] < c.skeleton.count)
      }
      assert.ok(near(sum, 1, 1e-3), `blob ${i} weights sum to ${sum}`)
      for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(c.blobs.center[i * 3 + k]) && c.blobs.scale[i * 3 + k] > 0)
    }
    // standing on the floor, not under it
    let low = Infinity
    for (let i = 0; i < n; i++) low = Math.min(low, c.blobs.center[i * 3 + 1])
    assert.ok(low > -0.08 && low < 0.1, `lowest blob at y = ${low}`)
  })

  test(`every move of the ${sp.name} loops and survives a round trip through .glb`, () => {
    const c = sp.make(sp.detail[0], sp.looks[0].id)
    const clips = sp.moves.map((m) => recordClip(m.name, c.skeleton, m.pose, m.seconds, m.fps ?? 24))
    const back = readRiggedGlb(writeRiggedGlb({ name: sp.name, ...c, clips }))
    assert.deepEqual(back.clips.map((x) => x.name), sp.moves.map((m) => m.name))
    clips.forEach((clip, k) => {
      const end = clip.times[clip.times.length - 1]
      sampleClip(clip, c.skeleton, 0)
      const start = c.skeleton.posedHead.slice()
      sampleClip(clip, c.skeleton, end * 0.9999)
      for (let i = 0; i < start.length; i++) assert.ok(Math.abs(c.skeleton.posedHead[i] - start[i]) < 0.03 * (sp.id === 'dragon' ? 4 : 1), `${clip.name} bone coord ${i}`)
      // the file's clip poses every blob where ours does, partway through
      const t = end * 0.37
      sampleClip(clip, c.skeleton, t)
      sampleClip(back.clips[k], back.skeleton, t)
      const a = new Float32Array(3), b = new Float32Array(3), v = new Float32Array(6), w = new Float32Array(6)
      let worst = 0
      for (let i = 0; i < c.blobs.count; i += 11) {
        const args = (x: typeof c) => [x.blobs.center.subarray(i * 3, i * 3 + 3), x.blobs.scale.subarray(i * 3, i * 3 + 3), x.blobs.quat.subarray(i * 4, i * 4 + 4), x.skin.joints.subarray(i * 4, i * 4 + 4), x.skin.weights.subarray(i * 4, i * 4 + 4), x.skeleton] as const
        skinBlob(...args(c), 'quat', a, 0, v, 0)
        skinBlob(...args(back), 'quat', b, 0, w, 0)
        worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
      }
      assert.ok(worst < 1e-3, `${clip.name}: worst ${worst}`)
    })
  })
}

test('the dragon keeps its fire in its mouth until it breathes, and the file keeps that', () => {
  const d = makeDragon(20000)
  const fire = d.skeleton.index('fire1')
  const head = d.skeleton.bones[d.skeleton.index('head')].head
  // at rest every fire bone is within a few centimeters of the mouth, inside the head
  for (let k = 0; k < 6; k++) {
    const h = d.skeleton.bones[fire + k].head
    assert.ok(Math.hypot(h[0] - head[0], h[1] - head[1], h[2] - head[2]) < 0.8, `fire${k + 1}`)
  }
  const breath = ZOO.find((s) => s.id === 'dragon')!.moves.find((m) => m.name === 'fire')!
  const clip = recordClip('fire', d.skeleton, breath.pose, breath.seconds, 30)
  // only the fire bones and the ribs grow, so only they get scale keys
  const grown = (clip.sizes ?? []).map((s, b) => (s ? d.skeleton.bones[b].name : '')).filter(Boolean)
  assert.deepEqual(grown, ['fire1', 'fire2', 'fire3', 'fire4', 'fire5', 'fire6', 'lungs'])
  // mid-breath the flame is life size: its end is meters out in front
  sampleClip(clip, d.skeleton, breath.seconds * 0.6)
  assert.ok(d.skeleton.scale[fire] > FLAME * 0.5, `fire1 at ${d.skeleton.scale[fire]}`)
  const tip = d.skeleton.posedHead.subarray((fire + 5) * 3, (fire + 5) * 3 + 3)
  assert.ok(tip[2] > head[2] + 2, `flame reaches z = ${tip[2]}`)
  // and back in the mouth by the end
  sampleClip(clip, d.skeleton, breath.seconds * 0.99)
  assert.ok(near(d.skeleton.scale[fire], 1, 1e-2))
})

test('the dragon fills its ribs, then breathes onto the ground in front, where the flame turns and runs along it', () => {
  const d = makeDragon(6000)
  const sk = d.skeleton
  const lungs = sk.index('lungs'), fire = sk.index('fire1')
  let fullest = 0, lowest = Infinity
  for (let u = 0; u < 1; u += 0.01) {
    dragonFire(sk, u * BREATH)
    const at = breathAt(u * BREATH)
    fullest = Math.max(fullest, sk.size[lungs])
    // the ribs are fullest before any flame is out
    if (sk.size[lungs] > 1.12) assert.ok(at.flame < 0.5, `ribs full at ${u} with the flame out`)
    if (sk.scale[fire] < FLAME * 0.9) continue
    for (let k = 1; k < 6; k++) {
      const y = sk.posedHead[(fire + k) * 3 + 1]
      lowest = Math.min(lowest, y)
      // no link's middle goes into the floor
      assert.ok(y > 0.15, `fire${k + 1} at y = ${y}, u = ${u}`)
    }
    // the last link lies nearly level: the flame runs along the ground, not into it
    const a = sk.posedHead.subarray((fire + 5) * 3, (fire + 5) * 3 + 3), b = posedPoint(sk, fire + 5, sk.bones[fire + 5].tail!)
    if (u > 0.6 && u < 0.78) assert.ok(b[1] > 0.1 && Math.abs(b[1] - a[1]) < 0.35 * Math.hypot(b[0] - a[0], b[2] - a[2]), `the end of the flame dives at u = ${u}: ${a[1]} to ${b[1]}`)
  }
  assert.ok(fullest > 1.12, `ribs swell to ${fullest}`)
  assert.ok(lowest < 0.7, `the flame comes down to ${lowest}`)
  // the glow bytes mark the breath (all its own light) and the eyes (some)
  let breath = 0
  for (let i = 0; i < d.blobs.count; i++) if (d.glow[i] === 255) breath++
  assert.ok(breath > 200 && breath < d.blobs.count * 0.2, `${breath} blobs of breath`)
  // each look has its own breath, and its own colors for it
  assert.deepEqual(['ice', 'ember', 'jade'].map(dragonBreath), ['frost', 'fire', 'venom'])
  const mean = (look: string) => { const m = makeDragon(6000, look); let r = 0, b = 0, n = 0; for (let i = 0; i < m.blobs.count; i++) if (m.glow[i] === 255) { r += m.blobs.color[i * 3]; b += m.blobs.color[i * 3 + 2]; n++ } return { r: r / n, b: b / n } }
  const frost = mean('ice'), flame = mean('ember')
  assert.ok(frost.b > frost.r && flame.r > flame.b * 2, `frost ${JSON.stringify(frost)} fire ${JSON.stringify(flame)}`)
})

test('aim turns a bone to point where it is told, under a turned parent', () => {
  const sp = ZOO.find((s) => s.id === 'elf')!
  const c = sp.make(sp.detail[0], sp.looks[0].id)
  const sk = c.skeleton
  sk.reset()
  aim(sk, 'lArm', dir([1, 0.2, 0]))
  aim(sk, 'lForearm', dir([0.3, 1, 0.4]))
  const b = sk.index('lForearm')
  const now = rotate(worldQuat(sk, b), restDir(sk, b))
  const want = dir([0.3, 1, 0.4])
  for (let k = 0; k < 3; k++) assert.ok(near(now[k], want[k], 1e-5), `${now} vs ${want}`)
})

test('a file whose scale keys are not numbers is read without them, so it cannot poison the pose', () => {
  const sp = ZOO.find((s) => s.id === 'frog')!
  const c = sp.make(sp.detail[0], sp.looks[0].id)
  const tongue = sp.moves.find((m) => m.name === 'tongue')!
  const clip = recordClip('tongue', c.skeleton, tongue.pose, tongue.seconds, 12)
  clip.sizes![c.skeleton.index('tongue1')]![3] = NaN
  const back = readRiggedGlb(writeRiggedGlb({ name: 'frog', ...c, clips: [clip] }))
  assert.equal(back.clips[0].sizes?.[c.skeleton.index('tongue1')], undefined)
  sampleClip(back.clips[0], back.skeleton, 0.3)
  assert.ok(back.skeleton.matrix.every(Number.isFinite))
})

test('a seed makes the same monster every time, and different seeds make different ones', () => {
  const a = makeMonster(42, 3000), b = makeMonster(42, 3000)
  assert.deepEqual(Array.from(a.blobs.center), Array.from(b.blobs.center))
  assert.deepEqual(Array.from(a.blobs.color), Array.from(b.blobs.color))
  const plans = Array.from({ length: 60 }, (_, k) => planMonster(k + 1))
  assert.deepEqual(new Set(plans.map((p) => p.legs)), new Set([2, 4, 6]))
  assert.ok(new Set(plans.map((p) => p.eyes)).size === 3)
  assert.ok(new Set(plans.map((p) => p.top)).size >= 3)
  assert.ok(new Set(plans.map((p) => p.name)).size > 50, 'names mostly differ')
  assert.equal(monsterSpecies(42).name, monsterSpecies(42).name)
})

const sub = (a: ArrayLike<number>, b: ArrayLike<number>): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const head = (sk: Skeleton, name: string) => sk.posedHead.subarray(sk.index(name) * 3, sk.index(name) * 3 + 3)
/** The least any point down either of the elf's legs clears the lower cloak by (under 0: through it). */
const clearance = (sk: Skeleton) => {
  let least = Infinity
  for (const s of ['l', 'r']) {
    const cape = sk.index(`${s}Cape2`)
    const top = head(sk, `${s}Cape2`), hem = posedPoint(sk, cape, ELF_BONES[cape].tail!)
    const down = dir(sub(hem, top)), length = Math.hypot(...sub(hem, top))
    // the cloak's face: across the chest and down the cloak, with its normal pointing back
    const across = rotate(worldQuat(sk, sk.index('chest')), [1, 0, 0])
    let back: [number, number, number] = [across[1] * down[2] - across[2] * down[1], across[2] * down[0] - across[0] * down[2], across[0] * down[1] - across[1] * down[0]]
    if (back[2] > 0) back = [-back[0], -back[1], -back[2]]
    for (const [from, to, r] of [['Thigh', 'Shin', 0.07], ['Shin', 'Foot', 0.055], ['Foot', 'Toe', 0.045]] as const) {
      for (let k = 0; k <= 8; k++) {
        const p = [0, 1, 2].map((i) => head(sk, `${s}${from}`)[i] * (1 - k / 8) + head(sk, `${s}${to}`)[i] * (k / 8))
        const along = dot(sub(p, top), down)
        if (along < 0 || along > length) continue
        least = Math.min(least, -dot(sub(p, top), back) - r)
      }
    }
  }
  return least
}

test("the elf's legs stay in front of the cloak through the whole walk, and a harder kick still clears it", () => {
  const sk = new Skeleton(ELF_BONES)
  const walk = ZOO.find((s) => s.id === 'elf')!.moves.find((m) => m.name === 'walk')!
  for (let k = 0; k < 44; k++) {
    walk.pose(sk, (k / 44) * walk.seconds)
    assert.ok(clearance(sk) > 0, `through the cloak ${k / 44} of the way through a stride (${clearance(sk)})`)
    // a leg thrown further back than the walk ever throws it
    aim(sk, 'lThigh', dir([0, -0.6, -0.8]))
    sk.update()
    assert.ok(clearance(sk) < 0, 'the kick goes through until the cloak is cleared')
    clearCloak(sk)
    assert.ok(clearance(sk) > 0, `through the cloak on a kick (${clearance(sk)})`)
  }
})

/**
 * How far the plait keeps outside the cloak and clear of the quiver (under 0: through one of them). Down the plait's
 * lower bone, the hair's middle lies a little behind the bone; it must be behind the cloak's face (its tip by its own
 * thickness too) and its whole thickness clear of the quiver.
 */
const plaitRoom = (sk: Skeleton) => {
  const chest = sk.index('chest'), hair = sk.index('hair2')
  const backward = rotate(worldQuat(sk, chest), [0, 0, -1])
  // the cloak's upper face: through both tops and the middle of the folds, its normal pointing back
  const l = head(sk, 'lCape1'), r = head(sk, 'rCape1'), fl = head(sk, 'lCape2'), fr = head(sk, 'rCape2')
  const across = sub(r, l), down = sub([0, 1, 2].map((i) => (fl[i] + fr[i]) / 2), [0, 1, 2].map((i) => (l[i] + r[i]) / 2))
  let n = dir([across[1] * down[2] - across[2] * down[1], across[2] * down[0] - across[0] * down[2], across[0] * down[1] - across[1] * down[0]])
  if (dot(n, backward) < 0) n = [-n[0], -n[1], -n[2]]
  const a = posedPoint(sk, chest, QUIVER[0]), b = posedPoint(sk, chest, QUIVER[1])
  const from = head(sk, 'hair2'), to = posedPoint(sk, hair, ELF_BONES[hair].tail!)
  let least = Infinity
  for (const u of [0, 0.5, 1]) {
    const lag = 0.01 + 0.025 * u, thick = 0.035 - 0.01 * u
    const p = [0, 1, 2].map((i) => from[i] * (1 - u) + to[i] * u + backward[i] * lag)
    least = Math.min(least, dot(sub(p, l), n) - (u === 1 ? thick : 0))
    const q = closestOnSegment(a, b, p[0], p[1], p[2])
    least = Math.min(least, Math.hypot(...sub(p, q)) - 0.05 - thick)
  }
  return least
}

test("the elf's plait hangs outside the cloak and beside the quiver in every move, and a plait thrown forward is put back", () => {
  const sk = new Skeleton(ELF_BONES)
  for (const m of ZOO.find((s) => s.id === 'elf')!.moves) {
    for (let k = 0; k < 44; k++) {
      m.pose(sk, (k / 44) * m.seconds)
      assert.ok(plaitRoom(sk) > 0, `the plait is through the cloak or quiver ${k / 44} of the way through ${m.name} (${plaitRoom(sk)})`)
    }
  }
  // thrown forward into the back, and across behind the quiver
  for (const to of [[0, -1, 0.3], [0.4, -1, 0], [0.15, -1, -0.15]] as const) {
    aim(sk, 'hair1', dir([...to]))
    aim(sk, 'hair2', dir([...to]))
    sk.update()
    assert.ok(plaitRoom(sk) < 0, `a plait thrown to ${to} goes through until it is cleared`)
    clearPlait(sk)
    assert.ok(plaitRoom(sk) > 0, `through the cloak or quiver when thrown to ${to} (${plaitRoom(sk)})`)
  }
})

test("the elf's cloth swings behind as it walks and turns, stays its length, and still clears the legs", () => {
  const sk = new Skeleton(ELF_BONES)
  const walk = ZOO.find((s) => s.id === 'elf')!.moves.find((m) => m.name === 'walk')!
  const cloth = new ElfCloth(sk)
  const len = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(...sub(a, b))
  const rest = new Skeleton(ELF_BONES)
  rest.update()
  const restLength = (name: string) => len(head(rest, name), posedPoint(rest, rest.index(name), ELF_BONES[rest.index(name)].tail!))
  let differs = 0
  const dt = 1 / 60
  for (let f = 0; f < 240; f++) {
    const t = f * dt
    walk.pose(sk, t % walk.seconds)
    const clip = sk.rotation.slice()
    // walking along, turning hard one way then the other
    const heading = 1.2 * Math.sin(t * 2)
    sk.setRotation(0, mulQ([0, Math.sin(heading / 2), 0, Math.cos(heading / 2)], sk.rotation.subarray(0, 4)))
    sk.place.set([Math.sin(heading) * t, 0, Math.cos(heading) * t])
    cloth.update(sk, dt)
    assert.ok(clearance(sk) > 0, `through the cloak at frame ${f} (${clearance(sk)})`)
    assert.ok(plaitRoom(sk) > 0, `the plait is through the cloak or quiver at frame ${f} (${plaitRoom(sk)})`)
    const hem = sk.index('lCape2')
    if (Math.abs(sk.rotation[hem * 4] - clip[hem * 4]) > 0.02) differs++
    for (const name of ['lCape2', 'rCape2', 'hair2']) {
      const b = sk.index(name)
      const got = len(head(sk, name), posedPoint(sk, b, ELF_BONES[b].tail!))
      assert.ok(Math.abs(got - restLength(name)) < 1e-3, `${name} is ${got} long, not ${restLength(name)}`)
    }
    // the plait never goes into the head
    const middle = posedPoint(sk, sk.index('head'), [0, 1.73, 0.02])
    assert.ok(len(head(sk, 'hair2'), middle) > 0.09, `the plait is inside the head at frame ${f}`)
  }
  assert.ok(differs > 60, `the cloak follows the clip too closely (${differs} frames differ)`)
  for (let i = 0; i < sk.rotation.length; i++) assert.ok(Number.isFinite(sk.rotation[i]))
})

test('no leg of a four- or six-legged monster passes through another, in any move', () => {
  let trots = 0, others = 0
  for (let seed = 1; seed <= 120; seed++) {
    const p = planMonster(seed)
    if (p.legs === 2) continue
    const sk = new Skeleton(layout(p).bones)
    assert.ok(legRoom(p, sk) > 0, `seed ${seed}: legs touch standing at rest`)
    for (const m of monsterSpecies(seed).moves) {
      for (let k = 0; k < 60; k++) {
        m.pose(sk, (k / 60) * m.seconds)
        sk.update()
        assert.ok(legRoom(p, sk) > 0, `seed ${seed}: legs pass through each other ${k / 60} of the way through ${m.name}`)
      }
    }
    if (gaitOf(p).lag === Math.PI) trots++; else others++
  }
  // most can still trot; the long-legged, short-bodied ones bring a side's legs into step
  assert.ok(trots > others && others > 0, `${trots} trot, ${others} do not`)
})
