import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { STAGE_FOV, placeCamera, snapAnchor, type Orbit, type SnapAnchor } from './orbit.ts'
import { snapShift } from './pixel.ts'

/** The art-grid shift `snap` makes for the world point `at`, seen from `o` on art `w` × `h` pixels. */
function shiftFor(o: Orbit, at: readonly number[], w: number, h: number): string {
  const cam = new THREE.PerspectiveCamera(STAGE_FOV, w / h, 0.05, 100)
  placeCamera(cam, o, w / h)
  cam.updateMatrixWorld()
  const p = new THREE.Vector3(at[0], at[1], at[2]).project(cam)
  return [snapShift(p.x, w), snapShift(p.y, h)].map((v) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(6)).join()
}

test('snapAnchor: a rocking view never shifts the art grid, where snapping at the origin jumped it', () => {
  const view: Orbit = { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 }
  const fromOrigin = new Set<string>(), fromAnchor = new Set<string>()
  let kept: SnapAnchor | undefined
  for (let i = 0; i < 120; i++) {
    const o = { ...view, azimuth: view.azimuth + Math.sin((i / 120) * Math.PI * 2) * 6 }
    kept = snapAnchor(kept, o)
    fromOrigin.add(shiftFor(o, [0, 0, 0], 320, 240))
    fromAnchor.add(shiftFor(o, kept.at, 320, 240))
  }
  assert.ok(fromOrigin.size > 1, 'the old anchor jumps as the view rocks (else this test shows nothing)')
  assert.equal(fromAnchor.size, 1)
})

test('snapAnchor: a pan keeps the anchor where it was in the world; a turn or zoom moves it to the target', () => {
  const o: Orbit = { target: [1, 2, 3], distance: 4, azimuth: 10, elevation: 5 }
  const a = snapAnchor(undefined, o)
  assert.deepEqual(a.at, [1, 2, 3])
  assert.equal(snapAnchor(a, { ...o, target: [2, 2, 3] }), a)
  assert.deepEqual(snapAnchor(a, { ...o, target: [2, 2, 3], azimuth: 11 }).at, [2, 2, 3])
  assert.deepEqual(snapAnchor(a, { ...o, target: [2, 2, 3], distance: 3 }).at, [2, 2, 3])
})
