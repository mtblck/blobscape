import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import { placeCamera, type Orbit } from '../../../splat-core/orbit.ts'
import { at, bands, faced, glowing, lit, lump, patches, seeded } from '../meshKit.ts'
import { AMBIENT, FLOWERS, FOX, FOX_SIZE, GRASS, HAZE, LEGS, LIGHTS, LOOP, MOON, MOONLIGHT, ROCKS, STARS, STONE, TURF, WISP_LIGHT, bladeHeight, foxAt, grown, trot, wispAt, type Leg, type V3 } from './layout.ts'

/**
 * The fox's meadow in three.js, the way it is usually built there. The fox is the library's own spheres, cones and
 * tapered cylinders in a tree of groups, turned at the joints each frame; its coat is thousands of small cones stood
 * on those shapes (found with the library's surface sampler), each drawn as an instance and riding its part. The grass
 * is one bent blade drawn thousands of times, each leaned by the wind on the CPU every frame. The moon is a
 * directional light and the wisp a point light, both casting shadow maps, so everything shades everything.
 *
 * It gives the scene drawn small with clear pixels where there is nothing; the page finishes it as pixel art.
 */

const rand = seeded(11)
const K = FOX.colors
const v = (p: V3) => new THREE.Vector3(...p)
const UP = new THREE.Vector3(0, 1, 0)

/** A ball of radii `r` at `p`, as geometry in its parent's frame. */
const ball = (p: V3, r: V3 | number, detail = 12) => { const k = typeof r === 'number' ? [r, r, r] : r; return new THREE.SphereGeometry(1, detail + 2, detail).scale(k[0], k[1], k[2]).translate(...p) }
/** A round bar from `a` to `b` that tapers from `ra` to `rb`, as geometry in its parent's frame. */
function taper(a: V3, b: V3, ra: number, rb: number) {
  const from = v(a), to = v(b), length = from.distanceTo(to)
  const g = new THREE.CylinderGeometry(rb, ra, length, 12, 3)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()))
  g.translate(...from.add(to).multiplyScalar(0.5).toArray())
  return g
}

/** One blade of grass a unit tall: a strip that narrows to a point and bends forward, darker at the foot. */
function bladeShape() {
  const rows = 4, pos: number[] = [], col: number[] = [], index: number[] = []
  for (let k = 0; k <= rows; k++) {
    const y = k / rows, half = 0.5 * (1 - y) ** 0.7, z = 0.25 * y * y, shade = 0.45 + 0.55 * y
    pos.push(-half, y, z, half, y, z)
    col.push(shade, shade, shade, shade, shade, shade)
    if (k < rows) index.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

export class MeadowMeshes {
  readonly name = 'meshes'
  private canvas = document.createElement('canvas')
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
  private pixels = new Uint8Array(0)
  private fog = new THREE.Fog(HAZE.color, 1, 10)
  private wisp: THREE.PointLight
  private fox = new THREE.Group()
  private body = new THREE.Group()
  private legs = {} as Record<Leg, { upper: THREE.Group; lower: THREE.Group }>
  private tail = [new THREE.Group(), new THREE.Group()]
  private specks: THREE.InstancedMesh
  private grass: THREE.InstancedMesh
  /** Each blade: where it stands, how tall and wide, which way it faces and leans. */
  private blades: { x: number; z: number; tall: number; wide: number; yaw: number; lean: number }[] = []
  /** Triangles in the scene: for the page's caption. */
  triangles = 0

  constructor() {
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setClearColor(0x000000, 0)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const scene = this.scene
    scene.fog = this.fog
    const add = <T extends THREE.Object3D>(o: T, to: THREE.Object3D = scene) => { to.add(o); return o }
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], to: THREE.Object3D = scene) => add(new THREE.Mesh(g, m), to)

    // The light. Lambert divides by π, and the painted light the other panels use works on display values, so a face
    // in full moonlight is 0.9 of its color and one in shade 0.45 of it: here those are set in linear light, and
    // dimmed to what the night keeps away from the wisp.
    const shade = (MOONLIGHT.ambient * 0.9) ** 2.2, full = 0.9 ** 2.2
    add(new THREE.AmbientLight(new THREE.Color(0.84, 0.9, 1.14), shade * Math.PI * AMBIENT))
    const moon = add(new THREE.DirectionalLight(new THREE.Color(1.03, 1, 0.95), (full - shade) * Math.PI * AMBIENT))
    moon.position.set(...MOONLIGHT.from).multiplyScalar(5)
    moon.castShadow = true
    moon.shadow.mapSize.set(1024, 1024)
    Object.assign(moon.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 0.5, far: 12 })
    moon.shadow.bias = -0.0015
    moon.shadow.normalBias = 0.01
    moon.shadow.intensity = MOONLIGHT.shadow
    const wisp = this.wisp = add(new THREE.PointLight(WISP_LIGHT.color, 1, WISP_LIGHT.range * 2, 1.4))
    wisp.castShadow = true
    wisp.shadow.mapSize.set(512, 512)
    wisp.shadow.camera.near = 0.04
    wisp.shadow.camera.far = WISP_LIGHT.range * 2
    wisp.shadow.bias = -0.004

    // The turf, the standing stone, the rocks and the flowers
    mesh(new THREE.CylinderGeometry(TURF.r, TURF.r, TURF.depth, 56).translate(0, -TURF.depth / 2, 0), [lit(bands(['#4a3020', '#2a1c16', '#6e4a2e'], TURF.depth / 0.07)), lit(patches(['#10241c', '#1b3a2a', '#1b3a2a', '#2c5a38'], [5, 5])), lit('#2a1c16')])
    const rough = lit('#ffffff', { vertexColors: true, flatShading: true })
    const stone = lump(2, 0.18)
    // a lump pulled tall and narrowed toward the top, leaning as the stone does
    const sp = stone.attributes.position
    for (let i = 0; i < sp.count; i++) {
      const up = (sp.getY(i) + 1) / 2, r = STONE.r + (STONE.rTo - STONE.r) * up
      sp.setXYZ(i, sp.getX(i) * r + STONE.to[0] * up, up * STONE.to[1], sp.getZ(i) * r + STONE.to[2] * up)
    }
    stone.computeVertexNormals()
    mesh(faced(stone, (n, p) => (n.y > 0.6 ? (rand() < 0.35 ? '#4a8048' : '#8a8898') : ['#5d5c6c', '#3a3a48', '#5d5c6c', '#8a8898'][Math.floor(p.y / 0.11) % 4])), rough)
    for (const r of ROCKS) add(at(new THREE.Mesh(faced(lump(2, 0.22), (n, p) => (n.y > 0.6 ? (rand() < 0.3 ? '#4a8048' : '#8a8898') : Math.floor((p.y * r.r[1]) / 0.06 + 8) % 2 ? '#3a3a48' : '#5d5c6c')), rough), ...r.at)).scale.set(...r.r)
    const stalk = lit('#4a8048')
    for (const w of FLOWERS) {
      mesh(new THREE.CylinderGeometry(0.012, 0.012, w.height, 6).translate(w.at[0], w.height / 2, w.at[1]), stalk)
      mesh(ball([w.at[0], w.height + 0.02, w.at[1]], [0.04, 0.03, 0.04], 6), lit(w.color))
    }

    // The fox: a tree of groups, a meter long in its own frame. Skin first, then the coat stood on it.
    const fox = add(this.fox), body = add(this.body, fox)
    fox.scale.setScalar(FOX_SIZE)
    const coat = lit('#ffffff', { vertexColors: true })
    const red = (n: THREE.Vector3) => (n.y < -0.45 ? K.pale : n.y > 0.7 ? K.deep : K.fur)
    /** A furred part: its skin, and how long and how thick its coat stands. */
    const furred: { skin: THREE.Mesh; length: number; count: number }[] = []
    const part = (g: THREE.BufferGeometry, color: (n: THREE.Vector3, p: THREE.Vector3) => string, to: THREE.Object3D, length = 0, count = 0) => {
      const m = mesh(faced(g, color), coat, to)
      if (count) furred.push({ skin: m, length, count })
      return m
    }
    const B = FOX.body
    part(taper(B.from, B.to, B.r, B.rTo), red, body, 0.055, 1500)
    part(ball(B.chest.at, B.chest.r), (n, p) => (n.z > 0.1 && n.y < 0.35 && Math.abs(p.x) < 0.14 ? K.pale : red(n)), body, 0.08, 800)
    part(ball(B.rump.at, B.rump.r), red, body, 0.055, 500)
    part(taper(FOX.neck.from, FOX.neck.to, FOX.neck.r, FOX.neck.rTo), (n) => (n.z > 0.2 && n.y < 0.2 ? K.pale : red(n)), body, 0.08, 700)
    part(ball(FOX.head.at, FOX.head.r), (n) => (n.y < -0.15 ? K.pale : red(n)), body, 0.02, 300)
    part(taper(FOX.muzzle.from, FOX.muzzle.to, FOX.muzzle.r, FOX.muzzle.rTo), (n) => (n.y < 0.35 ? K.pale : K.fur), body)
    mesh(ball(FOX.nose.at, FOX.nose.r, 6), lit('#141010'), body)
    for (const side of [1, -1]) {
      const mirror = (p: V3): V3 => [p[0] * side, p[1], p[2]]
      part(ball(mirror(FOX.cheek.at), FOX.cheek.r, 8), () => K.pale, body, 0.065, 160)
      // an ear: a cone pressed thin from front to back, dark behind and at the tip
      const ear = taper(FOX.ear.from, FOX.ear.to, FOX.ear.r, 0.014).translate(0, 0, -FOX.ear.from[2]).scale(side, 1, FOX.ear.thin).translate(0, 0, FOX.ear.from[2])
      if (side < 0) ear.index!.array.reverse()
      ear.computeVertexNormals()
      part(ear, (n, p) => (p.y > 1.47 || n.z < -0.25 ? K.dark : n.z > 0.3 ? K.pale : K.fur), body)
      mesh(ball(mirror(FOX.eye.at), FOX.eye.r, 6), glowing({ color: K.eye }), body)
    }
    // legs: a thigh on the body, then a group at the elbow and one at the wrist, which are what turn
    for (const id of LEGS) {
      const k = id[0] === 'f' ? FOX.front : FOX.hind, side = id[1] === 'l' ? 1 : -1
      const mirror = (p: V3): V3 => [p[0] * side, p[1], p[2]]
      const from = (p: V3, o: V3): V3 => [(p[0] - o[0]) * side, p[1] - o[1], p[2] - o[2]]
      const dark = (p: THREE.Vector3, o: V3) => (p.y + o[1] < k.dark ? K.dark : K.fur)
      part(taper(mirror(k.top), mirror(k.elbow), k.r[0], k.r[1]), (n) => red(n), body, 0.04, 200)
      const upper = add(at(new THREE.Group(), ...mirror(k.elbow)), body)
      part(taper([0, 0, 0], from(k.wrist, k.elbow), k.r[1], k.r[2]), (_, p) => dark(p, k.elbow), upper, 0.025, 120)
      const lower = add(at(new THREE.Group(), ...from(k.wrist, k.elbow)), upper)
      part(taper([0, 0, 0], from(k.paw, k.wrist), k.r[2], k.r[3]), (_, p) => dark(p, k.wrist), lower)
      mesh(ball([0, k.paw[1] - k.wrist[1] + 0.015, k.paw[2] - k.wrist[2] + 0.035], [0.05, 0.04, 0.08], 6), lit(K.dark), lower)
      this.legs[id] = { upper, lower }
    }
    // the brush: two tapered halves, each a group that swings, tipped white
    const [t0, t1, t2] = FOX.tail
    const [first, second] = this.tail
    add(at(first, ...t0.at), body).rotation.order = 'YXZ'
    part(taper([0, 0, 0], [t1.at[0] - t0.at[0], t1.at[1] - t0.at[1], t1.at[2] - t0.at[2]], t0.r, t1.r), () => K.fur, first, 0.12, 900)
    add(at(second, t1.at[0] - t0.at[0], t1.at[1] - t0.at[1], t1.at[2] - t0.at[2]), first)
    const end: V3 = [t2.at[0] - t1.at[0], t2.at[1] - t1.at[1], t2.at[2] - t1.at[2]]
    part(new THREE.SphereGeometry(t1.r, 12, 10), () => K.fur, second, 0.13, 500)
    part(taper([0, 0, 0], end, t1.r, t2.r), (_, p) => (p.z < end[2] * 0.72 ? K.pale : K.fur), second, 0.14, 1100)

    // The coat: small cones stood on the skin, leaning back along the body, each part's as one instanced mesh that rides it
    const strand = new THREE.ConeGeometry(0.5, 1, 3, 1, true).translate(0, 0.5, 0)
    const hair = lit('#ffffff')
    const sampler = { p: new THREE.Vector3(), n: new THREE.Vector3(), c: new THREE.Color() }
    const flow = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3()
    for (const f of furred) {
      // the library's types leave its seeded generator out
      const found = (new MeshSurfaceSampler(f.skin) as MeshSurfaceSampler & { setRandomGenerator(next: () => number): MeshSurfaceSampler }).setRandomGenerator(rand).build()
      const fur = add(new THREE.InstancedMesh(strand, hair, f.count), f.skin.parent!)
      for (let i = 0; i < f.count; i++) {
        found.sample(sampler.p, sampler.n, sampler.c)
        // out from the skin a little and back along the fox, with some stray
        flow.set((rand() - 0.5) * 0.5, -0.25 + (rand() - 0.5) * 0.4, -1).normalize().multiplyScalar(0.72).addScaledVector(sampler.n, 0.45).normalize()
        const length = f.length * (0.7 + 0.6 * rand())
        m4.compose(sampler.p, q.setFromUnitVectors(UP, flow), s.set(0.016, length, 0.016))
        fur.setMatrixAt(i, m4)
        fur.setColorAt(i, sampler.c.multiplyScalar(0.82 + 0.3 * rand()))
      }
    }

    // The grass: one blade, drawn once for each square of a grid that has any
    const blade = bladeShape()
    const grid = GRASS.grid, half = Math.ceil(1.7 / grid)
    for (let j = -half; j < half; j++) for (let i = -half; i < half; i++) {
      const x = (i + 0.15 + 0.7 * rand()) * grid, z = (j + 0.15 + 0.7 * rand()) * grid
      const tall = bladeHeight(rand(), rand()) * grown(x, z)
      if (tall < 0.012) continue
      this.blades.push({ x, z, tall, wide: 0.022 + 0.014 * rand(), yaw: rand() * Math.PI * 2, lean: 0.4 + 1.2 * rand() })
    }
    const grass = this.grass = add(new THREE.InstancedMesh(blade, lit('#ffffff', { vertexColors: true, side: THREE.DoubleSide }), this.blades.length))
    grass.frustumCulled = false
    const green = GRASS.colors.map((h) => new THREE.Color(h)), tone = new THREE.Color()
    this.blades.forEach((_, i) => { const k = rand(); grass.setColorAt(i, tone.copy(green[2]).lerp(green[3], k).multiplyScalar(1.35)) })

    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const glows = (Array.isArray(m.material) ? m.material[0] : m.material) instanceof THREE.MeshBasicMaterial
      m.castShadow = m.receiveShadow = !glows
      const g = m.geometry
      this.triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * ((m as THREE.InstancedMesh).count ?? 1)
    })

    // The wisp, its motes, the stars and the moon: one ball drawn many times
    const dot = new THREE.SphereGeometry(1, 8, 6)
    this.specks = add(new THREE.InstancedMesh(dot, glowing({}), LIGHTS.length + STARS.length + 1))
    this.specks.frustumCulled = false
  }

  /** Draws the scene `t` seconds in, `width` by `height`, and gives its pixels: RGBA, bottom row first. */
  draw(t: number, orbit: Orbit, width: number, height: number, gain: number, fov: number): Uint8Array {
    const { renderer, canvas } = this
    if (canvas.width !== width || canvas.height !== height) { renderer.setSize(width, height, false); this.pixels = new Uint8Array(width * height * 4) }
    const u = t / LOOP
    this.camera.fov = fov
    placeCamera(this.camera, orbit, width / height)
    this.fog.near = orbit.distance + HAZE.from
    this.fog.far = orbit.distance + HAZE.to

    // the fox on its ring, and its joints
    const where = foxAt(u), g = trot(u)
    this.fox.position.set(...where.at)
    this.fox.rotation.y = where.turn
    this.body.position.y = g.bob
    for (const id of LEGS) { this.legs[id].upper.rotation.x = g.legs[id].upper; this.legs[id].lower.rotation.x = g.legs[id].lower }
    this.tail[0].rotation.set(g.tail.droop, g.tail.first, 0)
    this.tail[1].rotation.y = g.tail.second

    // the wisp, and everything else that glows
    const m = new THREE.Matrix4(), c = new THREE.Color()
    const lights = [...LIGHTS.map((l) => ({ at: wispAt(u, l.behind), r: l.r, color: l.color })), ...STARS.map((s, i) => ({ at: s, r: 0.024, color: i % 3 ? '#f4f1e4' : '#c2c0cc' })), MOON]
    this.wisp.position.set(...lights[0].at)
    this.wisp.intensity = WISP_LIGHT.strength * 0.5 * gain
    lights.forEach((s, i) => {
      m.makeScale(s.r, s.r, s.r).setPosition(...s.at)
      this.specks.setMatrixAt(i, m)
      this.specks.setColorAt(i, c.set(s.color))
    })
    this.specks.instanceMatrix.needsUpdate = true
    if (this.specks.instanceColor) this.specks.instanceColor.needsUpdate = true

    // the wind: each blade's tip pushed over, as a wave across the meadow
    const wind = Math.PI * 2 * GRASS.times * u, e = m.elements
    this.blades.forEach((b, i) => {
      const blow = wind - Math.PI * 2 * (b.x * 0.9 + b.z * 0.5), sin = Math.sin(b.yaw), cos = Math.cos(b.yaw)
      // across the blade, up it (leaning with the wind), and the way it bends
      e[0] = cos * b.wide; e[1] = 0; e[2] = -sin * b.wide; e[3] = 0
      e[4] = GRASS.sway * Math.sin(blow); e[5] = b.tall; e[6] = GRASS.sway * 0.45 * Math.sin(blow + 1.1); e[7] = 0
      e[8] = sin * b.tall * b.lean; e[9] = 0; e[10] = cos * b.tall * b.lean; e[11] = 0
      e[12] = b.x; e[13] = 0; e[14] = b.z; e[15] = 1
      this.grass.setMatrixAt(i, m)
    })
    this.grass.instanceMatrix.needsUpdate = true

    renderer.render(this.scene, this.camera)
    const gl = renderer.getContext()
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels)
    return this.pixels
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      for (const k of Array.isArray(m.material) ? m.material : [m.material]) { (k as THREE.MeshLambertMaterial).map?.dispose(); k.dispose() }
    })
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
