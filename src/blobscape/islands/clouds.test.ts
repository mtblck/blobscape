import test from 'node:test'
import assert from 'node:assert/strict'
import { makeIsland } from './island.ts'
import { CLOUD_BODY, CLOUD_WISPS, cloudActor, poseClouds } from './clouds.ts'

test("an island's clouds are faint soft blobs, a bone each, that drift and come back", () => {
  const { plan } = makeIsland('meadow', 7)
  const a = cloudActor(plan)
  assert.equal(a.blobs.count, plan.clouds.length * (CLOUD_BODY + CLOUD_WISPS))
  assert.equal(a.skeleton.count, plan.clouds.length + 1)
  for (let i = 0; i < a.blobs.count; i++) assert.ok(a.blobs.opacity[i] > 0 && a.blobs.opacity[i] < 0.5, `blob ${i} is see-through`)
  // each blob near its own cloud
  for (let i = 0; i < a.blobs.count; i++) {
    const c = plan.clouds[a.skin.joints[i * 4] - 1], d = Math.hypot(a.blobs.center[i * 3] - c.at[0], a.blobs.center[i * 3 + 2] - c.at[2])
    assert.ok(d < c.r * 6, `blob ${i} ${d} from its cloud`)
  }
  poseClouds(plan, a.skeleton, 3, 12)
  const moved = a.skeleton.offset[3]
  poseClouds(plan, a.skeleton, 15, 12)
  assert.ok(Math.abs(a.skeleton.offset[3] - moved) < 1e-6, 'a loop later it is where it was')
})
