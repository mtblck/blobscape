import * as THREE from 'three'
import type { SplatMesh } from '@sparkjsdev/spark'

export interface Framing {
  center: THREE.Vector3
  radius: number
  count: number
}

/**
 * Finds the object's center and size from its splat centers, ignoring the
 * faint and far-off ones: captures always have floaters, and a plain bounding
 * box would frame those instead of the object.
 */
export function measure(mesh: SplatMesh): Framing {
  const xs: number[] = [], ys: number[] = [], zs: number[] = []
  let count = 0
  const total = mesh.packedSplats?.numSplats ?? 0
  const stride = Math.max(1, Math.floor(total / 150000))
  const m = mesh.matrixWorld
  const p = new THREE.Vector3()
  mesh.forEachSplat((i, center, _s, _q, opacity) => {
    count++
    if (i % stride || opacity < 0.2) return
    p.copy(center).applyMatrix4(m)
    xs.push(p.x); ys.push(p.y); zs.push(p.z)
  })
  if (!xs.length) return { center: new THREE.Vector3(), radius: 1, count }
  const q = (a: number[], t: number) => {
    const s = [...a].sort((x, y) => x - y)
    return s[Math.min(s.length - 1, Math.floor(t * s.length))]
  }
  // Center on the middle of the 2nd–98th percentile box, not the mean: one cluster of floaters drags a mean around.
  const center = new THREE.Vector3((q(xs, 0.02) + q(xs, 0.98)) / 2, (q(ys, 0.02) + q(ys, 0.98)) / 2, (q(zs, 0.02) + q(zs, 0.98)) / 2)
  const d = xs.map((x, i) => Math.hypot(x - center.x, ys[i] - center.y, zs[i] - center.z))
  const radius = Math.max(1e-3, q(d, 0.97))
  return { center, radius, count }
}

