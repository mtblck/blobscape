import * as THREE from 'three/webgpu'
import { boneTail } from '../../splat-engine/body.ts'
import { posedPoint, type Skeleton } from '../../splat-engine/rig.ts'

/**
 * The rig drawn the way Blender draws it: each bone an eight-sided spindle
 * from its head to its tail, fat near the head, with a ball at each joint.
 * Posed from the skeleton every time the creature moves.
 *
 * Over the blobs it draws on top of everything (`onTop`), so the bones show
 * through the body; on its own it draws with depth, so near bones hide far ones.
 */
export class BoneView extends THREE.Group {
  private readonly spindles: THREE.InstancedMesh
  private readonly joints: THREE.InstancedMesh
  private readonly tails: [number, number, number][]
  /** The widest a bone gets: long bones (a wing's fingers) stay slim. */
  private readonly widest: number
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly yAxis = new THREE.Vector3(0, 1, 0)
  private readonly d = new THREE.Vector3()
  private readonly materials: THREE.MeshBasicNodeMaterial[]

  constructor(private readonly sk: Skeleton) {
    super()
    const n = sk.count
    this.tails = sk.bones.map((_, i) => boneTail(sk.bones, i))
    const lengths = sk.bones.map((b, i) => Math.hypot(this.tails[i][0] - b.head[0], this.tails[i][1] - b.head[1], this.tails[i][2] - b.head[2])).sort((a, b) => a - b)
    this.widest = 0.14 * (lengths[lengths.length >> 1] || 0.1)
    const bone = new THREE.MeshBasicNodeMaterial({ vertexColors: true, side: THREE.DoubleSide })
    const joint = new THREE.MeshBasicNodeMaterial({ color: 0xf2553a })
    this.materials = [bone, joint]
    this.spindles = new THREE.InstancedMesh(spindle(), bone, n)
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), joint, n)
    for (const mesh of [this.spindles, this.joints]) {
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.renderOrder = 10
      this.add(mesh)
    }
    this.update()
  }

  /** Draw over the blobs (true) or among them (false). */
  set onTop(v: boolean) {
    for (const m of this.materials) { m.depthTest = !v; m.depthWrite = !v; m.transparent = v; m.needsUpdate = true }
  }

  /** Moves every bone to the skeleton's current pose. */
  update() {
    const sk = this.sk
    const head = new THREE.Vector3(), tail = new THREE.Vector3()
    for (let i = 0; i < sk.count; i++) {
      head.fromArray(sk.posedHead, i * 3)
      tail.fromArray(posedPoint(sk, i, this.tails[i]))
      this.d.subVectors(tail, head)
      const len = this.d.length()
      if (len > 1e-6) this.q.setFromUnitVectors(this.yAxis, this.d.divideScalar(len))
      else this.q.identity()
      const w = Math.min(len * 0.11, this.widest * sk.scale[i])
      this.m.compose(head, this.q, new THREE.Vector3(w, len, w))
      this.spindles.setMatrixAt(i, this.m)
      const r = Math.max(Math.min(len * 0.07, this.widest * 0.7 * sk.scale[i]), 1e-4)
      this.m.compose(head, this.q, new THREE.Vector3(r, r, r))
      this.joints.setMatrixAt(i, this.m)
    }
    this.spindles.instanceMatrix.needsUpdate = true
    this.joints.instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const mesh of [this.spindles, this.joints]) { mesh.geometry.dispose(); mesh.dispose() }
    for (const m of this.materials) m.dispose()
  }
}

/** A unit bone along +y: a point at 0, a square waist at 0.1 (half-width 1), a point at 1. Each face shaded flat, as if lit from one side. */
function spindle() {
  const top = [0, 1, 0], bottom = [0, 0, 0]
  const ring = [[1, 0.1, 0], [0, 0.1, 1], [-1, 0.1, 0], [0, 0.1, -1]]
  const pos: number[] = [], col: number[] = []
  const light = new THREE.Vector3(-0.4, 0.5, 0.75).normalize()
  const tri = (a: number[], b: number[], c: number[]) => {
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), new THREE.Vector3(...c).sub(new THREE.Vector3(...a))).normalize()
    const k = 0.55 + 0.45 * Math.max(0, n.dot(light))
    pos.push(...a, ...b, ...c)
    for (let v = 0; v < 3; v++) col.push(0.93 * k, 0.95 * k, 0.98 * k)
  }
  for (let k = 0; k < 4; k++) {
    const a = ring[k], b = ring[(k + 1) % 4]
    tri(a, b, top)
    tri(b, a, bottom)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return g
}
