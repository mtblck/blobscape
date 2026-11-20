import { BufferAttribute, BufferGeometry, Group, Mesh, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector3, Vector4, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { buildBlocks, type BlockLook, type BlockSource } from './blocks.ts'
import type { Light } from './engine.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, attribute, clamp, dot, float, max, min, normalWorld, positionWorld, select, smoothstep, texture, uniform, uniformArray, uv, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** How many of the stage's lights reach the blocks; the rest are dropped. */
export const BLOCK_LIGHTS = 16
/** How far in from a face's edge its line reaches, as a share of the face. */
export const EDGE_WIDTH = 0.045
/** How much of a lamp's light a face turned away from it still takes: lamps cast no shadows here, so a little wraps round. */
export const LAMP_WRAP = 0.2

/** What a view needs of an actor: what blocks are made from, and the posed bones that carry them. */
export type BlockActor = BlockSource & { skeleton: { matrix: Float32Array; scale: Float32Array; bones: readonly { name: string }[] } }

/**
 * A scene drawn as blocks (blocks.ts): one mesh for each bone that carries cubes, moved by that bone whole, so cubes
 * never bend. The look's own light is in the corners already; this adds the stage's lamps to each face by where it
 * is and which way it faces now, keeps a block that gives its own light at its own color, and draws a thin line
 * round each face. It draws into a target with four samples a pixel and copies that out, since a cube's edges want
 * smoothing that soft blobs never did.
 */
export class BlockView extends Group {
  /** How many cubes it holds. */
  readonly blocks: number
  /** How many faces of them it draws: those with no cube of the same bone beside them. */
  readonly faces: number
  private readonly material = new NodeMaterial()
  private readonly pieces: { mesh: Mesh; actor: number; bone: number }[] = []
  private readonly pos = uniformArray(Array.from({ length: BLOCK_LIGHTS }, () => new Vector4(0, 0, 0, 1)), 'vec4')
  private readonly col = uniformArray(Array.from({ length: BLOCK_LIGHTS }, () => new Vector4()), 'vec4')
  private readonly ambient = uniform(new Vector3(1, 1, 1))
  private readonly lightCount = uniform(0, 'int')
  private readonly edge = uniform(0.3)
  private readonly picture = new RenderTarget(1, 1, { samples: 4 })
  private readonly out = new NodeMaterial()
  private readonly quad: QuadMesh

  constructor(private readonly actors: readonly BlockActor[], look: BlockLook) {
    super()
    this.material.fragmentNode = this.fragment()
    this.material.blending = NoBlending
    this.out.fragmentNode = texture(this.picture.texture, uv())
    this.out.blending = NoBlending
    this.out.depthTest = false
    this.out.depthWrite = false
    this.quad = new QuadMesh(this.out)
    this.edge.value = look.edge ?? 0.3
    const built = buildBlocks(actors, look)
    this.blocks = built.blocks
    this.faces = built.faces
    for (const p of built.pieces) {
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(p.positions, 3))
      g.setAttribute('normal', new BufferAttribute(p.normals, 3))
      g.setAttribute('paint', new BufferAttribute(p.colors, 3))
      g.setAttribute('blockLight', new BufferAttribute(p.light, 3))
      g.setAttribute('uv', new BufferAttribute(p.uvs, 2))
      g.setIndex(new BufferAttribute(p.indices, 1))
      const mesh = new Mesh(g, this.material)
      mesh.matrixAutoUpdate = false
      // a bone can carry its cubes anywhere, so the rest pose's bounds say nothing
      mesh.frustumCulled = false
      this.add(mesh)
      this.pieces.push({ mesh, actor: p.actor, bone: p.bone })
    }
    this.pose()
  }

  /** A face's color: its block's own, times the look's light and the lamps' on it (never less than the light the block gives itself), with a line near its edge. */
  private fragment() {
    return Fn(() => {
      const paint = attribute('paint', 'vec3'), light = attribute('blockLight', 'vec3')
      const n = normalWorld, world = positionWorld
      const sum = vec3(this.ambient).mul(light.x).toVar()
      TSL.Loop(this.lightCount, ({ i }: { i: N }) => {
        const P = this.pos.element(i), C = this.col.element(i)
        const sun = P.w.lessThan(0)
        const to = select(sun, P.xyz, P.xyz.sub(world)).toVar()
        const d2 = dot(to, to).toVar()
        const r2 = P.w.mul(P.w)
        // as the engine's lights: a quarter strength at `range`, gone by twice it
        const fade = max(float(1).sub(d2.div(r2.mul(4))), 0)
        const fall = select(sun, float(1), fade.mul(fade).div(float(1).add(d2.div(r2))))
        const facing = max(dot(n, to.mul(TSL.inverseSqrt(max(d2, 1e-6)))), 0).mul(1 - LAMP_WRAP).add(LAMP_WRAP)
        sum.addAssign(C.xyz.mul(fall.mul(facing)))
      })
      const lit = max(sum.mul(light.y), vec3(light.z))
      // the line: within EDGE_WIDTH of the face's edge, fading out as a face gets too small on screen to hold one
      const at = uv()
      const d = min(min(at.x, float(1).sub(at.x)), min(at.y, float(1).sub(at.y)))
      const w = max(TSL.fwidth(at.x), TSL.fwidth(at.y)).toVar()
      const line = float(1).sub(smoothstep(float(EDGE_WIDTH).sub(w.mul(0.5)), float(EDGE_WIDTH).add(w.mul(0.5)), d)).mul(clamp(float(EDGE_WIDTH * 4).div(max(w, 1e-5)), 0, 1))
      return vec4(paint.mul(lit).mul(float(1).sub(line.mul(this.edge))), 1)
    })()
  }

  /** The stage's lights and ambient light, as `SplatWorld.setLights` takes them; `tint` multiplies the ambient (a night's light). */
  setLights(lights: readonly Light[], ambient: number | readonly [number, number, number] = 1, tint: readonly [number, number, number] = [1, 1, 1]) {
    const a = typeof ambient === 'number' ? [ambient, ambient, ambient] : ambient
    this.ambient.value.set(a[0] * tint[0], a[1] * tint[1], a[2] * tint[2])
    this.lightCount.value = Math.min(BLOCK_LIGHTS, lights.length)
    for (let k = 0; k < BLOCK_LIGHTS; k++) {
      const l = lights[k]
      if (l && 'direction' in l) {
        const d = l.direction, len = Math.hypot(d[0], d[1], d[2]) || 1
        ;(this.pos.array[k] as Vector4).set(d[0] / len, d[1] / len, d[2] / len, -1)
      } else (this.pos.array[k] as Vector4).set(l?.position[0] ?? 0, l?.position[1] ?? 0, l?.position[2] ?? 0, l ? Math.max(1e-3, l.range) : 1)
      ;(this.col.array[k] as Vector4).set(l?.color[0] ?? 0, l?.color[1] ?? 0, l?.color[2] ?? 0, 0)
    }
  }

  /** Puts every piece where its bone is now. */
  pose() {
    for (const p of this.pieces) {
      const sk = this.actors[p.actor].skeleton
      p.mesh.visible = sk.scale[p.bone] > 0
      if (!p.mesh.visible) continue
      p.mesh.matrix.fromArray(sk.matrix, p.bone * 16)
      p.mesh.matrixWorldNeedsUpdate = true
    }
  }

  /** Draws the scene (this view in it) into the renderer's current target, or onto the screen when it has none, with its edges smoothed. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera, width: number, height: number) {
    if (this.picture.width !== width || this.picture.height !== height) this.picture.setSize(width, height)
    this.pose()
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(to)
    this.quad.render(renderer)
  }

  /** Frees the meshes and the target. */
  dispose() {
    for (const p of this.pieces) p.mesh.geometry.dispose()
    this.material.dispose()
    this.out.dispose()
    this.picture.dispose()
  }
}
