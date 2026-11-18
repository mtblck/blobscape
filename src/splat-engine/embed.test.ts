import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Blobs } from '../splat-core/blobs.ts'
import { STAGE_FOV, orbitLens } from '../splat-core/orbit.ts'
import { readRiggedGlb } from './glb.ts'
import { clipNamed, fitOrbit, headBone } from './embed.ts'

const sample = (name: string) => readRiggedGlb(new Uint8Array(readFileSync(new URL(`../../public/rigged-splats/${name}.glb`, import.meta.url))))

test('a creature is framed whole from any side, in wide and tall views, and fills a fair share of the view', () => {
  for (const name of ['fox', 'frog', 'puffer']) {
    const { blobs } = sample(name)
    for (const aspect of [1, 4 / 3, 0.6]) {
      let widest = 0
      for (const azimuth of [0, 30, 90, 200]) {
        const w = 400, h = w / aspect
        const o = fitOrbit(blobs, aspect, azimuth, 10)
        // the stage's lens: orbitLens is built for another field of view, so scale its focal length
        const lens = orbitLens(o, w, h)
        const f = (h / 2) / Math.tan((STAGE_FOV * Math.PI) / 360)
        const m = lens.view
        for (let i = 0; i < blobs.count; i++) {
          if (blobs.opacity[i] < 0.05) continue
          const [x, y, z] = [blobs.center[i * 3], blobs.center[i * 3 + 1], blobs.center[i * 3 + 2]]
          const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cz = m[2] * x + m[6] * y + m[10] * z + m[14]
          assert.ok(cz < 0, `${name}: a blob is behind the camera`)
          const sx = (f * cx) / -cz, sy = (f * cy) / -cz
          assert.ok(Math.abs(sx) <= w / 2 && Math.abs(sy) <= h / 2, `${name} at ${azimuth}°, aspect ${aspect}: a blob center is off the view (${sx.toFixed(0)}, ${sy.toFixed(0)})`)
          widest = Math.max(widest, Math.abs(sx) / (w / 2), Math.abs(sy) / (h / 2))
        }
      }
      assert.ok(widest > 0.45, `${name}, aspect ${aspect}: it only reaches ${(widest * 100).toFixed(0)}% of the way to the edge`)
    }
  }
})

test('no blobs: a plain view, not a broken one', () => {
  const o = fitOrbit(new Blobs(), 1)
  assert.ok(Number.isFinite(o.distance) && o.distance > 0)
})

test('the head is found by name, a neck if there is no head, and nothing on a headless body', () => {
  assert.equal(headBone(sample('fox').skeleton.bones.map((b) => b.name)), 'head')
  assert.equal(headBone(['hips', 'forehead_gem', 'Head']), 'Head')
  assert.equal(headBone(['hips', 'neck1', 'neck2']), 'neck1')
  assert.equal(headBone(sample('puffer').skeleton.bones.map((b) => b.name)), undefined)
})

test('a move is found by name in any letter case, and the first plays when the name is unknown or missing', () => {
  const { clips } = sample('fox')
  assert.equal(clipNamed(clips, ' IDLE ')?.name, 'idle')
  assert.equal(clipNamed(clips, 'walk')?.name, clips[0].name)
  assert.equal(clipNamed(clips, null)?.name, clips[0].name)
  assert.equal(clipNamed([], 'walk'), undefined)
})
