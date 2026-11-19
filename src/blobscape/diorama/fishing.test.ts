import { test } from 'node:test'
import assert from 'node:assert/strict'
import { posedPoint } from '../../splat-engine/rig.ts'
import { compileScene } from '../../splat-engine/sceneDoc.ts'
import { Skeleton } from '../../splat-engine/rig.ts'
import { AT, HALF, ambientAt, bodyAt, catchAt, dayAt, lightsAt, poseFishing, skyAt } from './fishing.ts'
import { FISHING, LINE_PIECE, LINE_PIECES, LOOP, TIP, ZENITH } from './scenes/fishing.ts'
import { checkScene } from '../../splat-engine/sceneDoc.ts'

const c = compileScene(FISHING)
const posed = (t: number) => { const sk = new Skeleton(c.bones); poseFishing(sk, t, c.pose); return sk }
const far = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

test('the description is sound and the loop is two catches', () => {
  assert.deepEqual(checkScene(FISHING), [])
  assert.equal(LOOP, HALF * 2)
  assert.deepEqual(catchAt(HALF + 1), { half: 1, s: 1 })
})

test('the moon is flung up as the day goes and the sun as it comes back', () => {
  // noon at the start, the sun in the sky and the moon hidden under the clouds
  assert.equal(dayAt(0), 1)
  assert.equal(bodyAt(1, 0).size, 1)
  assert.equal(bodyAt(0, 0).size, 0)
  // the moon hangs at the zenith once it has settled, and the sun has gone down
  const moon = bodyAt(0, HALF - 0.5)
  assert.ok(far(moon.at, ZENITH) < 0.01 && moon.size === 1)
  assert.equal(bodyAt(1, HALF - 0.5).size, 0)
  assert.equal(dayAt(HALF - 0.5), 0)
  // and the other way round a catch later
  assert.ok(far(bodyAt(1, LOOP - 0.5).at, ZENITH) < 0.01 && bodyAt(0, LOOP - 0.5).size === 0)
  assert.equal(dayAt(LOOP - 0.5), 1)
  // a catch only ever rises while it is being hauled out of the cloud
  for (let s = AT.heave; s < AT.heave + 0.7; s += 0.05) assert.ok(bodyAt(0, s + 0.05).at[1] > bodyAt(0, s).at[1])
})

test('the sky, the light and the lights turn with the day and repeat with the loop', () => {
  assert.deepEqual(skyAt(1), [[63, 143, 224], [191, 228, 250]])
  assert.deepEqual(skyAt(HALF - 1), [[11, 15, 46], [39, 53, 122]])
  for (const t of [0.3, 6.9, 13.1, 19.4]) {
    assert.deepEqual(skyAt(t), skyAt(t + LOOP))
    assert.deepEqual(ambientAt(t), ambientAt(t + LOOP))
    assert.equal(lightsAt(t).length, 3)
  }
  assert.ok(ambientAt(HALF - 1)[2] > ambientAt(HALF - 1)[0] && ambientAt(HALF - 1)[2] < 0.5, 'night is dim and blue')
})

test('the line runs unbroken from the tip of the rod to the float all the way through', () => {
  for (let t = 0; t < LOOP; t += 0.1) {
    const sk = posed(t)
    const tip = posedPoint(sk, sk.index('arms'), TIP)
    const fb = sk.index('float'), float = posedPoint(sk, fb, sk.bones[fb].head)
    const first = sk.index('line0'), last = sk.index(`line${LINE_PIECES - 1}`)
    assert.ok(far(posedPoint(sk, first, sk.bones[first].head), tip) < 1e-4, `the line leaves the tip at ${t.toFixed(1)} s`)
    const h = sk.bones[last].head
    assert.ok(far(posedPoint(sk, last, [h[0], h[1] - LINE_PIECE, h[2]]), float) < 1e-3, `the line reaches the float at ${t.toFixed(1)} s`)
    // each piece starts no further along than the one before it ends
    for (let i = 1; i < LINE_PIECES; i++) {
      const a = sk.index(`line${i - 1}`), b = sk.index(`line${i}`)
      assert.ok(far(posedPoint(sk, a, sk.bones[a].head), posedPoint(sk, b, sk.bones[b].head)) <= LINE_PIECE * sk.size[a] + 1e-4, `a gap in the line at ${t.toFixed(1)} s`)
    }
  }
})
