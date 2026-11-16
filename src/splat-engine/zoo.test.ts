import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readRiggedGlb, recordClip, sampleClip, writeRiggedGlb } from './glb.ts'
import { aim, dir, restDir, worldQuat } from './posing.ts'
import { Skeleton, posedPoint, rotate, skinBlob } from './rig.ts'
import { FLAME, makeDragon } from './zoo/dragon.ts'
import { ELF_BONES, clearCloak } from './zoo/elf.ts'
import { ZOO } from './zoo/index.ts'
import { makeMonster, monsterSpecies, planMonster } from './zoo/monster.ts'

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
  // only the fire bones grow, so only they get scale keys
  const grown = (clip.sizes ?? []).map((s, b) => (s ? d.skeleton.bones[b].name : '')).filter(Boolean)
  assert.deepEqual(grown, ['fire1', 'fire2', 'fire3', 'fire4', 'fire5', 'fire6'])
  // mid-breath the flame is life size: its end is meters out in front
  sampleClip(clip, d.skeleton, breath.seconds * 0.6)
  assert.ok(d.skeleton.scale[fire] > FLAME * 0.5, `fire1 at ${d.skeleton.scale[fire]}`)
  const tip = d.skeleton.posedHead.subarray((fire + 5) * 3, (fire + 5) * 3 + 3)
  assert.ok(tip[2] > head[2] + 2, `flame reaches z = ${tip[2]}`)
  // and back in the mouth by the end
  sampleClip(clip, d.skeleton, breath.seconds * 0.99)
  assert.ok(near(d.skeleton.scale[fire], 1, 1e-2))
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

test("the elf's legs stay in front of the cloak through the whole walk, and a harder kick still clears it", () => {
  const sk = new Skeleton(ELF_BONES)
  const sub = (a: ArrayLike<number>, b: ArrayLike<number>): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const head = (name: string) => sk.posedHead.subarray(sk.index(name) * 3, sk.index(name) * 3 + 3)
  /** The least any point down either leg clears the lower cloak by (under 0: through it). */
  const clearance = () => {
    let least = Infinity
    for (const s of ['l', 'r']) {
      const cape = sk.index(`${s}Cape2`)
      const top = head(`${s}Cape2`), hem = posedPoint(sk, cape, ELF_BONES[cape].tail!)
      const down = dir(sub(hem, top)), length = Math.hypot(...sub(hem, top))
      // the cloak's face: across the chest and down the cloak, with its normal pointing back
      const across = rotate(worldQuat(sk, sk.index('chest')), [1, 0, 0])
      let back: [number, number, number] = [across[1] * down[2] - across[2] * down[1], across[2] * down[0] - across[0] * down[2], across[0] * down[1] - across[1] * down[0]]
      if (back[2] > 0) back = [-back[0], -back[1], -back[2]]
      for (const [from, to, r] of [['Thigh', 'Shin', 0.07], ['Shin', 'Foot', 0.055], ['Foot', 'Toe', 0.045]] as const) {
        for (let k = 0; k <= 8; k++) {
          const p = [0, 1, 2].map((i) => head(`${s}${from}`)[i] * (1 - k / 8) + head(`${s}${to}`)[i] * (k / 8))
          const along = dot(sub(p, top), down)
          if (along < 0 || along > length) continue
          least = Math.min(least, -dot(sub(p, top), back) - r)
        }
      }
    }
    return least
  }
  const walk = ZOO.find((s) => s.id === 'elf')!.moves.find((m) => m.name === 'walk')!
  for (let k = 0; k < 44; k++) {
    walk.pose(sk, (k / 44) * walk.seconds)
    assert.ok(clearance() > 0, `through the cloak ${k / 44} of the way through a stride (${clearance()})`)
    // a leg thrown further back than the walk ever throws it
    aim(sk, 'lThigh', dir([0, -0.6, -0.8]))
    sk.update()
    assert.ok(clearance() < 0, 'the kick goes through until the cloak is cleared')
    clearCloak(sk)
    assert.ok(clearance() > 0, `through the cloak on a kick (${clearance()})`)
  }
})
