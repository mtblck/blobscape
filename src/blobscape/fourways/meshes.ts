import * as THREE from 'three'
import { placeCamera, type Orbit } from '../../splat-core/orbit.ts'
import { BUSHES, FIRE, FIRE_LIGHT, HAZE, LANTERN_LIGHT, LOGS, LOOP, MOONLIGHT, MUSHROOMS, PINES, ROCKS, SPECKS, STONES, flames, flicker, pineLean, rgb, specks, tiers, trunkRadius, type V3 } from './layout.ts'

/**
 * The campfire in three.js, the way it is usually built there: meshes from the library's own shapes (cylinders,
 * boxes, cones, a few bumpy icosahedrons), small repeating textures for the patterns, Lambert materials, the moon as
 * a directional light and the fire as a point light, both casting shadow maps. Things that move are groups turned and
 * scaled each frame; the sparks, embers and fireflies are one instanced mesh.
 *
 * It gives the scene drawn small with clear pixels where there is nothing; the page finishes it as pixel art.
 */

/** A run of numbers from 0 up to 1 that is the same every time. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const rand = seeded(3)

/** A small texture of palette colors with hard edges, tiled over a surface: `pick` says which color each texel takes. */
function texture(colors: string[], width: number, height: number, pick: (x: number, y: number) => number, repeat: [number, number]) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const k = rgb(colors[Math.min(colors.length - 1, Math.max(0, Math.floor(pick(x, y))))])
    data.set([k[0] * 255, k[1] * 255, k[2] * 255, 255], (y * width + x) * 4)
  }
  const t = new THREE.DataTexture(data, width, height)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.needsUpdate = true
  return t
}
/** Specks: mostly the first color. */
const speckle = (colors: string[], repeat: [number, number]) => texture(colors, 16, 16, () => rand() ** 2 * colors.length, repeat)
/** Patches a few texels across. */
const patches = (colors: string[], repeat: [number, number]) => {
  const coarse = Array.from({ length: 16 }, () => rand() * colors.length)
  return texture(colors, 8, 8, (x, y) => coarse[(y >> 1) * 4 + (x >> 1)], repeat)
}
/** Stripes along a surface (`across`) or up it. */
const bands = (colors: string[], count: number, across = false) => texture(colors, across ? colors.length : 1, across ? 1 : colors.length, (x, y) => (across ? x : y), across ? [count / colors.length, 1] : [1, count / colors.length])

const lit = (from: string | THREE.Texture, more: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial(typeof from === 'string' ? { color: from, ...more } : { map: from, ...more })
/** Something that gives its own light: drawn in its color whatever the lights do. */
const glowing = (more: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, ...more })

/** Colors a mesh's corners by which way they face (up, down or sideways) and how high they are. */
function faced(g: THREE.BufferGeometry, color: (n: THREE.Vector3, p: THREE.Vector3) => string) {
  const n = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), out = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < g.attributes.position.count; i++) {
    n.fromBufferAttribute(g.attributes.normal, i)
    p.fromBufferAttribute(g.attributes.position, i)
    c.set(color(n, p))
    out.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3))
  return g
}

/** A bumpy lump: an icosahedron with every corner pushed in or out a little, faces left flat. */
function lump(detail: number, bump: number) {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const p = g.attributes.position, v = new THREE.Vector3(), moved = new Map<string, number>()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // corners shared by several faces must move together
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`
    if (!moved.has(key)) moved.set(key, 1 + (rand() - 0.5) * bump)
    v.multiplyScalar(moved.get(key)!)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** A straight round bar from a to b. */
function bar(a: V3, b: V3, r: number, material: THREE.Material | THREE.Material[], rounded = true) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), length = from.distanceTo(to)
  const m = new THREE.Mesh(rounded ? new THREE.CapsuleGeometry(r, length, 3, 10) : new THREE.CylinderGeometry(r, r, length, 14), material)
  m.position.copy(from).add(to).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize())
  return m
}

const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o }

export class MeshPanel {
  readonly name = 'meshes'
  private canvas = document.createElement('canvas')
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
  private pixels = new Uint8Array(0)
  private pines: THREE.Group[] = []
  private flame = new THREE.Group()
  private core = new THREE.Group()
  private fire: THREE.PointLight
  private specks: THREE.InstancedMesh
  private fog = new THREE.Fog(HAZE.color, 1, 10)
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

    // The light. Lambert divides by π, and the baked light the other panels use works on display values, so a face
    // in full moonlight is 0.9 of its color and one in shade 0.45 of it: here those are set in linear light.
    const shade = (MOONLIGHT.ambient * 0.9) ** 2.2, full = 0.9 ** 2.2
    add(new THREE.AmbientLight(new THREE.Color(0.84, 0.9, 1.14), shade * Math.PI))
    const moon = add(new THREE.DirectionalLight(new THREE.Color(1.03, 1, 0.95), (full - shade) * Math.PI))
    moon.position.set(...MOONLIGHT.from).multiplyScalar(5)
    moon.castShadow = true
    moon.shadow.mapSize.set(1024, 1024)
    Object.assign(moon.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 0.5, far: 12 })
    moon.shadow.bias = -0.0015
    moon.shadow.normalBias = 0.01
    moon.shadow.intensity = MOONLIGHT.shadow
    const fire = this.fire = add(new THREE.PointLight(FIRE_LIGHT.color, 1, FIRE_LIGHT.range * 2, 1.4))
    fire.position.set(...FIRE_LIGHT.at)
    fire.castShadow = true
    fire.shadow.mapSize.set(512, 512)
    fire.shadow.camera.near = 0.04
    fire.shadow.camera.far = FIRE_LIGHT.range * 2
    fire.shadow.bias = -0.004
    const lantern = add(new THREE.PointLight(LANTERN_LIGHT.color, LANTERN_LIGHT.strength * 0.5, LANTERN_LIGHT.range * 2, 1.4))
    lantern.position.set(...LANTERN_LIGHT.at)

    // The ground: a disc of earth with grass on top, and the bare patch the fire sits in
    const greens = ['#1b3a2a', '#2c5a38', '#2c5a38', '#4a8048']
    add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.3, 56), [lit(bands(['#4a3020', '#2a1c16', '#6e4a2e'], 0.3 / 0.07)), lit(patches(greens, [5, 5])), lit('#2a1c16')]), 0, -0.15, 0))
    add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.055, 32), lit(speckle(['#6e4a2e', '#4a3020', '#9a6d43'], [3, 3]))), FIRE[0], -0.0025, FIRE[2]))

    // The fire: a ring of stones, three logs, two flames that turn and swell about the fire's foot
    const stone = lit('#ffffff', { vertexColors: true, flatShading: true })
    for (const s of STONES) add(at(new THREE.Mesh(faced(lump(1, 0.25), (n) => (n.y > 0.6 ? '#8a8898' : n.y < -0.6 ? '#3a3a48' : '#5d5c6c')), stone), ...s.at)).scale.setScalar(s.r)
    const bark = lit(speckle(['#4a3020', '#2a1c16', '#d9541e'], [2, 4]))
    for (const [a, b] of LOGS) add(bar(a, b, 0.032, bark))
    const tongue = (from: V3, to: V3, r: number, low: string, high: string, split: number) => {
      const height = to[1] - from[1]
      const g = faced(new THREE.CylinderGeometry(0.01, r, height, 12, 8), (_, p) => (p.y + from[1] + height / 2 < split ? low : high))
      const m = new THREE.Mesh(g, glowing({ vertexColors: true }))
      m.position.set((from[0] + to[0]) / 2 - FIRE[0], from[1] + height / 2 - FIRE[1], (from[2] + to[2]) / 2 - FIRE[2])
      const foot = at(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), glowing({ color: low })), from[0] - FIRE[0], from[1] - FIRE[1], from[2] - FIRE[2])
      return [m, foot]
    }
    add(at(this.flame, ...FIRE)).add(...tongue([0.1, 0.1, 0.25], [0.1, 0.5, 0.25], 0.11, '#f59a2a', '#d9541e', 0.27))
    add(at(this.core, ...FIRE)).add(...tongue([0.1, 0.09, 0.28], [0.12, 0.32, 0.28], 0.065, '#fff3b0', '#ffd166', 0.2))

    // The tent: two sloped sheets and a back wall, striped outside and dark inside, with a mat, a pole and a pack
    const tent = new THREE.BufferGeometry()
    const [x0, x1, z, half, top] = [-1.22, -0.38, -0.15, 0.36, 0.52]
    tent.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, 0, z + half, x1, 0, z + half, x1, top, z, x0, 0, z + half, x1, top, z, x0, top, z,
      x1, 0, z - half, x0, 0, z - half, x0, top, z, x1, 0, z - half, x0, top, z, x1, top, z,
      x0, 0, z - half, x0, 0, z + half, x0, top, z,
    ], 3))
    tent.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1], 2))
    tent.computeVertexNormals()
    add(new THREE.Mesh(tent, lit(bands(['#b9485a', '#7b2f45'], 6, true))))
    add(new THREE.Mesh(tent, lit('#141c36', { side: THREE.BackSide })))
    add(at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.024, 0.4), lit('#2f477d')), -1.0, 0.012, -0.15))
    add(bar([-0.36, 0, -0.15], [-0.36, 0.56, -0.15], 0.015, lit('#9a6d43'), false))
    add(at(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.12), lit('#2f477d')), -0.38, 0.065, 0.42))
    add(at(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.12), lit('#4a6fae')), -0.38, 0.165, 0.42))
    add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), lit('#c79a63')), -0.38, 0.07, 0.49))

    // A log to sit on, with cut ends, and the lantern on its post
    add(bar([0.53, 0.075, 0.79], [1.04, 0.075, 0.54], 0.075, [lit(bands(['#6e4a2e', '#4a3020'], 5, true)), lit('#c79a63'), lit('#c79a63')], false))
    add(bar([-0.3, 0, -0.55], [-0.3, 0.42, -0.55], 0.016, lit('#4a3020'), false))
    add(at(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), glowing({ color: '#ffd166' })), -0.3, 0.47, -0.55))
    add(at(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.09), lit('#3a3a48')), -0.3, 0.53, -0.55))

    // Pines: a trunk and four tiers, each a group that leans about its foot
    const needles = [lit(speckle(['#2c5a38', '#2c5a38', '#4a8048'], [6, 2])), lit('#2c5a38'), lit('#10241c')]
    const wood = lit(bands(['#4a3020', '#2a1c16'], 8))
    for (const p of PINES) {
      const tree = add(at(new THREE.Group(), p.at[0], 0, p.at[1]))
      add(at(new THREE.Mesh(new THREE.CylinderGeometry(trunkRadius(p.trunk), trunkRadius(p.trunk), p.trunk, 8), wood), 0, p.trunk / 2, 0), tree)
      for (const k of tiers(p.trunk)) add(at(new THREE.Mesh(new THREE.CylinderGeometry(k.top, k.r, k.height, 12), needles), 0, k.y + k.height / 2, 0), tree)
      this.pines.push(tree)
    }

    // Rocks, bushes and mushrooms
    const rough = lit('#ffffff', { vertexColors: true, flatShading: true })
    for (const r of ROCKS) add(at(new THREE.Mesh(faced(lump(2, 0.22), (n, p) => (n.y > 0.6 ? (rand() < 0.3 ? '#4a8048' : '#8a8898') : Math.floor((p.y * r.r[1]) / 0.06 + 8) % 2 ? '#3a3a48' : '#5d5c6c')), rough), ...r.at)).scale.set(...r.r)
    for (const b of BUSHES) add(at(new THREE.Mesh(faced(lump(1, 0.3), (n) => (n.y > 0.45 ? ['#4a8048', '#4a8048', '#2c5a38', '#79a85a'][Math.floor(rand() * 4)] : '#1b3a2a')), rough), ...b.at)).scale.set(b.r, b.r * 0.8, b.r)
    const stem = lit('#e8dcc0'), cap = lit('#b9485a')
    for (const [x, zz] of MUSHROOMS) {
      add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 6), stem), x, 0.025, zz))
      add(at(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), cap), x, 0.06, zz)).scale.set(0.04, 0.026, 0.04)
    }

    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const glows = (Array.isArray(m.material) ? m.material[0] : m.material) instanceof THREE.MeshBasicMaterial
      m.castShadow = m.receiveShadow = !glows
      const g = m.geometry
      this.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
    })

    // Sparks, embers, fireflies, the stars and the moon: one mesh drawn many times
    const dot = new THREE.SphereGeometry(1, 8, 6)
    this.specks = add(new THREE.InstancedMesh(dot, glowing({}), SPECKS))
    this.specks.frustumCulled = false
    this.triangles += (dot.index!.count / 3) * SPECKS
  }

  /** Draws the scene `t` seconds in, `width` by `height`, and gives its pixels: RGBA, bottom row first. */
  draw(t: number, orbit: Orbit, width: number, height: number, fire: number, fov: number): Uint8Array {
    const { renderer, canvas } = this
    if (canvas.width !== width || canvas.height !== height) { renderer.setSize(width, height, false); this.pixels = new Uint8Array(width * height * 4) }
    const u = t / LOOP
    this.camera.fov = fov
    placeCamera(this.camera, orbit, width / height)
    this.fog.near = orbit.distance + HAZE.from
    this.fog.far = orbit.distance + HAZE.to

    this.pines.forEach((p, i) => { p.rotation.z = pineLean(i, u) })
    const f = flames(u)
    this.flame.scale.setScalar(f.flame.size)
    this.flame.rotation.z = f.flame.lean
    this.core.scale.setScalar(f.core.size)
    this.core.rotation.x = f.core.lean
    this.fire.intensity = FIRE_LIGHT.strength * 0.5 * fire * flicker(u)
    const m = new THREE.Matrix4(), c = new THREE.Color()
    specks(u).forEach((s, i) => {
      m.makeScale(s.r, s.r, s.r).setPosition(...s.at)
      this.specks.setMatrixAt(i, m)
      this.specks.setColorAt(i, c.set(s.color))
    })
    this.specks.instanceMatrix.needsUpdate = true
    if (this.specks.instanceColor) this.specks.instanceColor.needsUpdate = true

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
