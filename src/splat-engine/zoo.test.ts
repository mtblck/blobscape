import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readRiggedGlb, recordClip, sampleClip, writeRiggedGlb } from './glb.ts'
import { aim, dir, restDir, worldQuat } from './posing.ts'
import { rotate, skinBlob } from './rig.ts'
import { FLAME, makeDragon } from './zoo/dragon.ts'
import { ZOO } from './zoo/index.ts'

const near = (a: number, b: number, e = 1e-4) => Math.abs(a - b) < e

for (const sp of ZOO) {
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
      for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(c.blobs.centre[i * 3 + k]) && c.blobs.scale[i * 3 + k] > 0)
    }
    // standing on the floor, not under it
    let low = Infinity
    for (let i = 0; i < n; i++) low = Math.min(low, c.blobs.centre[i * 3 + 1])
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
        const args = (x: typeof c) => [x.blobs.centre.subarray(i * 3, i * 3 + 3), x.blobs.scale.subarray(i * 3, i * 3 + 3), x.blobs.quat.subarray(i * 4, i * 4 + 4), x.skin.joints.subarray(i * 4, i * 4 + 4), x.skin.weights.subarray(i * 4, i * 4 + 4), x.skeleton] as const
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
  // at rest every fire bone is within a few centimetres of the mouth, inside the head
  for (let k = 0; k < 6; k++) {
    const h = d.skeleton.bones[fire + k].head
    assert.ok(Math.hypot(h[0] - head[0], h[1] - head[1], h[2] - head[2]) < 0.8, `fire${k + 1}`)
  }
  const breath = ZOO.find((s) => s.id === 'dragon')!.moves.find((m) => m.name === 'fire')!
  const clip = recordClip('fire', d.skeleton, breath.pose, breath.seconds, 30)
  // only the fire bones grow, so only they get scale keys
  const grown = (clip.sizes ?? []).map((s, b) => (s ? d.skeleton.bones[b].name : '')).filter(Boolean)
  assert.deepEqual(grown, ['fire1', 'fire2', 'fire3', 'fire4', 'fire5', 'fire6'])
  // mid-breath the flame is life size: its end is metres out in front
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
