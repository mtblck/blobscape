import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { inFront, levelPlane, mirrorMatrix, reflectPoint, seenIn, type MirrorImage, type MirrorPlane } from './reflect.ts'

const tilted: MirrorPlane = (() => { const l = Math.hypot(1, 2, -0.5); return { normal: [1 / l, 2 / l, -0.5 / l], offset: 0.7 } })()

test('a point flips through the mirror and back', () => {
  for (const m of [levelPlane(0.16), tilted]) {
    const p = [0.4, 1.3, -2] as const, q = reflectPoint(p, m), back = reflectPoint(q, m)
    assert.ok(Math.abs(inFront(p, m) + inFront(q, m)) < 1e-12, 'as far behind as it was in front')
    back.forEach((v, i) => assert.ok(Math.abs(v - p[i]) < 1e-12))
    // a point on the mirror stays put
    const on = [p[0] - inFront(p, m) * m.normal[0], p[1] - inFront(p, m) * m.normal[1], p[2] - inFront(p, m) * m.normal[2]]
    reflectPoint(on, m).forEach((v, i) => assert.ok(Math.abs(v - on[i]) < 1e-12))
  }
  assert.deepEqual(reflectPoint([1, 2, 3], levelPlane(0.5)), [1, -1, 3])
})

test('the matrix does what reflectPoint does, and undoes itself', () => {
  const M = new Matrix4().fromArray(mirrorMatrix(tilted))
  const p = new Vector3(0.4, 1.3, -2).applyMatrix4(M), want = reflectPoint([0.4, 1.3, -2], tilted)
  assert.ok(Math.abs(p.x - want[0]) + Math.abs(p.y - want[1]) + Math.abs(p.z - want[2]) < 1e-9)
  const twice = M.clone().multiply(M).elements, one = new Matrix4().elements
  twice.forEach((v, i) => assert.ok(Math.abs(v - one[i]) < 1e-12))
  assert.ok(Math.abs(M.determinant() + 1) < 1e-12, 'a mirror image turns things round')
})

/** A picture whose pixel (i, j) holds i in red and j in green, all covered, for a camera looking down on a pond. */
function picture(): { img: MirrorImage; cam: PerspectiveCamera } {
  const cam = new PerspectiveCamera(50, 4 / 3, 0.1, 100)
  cam.position.set(0, 3, 6)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  const width = 64, height = 48, pixels = new Float32Array(width * height * 4)
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) pixels.set([i, j, 0, 1], (j * width + i) * 4)
  return { img: { width, height, pixels, viewProj: new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).toArray(), plane: levelPlane(0) }, cam }
}

test('a point on a flat mirror sees the pixel it is itself drawn at', () => {
  // the mirror image of what a point on the mirror reflects lies behind that very point, as the eye sees it
  const { img, cam } = picture(), out = [0, 0, 0, 0]
  for (const [x, z] of [[0, 0], [1.5, -1], [-2, 1.2]]) {
    const s = new Vector3(x, 0, z).project(cam), px = (s.x * 0.5 + 0.5) * img.width - 0.5, py = (0.5 - s.y * 0.5) * img.height - 0.5
    // anything along the mirrored line of sight from the surface point: here a point up and away from the eye
    const eye = cam.position, dir = new Vector3(x - eye.x, -eye.y, z - eye.z).normalize()
    const up = new Vector3(dir.x, -dir.y, dir.z)
    for (const t of [0, 0.7, 3]) {
      assert.ok(seenIn(img, x + up.x * t, up.y * t, z + up.z * t, out))
      assert.ok(Math.abs(out[0] - px) < 1e-3 && Math.abs(out[1] - py) < 1e-3, `(${x}, ${z}) at ${t}: ${out[0]}, ${out[1]} for ${px}, ${py}`)
      assert.ok(Math.abs(out[3] - 1) < 1e-6)
    }
  }
})

test('what is higher over the mirror is seen lower in the picture, and nothing off it or behind the eye', () => {
  const { img } = picture(), low = [0, 0, 0, 0], high = [0, 0, 0, 0]
  assert.ok(seenIn(img, 0, 0.2, -1, low) && seenIn(img, 0, 1.2, -1, high))
  assert.ok(high[1] > low[1] + 3, 'a reflection hangs downward')
  assert.ok(!seenIn(img, 40, 0.5, 0, low), 'off the side')
  assert.deepEqual(low, [0, 0, 0, 0])
  assert.ok(!seenIn(img, 0, -3, 20, low), 'behind the eye, through the mirror')
})
