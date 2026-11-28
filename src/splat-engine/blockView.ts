import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, Mesh, NoBlending, NodeMaterial, PerspectiveCamera, QuadMesh, RenderTarget, Vector2, Vector3, Vector4, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { FAR_LEVELS, chunkFaces, farChunk, farLevel, flowMesh, holed, keptBlocks, lampSight, lampsOf, planFlow, shapeFlow, type BlockLook, type BlockPiece, type BlockSource, type FlowMesh, type FlowPlan, type SolidCells } from './blocks.ts'
import type { Light } from './engine.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, attribute, clamp, dot, float, max, min, normalWorld, positionView, positionWorld, select, smoothstep, texture, uniform, uniformArray, uv, vec3, vec4 } = TSL
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
 * round each face. A surface that moves by itself (an actor with `flows`: a pond) is columns whose tops follow its
 * blobs (`reshape` after they change), drawn after the cubes and as see-through as its blobs are. It draws into a target with four samples a pixel and copies that out, since a cube's edges want
 * smoothing that soft blobs never did. An actor as big as a world (`far`) is cut into squares at each of its levels,
 * and each frame every square is drawn at the level its distance asks for (`farLevel`).
 */
export class BlockView extends Group {
  /** How many cubes it holds. */
  blocks: number
  /** How many faces of them it draws: those with no cube of the same bone beside them. */
  faces: number
  private readonly material = new NodeMaterial()
  private readonly liquid = new NodeMaterial()
  /** The meshes of one bone's cubes at one level (one mesh, or one a square for a far actor, sharing its corners); `built` and `solid` where its faces can see lamps. */
  private readonly pieces: { meshes: Mesh[]; actor: number; bone: number; built?: BlockPiece; solid?: SolidCells }[] = []
  /** A far actor's squares, a bone at a time: each square's mesh at every level it has faces at, and the level it is drawn at. */
  private readonly chunks: { actor: number; bone: number; middle: [number, number, number]; reach: number; cell: number; at: (Mesh | undefined)[]; level: number }[] = []
  /** Which of the first four lights cast block shadows (lamps that stay put, by the first actor's `seen`), and where each stood when its shadows were last worked out. */
  private readonly casts: boolean[]
  private readonly baked: (string | undefined)[] = [undefined, undefined, undefined, undefined]
  private readonly shadowed = uniform(new Vector4(0, 0, 0, 0))
  private readonly flows: { mesh: Mesh; actor: number; plan: FlowPlan; shape: FlowMesh }[] = []
  private readonly pos = uniformArray(Array.from({ length: BLOCK_LIGHTS }, () => new Vector4(0, 0, 0, 1)), 'vec4')
  private readonly col = uniformArray(Array.from({ length: BLOCK_LIGHTS }, () => new Vector4()), 'vec4')
  private readonly ambient = uniform(new Vector3(1, 1, 1))
  private readonly lightCount = uniform(0, 'int')
  private readonly edge = uniform(0.3)
  private readonly fogColor = uniform(new Vector3(0, 0, 0))
  private readonly fogRange = uniform(new Vector2(0, 0))
  private readonly picture = new RenderTarget(1, 1, { samples: 4 })
  private readonly out = new NodeMaterial()
  private readonly quad: QuadMesh

  constructor(private readonly actors: readonly BlockActor[], private readonly look: BlockLook) {
    super()
    this.material.fragmentNode = this.fragment(false)
    this.material.blending = NoBlending
    this.liquid.fragmentNode = this.fragment(true)
    this.liquid.transparent = true
    this.out.fragmentNode = texture(this.picture.texture, uv())
    this.out.blending = NoBlending
    this.out.depthTest = false
    this.out.depthWrite = false
    this.quad = new QuadMesh(this.out)
    this.edge.value = look.edge ?? 0.3
    // each source alone (none shades or joins another), so one whose cubes are kept (`keepCubes`) is not made again;
    // a far source at each of its levels too, every level cut into the same squares
    const levels = actors.map((a) => {
      if (!a.far || a.flows) return [keptBlocks(a, look)]
      const cell = a.blockCell ?? look.cell, walls = farChunk(cell)
      return Array.from({ length: FAR_LEVELS + 1 }, (_, k) => keptBlocks({ ...a, blockCell: cell * 2 ** k, walls }, look))
    })
    this.casts = look.shadows === false ? [false, false, false, false] : lampsOf(actors[0]?.seen)
    this.blocks = 0
    this.faces = 0
    for (const l of levels) this.blocks += l[0].blocks
    const squares = new Map<string, (typeof this.chunks)[number]>()
    for (const [actor, built] of levels.entries()) for (const [level, b] of built.entries()) for (const one of b.pieces) {
      const p = { ...one, actor }, indices = holed(p, actors[actor].hole)
      // a bone whose cubes all stand in the hole draws nothing
      if (!indices.length) continue
      if (!level) this.faces += indices.length / 6
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(p.positions, 3))
      g.setAttribute('normal', new BufferAttribute(p.normals, 3))
      g.setAttribute('paint', new BufferAttribute(p.colors, 3))
      g.setAttribute('blockLight', new BufferAttribute(p.light, 3))
      g.setAttribute('lampSeen', new BufferAttribute(new Float32Array((p.positions.length / 3) * 4).fill(1), 4))
      g.setAttribute('uv', new BufferAttribute(p.uvs, 2))
      const mesh = (index: Uint32Array) => {
        // a square's mesh shares its level's corners and has only its own triangles
        const geo = built.length > 1 ? new BufferGeometry() : g
        if (geo !== g) for (const name of Object.keys(g.attributes)) geo.setAttribute(name, g.getAttribute(name))
        geo.setIndex(new BufferAttribute(index, 1))
        const m = new Mesh(geo, this.material)
        m.matrixAutoUpdate = false
        // a bone can carry its cubes anywhere, so the rest pose's bounds say nothing
        m.frustumCulled = false
        this.add(m)
        return m
      }
      if (built.length === 1) {
        this.pieces.push({ meshes: [mesh(indices)], actor, bone: p.bone, built: p, solid: b.solids[0] })
        continue
      }
      const meshes: Mesh[] = []
      for (const c of chunkFaces(p, indices, farChunk(actors[actor].blockCell ?? look.cell))) {
        const id = `${actor}:${p.bone}:${c.key}`
        let square = squares.get(id)
        if (!square) {
          squares.set(id, (square = { actor, bone: p.bone, middle: c.middle, reach: c.reach, cell: actors[actor].blockCell ?? look.cell, at: [], level: 0 }))
          this.chunks.push(square)
        }
        const m = mesh(c.indices)
        square.at[level] = m
        meshes.push(m)
      }
      this.pieces.push({ meshes, actor, bone: p.bone, built: p, solid: b.solids[0] })
    }
    actors.forEach((a, actor) => {
      if (!a.flows) return
      const plan = planFlow(a.blobs, a.blockCell ?? look.cell), shape = flowMesh(plan, look)
      shapeFlow(plan, shape, a.blobs, look)
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(shape.positions, 3).setUsage(DynamicDrawUsage))
      g.setAttribute('normal', new BufferAttribute(shape.normals, 3))
      g.setAttribute('wash', new BufferAttribute(shape.colors, 4).setUsage(DynamicDrawUsage))
      g.setAttribute('blockLight', new BufferAttribute(shape.light, 3))
      g.setAttribute('uv', new BufferAttribute(shape.uvs, 2))
      g.setIndex(new BufferAttribute(shape.indices, 1))
      const mesh = new Mesh(g, this.liquid)
      mesh.matrixAutoUpdate = false
      mesh.frustumCulled = false
      // after every cube, so what lies under it shows through
      mesh.renderOrder = 1
      this.add(mesh)
      this.flows.push({ mesh, actor, plan, shape })
      this.pieces.push({ meshes: [mesh], actor, bone: 0 })
      this.blocks += plan.count
      this.faces += plan.count * 5
    })
    this.pose()
  }

  /** After an actor's blobs were changed in place: a surface that moves (`flows`) lays its columns to them again. Any other actor's cubes stay as built. */
  reshape(actor: BlockSource) {
    for (const f of this.flows) {
      if (this.actors[f.actor] !== actor) continue
      shapeFlow(f.plan, f.shape, actor.blobs, this.look)
      f.mesh.geometry.getAttribute('position').needsUpdate = true
      f.mesh.geometry.getAttribute('wash').needsUpdate = true
    }
  }

  /** A face's color: its block's own, times the look's light and the lamps' on it (never less than the light the block gives itself), with a line near its edge. */
  private fragment(liquid: boolean) {
    return Fn(() => {
      const wash = liquid ? attribute('wash', 'vec4') : undefined
      const paint = wash ? wash.xyz : attribute('paint', 'vec3'), light = attribute('blockLight', 'vec3')
      // how much of each of the first four lights this face sees, where that light casts block shadows
      const sees = liquid ? undefined : attribute('lampSeen', 'vec4')
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
        const toward = max(dot(n, to.mul(TSL.inverseSqrt(max(d2, 1e-6)))), 0)
        // a lamp that casts shadows lights only the faces that see it; any other wraps a little round, having none
        const k = TSL.int(i)
        const casts = select(k.equal(0), this.shadowed.x, select(k.equal(1), this.shadowed.y, select(k.equal(2), this.shadowed.z, select(k.equal(3), this.shadowed.w, float(0)))))
        const seen = sees ? select(k.equal(0), sees.x, select(k.equal(1), sees.y, select(k.equal(2), sees.z, select(k.equal(3), sees.w, float(1))))) : float(1)
        const facing = TSL.mix(toward.mul(1 - LAMP_WRAP).add(LAMP_WRAP), toward.mul(seen), casts)
        sum.addAssign(C.xyz.mul(fall.mul(facing)))
      })
      const lit = max(sum.mul(light.y), vec3(light.z))
      // the line: within EDGE_WIDTH of the face's edge, fading out as a face gets too small on screen to hold one
      const at = uv()
      const d = min(min(at.x, float(1).sub(at.x)), min(at.y, float(1).sub(at.y)))
      const w = max(TSL.fwidth(at.x), TSL.fwidth(at.y)).toVar()
      const line = float(1).sub(smoothstep(float(EDGE_WIDTH).sub(w.mul(0.5)), float(EDGE_WIDTH).add(w.mul(0.5)), d)).mul(clamp(float(EDGE_WIDTH * 4).div(max(w, 1e-5)), 0, 1))
      const rgb = paint.mul(lit).mul(float(1).sub(line.mul(this.edge)))
      // distance fog as the blobs have it (engine.ts `fogged`), by depth in front of the camera
      const span = max(this.fogRange.y.sub(this.fogRange.x), 0.0001)
      const f = select(this.fogRange.y.greaterThan(0), positionView.z.negate().sub(this.fogRange.x).div(span).clamp(0, 1), float(0))
      return vec4(TSL.mix(rgb, vec3(this.fogColor), f), wash ? wash.w : 1)
    })()
  }

  /** Distance fog toward `color` (linear) from `near` to `far` in front of the camera, as `SplatWorld.setFog` (`far` 0 is none). */
  setFog(color: readonly [number, number, number], near: number, far: number) {
    this.fogColor.value.set(color[0], color[1], color[2])
    this.fogRange.value.set(near, far)
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
    // block shadows from the lamps that stay put: worked out again only when one has moved
    for (let k = 0; k < 4; k++) {
      const l = lights[k], on = this.casts[k] && !!l && !('direction' in l)
      this.shadowed.value.setComponent(k, on ? 1 : 0)
      if (!on) continue
      const p = (l as { position: readonly [number, number, number]; range: number })
      const key = `${p.position.map((v) => v.toFixed(3)).join(',')},${p.range.toFixed(2)}`
      if (this.baked[k] === key) continue
      this.baked[k] = key
      for (const piece of this.pieces) {
        if (piece.actor !== 0 || !piece.built || !piece.solid) continue
        const sight = lampSight(piece.built, piece.solid, p.position, p.range)
        // the squares of a far actor's level share one set of corners
        const a = piece.meshes[0].geometry.getAttribute('lampSeen') as BufferAttribute
        for (let f = 0; f < sight.length; f++) for (let c = 0; c < 4; c++) (a.array as Float32Array)[(f * 4 + c) * 4 + k] = sight[f]
        a.needsUpdate = true
      }
    }
  }

  /** Puts every piece where its bone is now. */
  pose() {
    for (const p of this.pieces) {
      const sk = this.actors[p.actor].skeleton, shown = sk.scale[p.bone] > 0
      for (const mesh of p.meshes) {
        mesh.visible = shown
        if (!shown) continue
        mesh.matrix.fromArray(sk.matrix, p.bone * 16)
        mesh.matrixWorldNeedsUpdate = true
      }
    }
  }

  /** How many of a far actor's squares are drawn at each level now: its own cubes first. */
  levels(): number[] {
    const n = Array.from({ length: FAR_LEVELS + 1 }, () => 0)
    for (const c of this.chunks) if (this.actors[c.actor].skeleton.scale[c.bone] > 0) n[c.level]++
    return n
  }

  /** Each square of a far actor at the level its distance from `camera` asks for, `height` device pixels tall (after `pose`). */
  private choose(camera: Camera, height: number) {
    if (!this.chunks.length) return
    const eye = new Vector3(), at = new Vector3(), m = new Vector3()
    camera.updateMatrixWorld()
    eye.setFromMatrixPosition(camera.matrixWorld)
    // pixels a unit is across at a unit away
    const per = camera instanceof PerspectiveCamera ? height / (2 * Math.tan((camera.fov * Math.PI) / 360)) : 0
    for (const c of this.chunks) {
      const sk = this.actors[c.actor].skeleton
      if (!(sk.scale[c.bone] > 0)) continue
      const e = sk.matrix, o = c.bone * 16
      m.set(c.middle[0], c.middle[1], c.middle[2])
      at.set(e[o] * m.x + e[o + 4] * m.y + e[o + 8] * m.z + e[o + 12], e[o + 1] * m.x + e[o + 5] * m.y + e[o + 9] * m.z + e[o + 13], e[o + 2] * m.x + e[o + 6] * m.y + e[o + 10] * m.z + e[o + 14])
      const size = Math.hypot(e[o], e[o + 1], e[o + 2])
      // its nearest point, for the biggest its cubes come anywhere in it
      const away = Math.max(at.distanceTo(eye) - c.reach * size, 1e-3)
      c.level = per ? farLevel((c.cell * size * per) / away, c.level, c.at.length - 1) : 0
      for (const [k, mesh] of c.at.entries()) if (mesh) mesh.visible = k === c.level
    }
  }

  /** Draws the scene (this view in it) into the renderer's current target, or onto the screen when it has none, with its edges smoothed. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera, width: number, height: number) {
    if (this.picture.width !== width || this.picture.height !== height) this.picture.setSize(width, height)
    this.pose()
    this.choose(camera, height)
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(to)
    this.quad.render(renderer)
  }

  /** Frees the meshes and the target. */
  dispose() {
    for (const p of this.pieces) for (const mesh of p.meshes) mesh.geometry.dispose()
    this.material.dispose()
    this.liquid.dispose()
    this.out.dispose()
    this.picture.dispose()
  }
}
