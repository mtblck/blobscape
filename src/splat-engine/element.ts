/**
 * `<blobscape-creature>`: a rigged-splat .glb playing on any web page, from one script tag and one element.
 *
 *   <script type="module" src="blobscape-creature.js"></script>
 *   <blobscape-creature src="fox.glb" move="trot" alt="A fox trotting"></blobscape-creature>
 *
 * Attributes: `src` (the file), `move` (the clip to play; the file's first when left out), `hover` and `tap` (a
 * clip to play while a mouse is over it, and once when it is tapped or Enter is pressed), `look="pointer"` (its
 * head turns after the pointer), `orbit="none"` (no turning by drag or arrow keys), `azimuth` and `elevation`
 * (where it is seen from, in degrees), `speed`, `poster` (a still picture shown until it draws, and instead of it
 * where the browser has no WebGPU or WebGL 2), `alt` (what it is, for people who can't see it) and
 * `backend="webgl"` (skip WebGPU). Children are shown in its place if it can't draw and has no poster (and by a
 * browser that never ran the script).
 *
 * It starts when it nears the screen, stops drawing when it leaves, and holds still for visitors who ask for
 * reduced motion. `ready` and `error` events say how loading went; `stage` is the engine's `Stage` for anything more.
 * A creature should face +z, as ours do, for `look` to turn the right way.
 */
import type { Blobs } from '../splat-core/blobs.ts'
import { readRiggedGlb, sampleClip, type Clip } from './glb.ts'
import { lookAt } from './ik.ts'
import { blendPose, putPose, takePose } from './mix.ts'
import type { Skeleton } from './rig.ts'
import { Stage } from './stage.ts'
import { CREATURE_TAG, FADE, clipNamed, fitOrbit, headBone } from './embed.ts'

/** The most a head turns to look, in radians, and how much of the way it goes. */
const LOOK_LIMIT = 0.7, LOOK_AMOUNT = 0.8
/** How quickly the look follows the pointer (per second). */
const LOOK_EASE = 7
/** Degrees turned per pixel dragged, and per arrow key. */
const DRAG = 0.5, KEY = 8
/** A press that moves less than this many pixels is a tap. */
const TAP_SLOP = 6

const STYLE = `
:host { display: block; position: relative; aspect-ratio: 1; max-width: 100%; overflow: hidden; contain: content; }
:host([hidden]) { display: none; }
canvas, img, .fallback { position: absolute; inset: 0; width: 100%; height: 100%; }
canvas { display: block; outline: none; touch-action: pan-y; opacity: 0; }
canvas.drag { cursor: grab; }
canvas.drag:active { cursor: grabbing; }
canvas:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
:host([status=ready]) canvas { opacity: 1; }
img { object-fit: contain; pointer-events: none; }
:host([status=ready]) img, :host([status=ready]) .fallback { display: none; }
.fallback { display: none; place-items: center; text-align: center; }
:host([status=failed]) .fallback { display: grid; }
:host([status=failed][poster]) .fallback { display: none; }
:host([status=failed]) canvas { display: none; }
`

// in Node (tests, a server render) there is no HTMLElement; the class is only defined in a browser
const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement

/** The `<blobscape-creature>` element. Importing this module defines it. */
export class BlobscapeCreature extends Base {
  static observedAttributes = ['src', 'move', 'speed', 'azimuth', 'elevation', 'orbit', 'tap', 'alt', 'poster', 'look']

  /** The engine's stage, once the creature is drawing. */
  stage?: Stage
  /** The names of the file's moves, once it has loaded. */
  moves: string[] = []
  /** The name of the move playing now. */
  get currentMove(): string | undefined { return this.playing?.name }

  private canvas?: HTMLCanvasElement
  private img?: HTMLImageElement
  private clips: Clip[] = []
  private blobs?: Blobs
  private load = 0
  private seen = false
  private near?: IntersectionObserver
  private sized?: ResizeObserver
  private calm?: MediaQueryList
  private off: (() => void)[] = []
  private azimuth = 30
  private elevation = 10
  /** The move blending out: the clip, and the time it had reached. */
  private fade?: { clip: Clip; at: number }
  /** A move played once (a tap): when it ends, the standing move comes back. */
  private once?: Clip
  /** The clip the stage is playing. */
  private playing?: Clip
  private hovering = false
  private gaze = 0
  private gazeWant = 0
  private eye?: [number, number, number]
  private eyeWant?: [number, number, number]
  private lookedAt = NaN

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' })
      const style = document.createElement('style')
      style.textContent = STYLE
      const canvas = this.canvas = document.createElement('canvas')
      const img = this.img = document.createElement('img')
      img.alt = ''
      img.hidden = true
      const fallback = document.createElement('div')
      fallback.className = 'fallback'
      fallback.append(document.createElement('slot'))
      root.append(style, canvas, img, fallback)
      this.listen(canvas)
    }
    this.describe()
    this.setAttribute('status', 'waiting')
    this.calm = matchMedia('(prefers-reduced-motion: reduce)')
    const calmed = () => this.settle()
    this.calm.addEventListener('change', calmed)
    const moved = (ev: PointerEvent) => this.follow(ev)
    window.addEventListener('pointermove', moved, { passive: true })
    this.off = [() => this.calm?.removeEventListener('change', calmed), () => window.removeEventListener('pointermove', moved)]
    // nothing is fetched or started until it nears the screen
    this.near = new IntersectionObserver((entries) => {
      const on = entries[entries.length - 1].isIntersecting
      if (on && !this.seen && !this.stage) this.start()
      this.seen = on
      this.settle()
    }, { rootMargin: '200px' })
    this.near.observe(this)
    this.sized = new ResizeObserver(() => this.frame())
    this.sized.observe(this)
  }

  disconnectedCallback() {
    this.load++
    this.near?.disconnect()
    this.sized?.disconnect()
    for (const f of this.off) f()
    this.off = []
    this.stage?.dispose()
    this.stage = undefined
    this.seen = false
    // a canvas that has handed out a context can't start another renderer: the next start gets a new one
    if (this.canvas && this.shadowRoot) {
      const fresh = document.createElement('canvas')
      this.canvas.replaceWith(fresh)
      this.canvas = fresh
      this.listen(fresh)
    }
  }

  attributeChangedCallback(name: string, was: string | null, now: string | null) {
    if (was === now || !this.shadowRoot) return
    if (name === 'src') { if (this.seen || this.stage) this.start() }
    else if (name === 'move') this.refresh()
    else if (name === 'azimuth' || name === 'elevation') this.frame(true)
    else if (name === 'speed') this.settle()
    else this.describe()
  }

  private get still() { return !!this.calm?.matches }
  private get turns() { return this.getAttribute('orbit') !== 'none' }

  /** What the view says it is, and whether it takes the keyboard. */
  private describe() {
    const { canvas, img } = this
    if (!canvas || !img) return
    const alt = this.getAttribute('alt')?.trim() || 'A 3D creature'
    const acts = this.turns || this.hasAttribute('tap')
    canvas.setAttribute('role', acts ? 'application' : 'img')
    if (acts) canvas.setAttribute('aria-roledescription', '3D view'); else canvas.removeAttribute('aria-roledescription')
    const how = [this.turns ? 'Drag or use the arrow keys to turn it' : '', this.hasAttribute('tap') ? 'press Enter to make it move' : ''].filter(Boolean).join('; ')
    canvas.setAttribute('aria-label', how ? `${alt}. ${how[0].toUpperCase()}${how.slice(1)}.` : alt)
    if (acts) canvas.tabIndex = 0; else canvas.removeAttribute('tabindex')
    canvas.classList.toggle('drag', this.turns)
    const poster = this.getAttribute('poster')
    if (poster) { if (img.getAttribute('src') !== poster) img.src = poster; img.alt = this.stage ? '' : alt }
    img.hidden = !poster
  }

  /** Fetches the file and starts the engine on it. */
  private async start() {
    const src = this.getAttribute('src')
    const run = ++this.load
    if (!src || !this.canvas) return
    this.setAttribute('status', 'loading')
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`${src}: ${res.status}`)
      const rigged = readRiggedGlb(new Uint8Array(await res.arrayBuffer()))
      if (run !== this.load) return
      const stage = this.stage ?? await Stage.start(this.canvas, { webgl: this.getAttribute('backend') === 'webgl', offscreen: this.hasAttribute('offscreen') })
      if (run !== this.load) { if (stage !== this.stage) stage.dispose(); return }
      this.stage = stage
      this.clips = rigged.clips
      this.moves = rigged.clips.map((c) => c.name)
      this.blobs = rigged.blobs
      const clip = clipNamed(rigged.clips, this.getAttribute('move'))
      this.fade = this.once = undefined
      this.playing = clip
      this.gaze = 0
      stage.setFloor(0)
      stage.onFirstFrame = () => { if (run === this.load) { this.setAttribute('status', 'ready'); this.describe() } }
      if (this.getAttribute('move') && clip?.name.toLowerCase() !== this.getAttribute('move')!.trim().toLowerCase()) {
        console.warn(`<${CREATURE_TAG}>: no move called "${this.getAttribute('move')}" in ${src}; it has ${this.moves.join(', ') || 'none'}`)
      }
      stage.setActor({ blobs: rigged.blobs, skin: rigged.skin, skeleton: rigged.skeleton, morphs: rigged.morphs }, clip)
      const head = headBone(rigged.skeleton.bones.map((b) => b.name))
      stage.setAfter((sk, t) => this.posed(sk, t, head))
      this.frame(true)
      this.settle()
      this.dispatchEvent(new CustomEvent('ready', { detail: { moves: this.moves, blobs: rigged.blobs.count, backend: stage.backend } }))
    } catch (error) {
      if (run !== this.load) return
      this.setAttribute('status', 'failed')
      this.describe()
      this.dispatchEvent(new CustomEvent('error', { detail: { error } }))
    }
  }

  /** Whether time runs: only on screen, and not for a visitor who asked for less motion. */
  private settle() {
    const { stage } = this
    if (!stage) return
    const speed = Number(this.getAttribute('speed') ?? 1)
    stage.speed = Number.isFinite(speed) && speed > 0 ? speed : 1
    stage.playing = this.seen && !this.still
    if (this.still) { this.fade = this.once = undefined; this.gaze = this.gazeWant = 0; this.refresh() }
    stage.invalidate()
  }

  /** Sets the view from the attributes and the element's shape; `turn` also takes the angles from the attributes. */
  private frame(turn = false) {
    const { stage, blobs } = this
    if (!stage || !blobs) return
    const num = (name: string, d: number) => { const v = Number(this.getAttribute(name) ?? d); return Number.isFinite(v) ? v : d }
    if (turn) { this.azimuth = num('azimuth', 30); this.elevation = Math.max(-89, Math.min(89, num('elevation', 10))) }
    const w = this.clientWidth, h = this.clientHeight
    stage.orbit = fitOrbit(blobs, w && h ? w / h : 1, this.azimuth, this.elevation)
    stage.invalidate()
  }

  /** The move to show now: one being played once, else the hover move while a mouse is over it, else the standing one. */
  private refresh() {
    const { stage } = this
    const clip = this.once ?? this.hoverClip ?? clipNamed(this.clips, this.getAttribute('move'))
    if (!stage || !clip || clip === this.playing) return
    if (this.playing && !this.still) this.fade = { clip: this.playing, at: stage.time }
    this.playing = clip
    stage.setClip(clip, 0)
  }

  /** Runs on top of each pose: the blend out of the last move, the end of a move played once, and the look. */
  private posed(sk: Skeleton, t: number, head?: string) {
    const { fade, once } = this
    if (fade) {
      const k = t / FADE
      if (k >= 1 || k < 0) this.fade = undefined
      else {
        const now = takePose(sk)
        sampleClip(fade.clip, sk, fade.at + t)
        const old = takePose(sk)
        putPose(sk, now)
        blendPose(sk, old, k * k * (3 - 2 * k))
        sk.update()
      }
    }
    if (once && t >= once.times[once.times.length - 1]) {
      // changing the clip poses again, so it waits until this pose is done
      queueMicrotask(() => { if (this.once === once) { this.once = undefined; this.refresh() } })
    }
    const dt = Number.isFinite(this.lookedAt) ? Math.min(0.1, Math.max(0, t - this.lookedAt)) : 0
    this.lookedAt = t
    const e = 1 - Math.exp(-dt * LOOK_EASE)
    this.gaze += (this.gazeWant - this.gaze) * e
    if (this.eyeWant) {
      this.eye ??= [...this.eyeWant]
      for (let k = 0; k < 3; k++) this.eye[k] += (this.eyeWant[k] - this.eye[k]) * e
    }
    if (head && this.eye && this.gaze > 0.002) lookAt(sk, head, this.eye, { amount: this.gaze * LOOK_AMOUNT, limit: LOOK_LIMIT })
  }

  private get hoverClip() {
    const name = this.hovering ? this.getAttribute('hover') : null
    const clip = name ? clipNamed(this.clips, name) : undefined
    return clip && clip.name.toLowerCase() === name!.trim().toLowerCase() ? clip : undefined
  }

  /** The pointer, anywhere on the page: where the head turns to, a little in front of the creature. */
  private follow(ev: PointerEvent) {
    const { stage, canvas } = this
    if (!stage || !canvas || !this.seen || this.still || this.getAttribute('look') !== 'pointer') { this.gazeWant = 0; return }
    const box = canvas.getBoundingClientRect()
    const ray = stage.rayAt(ev.clientX - box.left, ev.clientY - box.top)
    if (!ray) return
    const d = stage.orbit.distance * 0.75
    this.eyeWant = [ray.origin[0] + ray.direction[0] * d, ray.origin[1] + ray.direction[1] * d, ray.origin[2] + ray.direction[2] * d]
    this.gazeWant = 1
  }

  /** Drag and arrow keys turn it; a tap or Enter plays the `tap` move; a mouse over it plays the `hover` move. */
  private listen(canvas: HTMLCanvasElement) {
    let drag: { id: number; x: number; y: number; azimuth: number; elevation: number; far: number; touch: boolean } | undefined
    canvas.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, azimuth: this.azimuth, elevation: this.elevation, far: 0, touch: ev.pointerType === 'touch' }
      if (this.turns) canvas.setPointerCapture(ev.pointerId)
    })
    canvas.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y
      drag.far = Math.max(drag.far, Math.hypot(dx, dy))
      if (!this.turns) return
      this.azimuth = drag.azimuth - dx * DRAG
      // a finger's up and down scrolls the page, so it only turns the creature round
      if (!drag.touch) this.elevation = Math.max(-89, Math.min(89, drag.elevation + dy * DRAG * 0.8))
      this.frame()
    })
    canvas.addEventListener('pointerup', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return
      const tap = drag.far < TAP_SLOP
      drag = undefined
      if (tap) this.tapped()
    })
    canvas.addEventListener('pointercancel', () => { drag = undefined })
    canvas.addEventListener('pointerenter', (ev) => {
      if (ev.pointerType !== 'mouse' || this.still) return
      this.hovering = true
      this.refresh()
    })
    canvas.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType !== 'mouse' || !this.hovering) return
      this.hovering = false
      this.refresh()
    })
    canvas.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && this.hasAttribute('tap')) { ev.preventDefault(); this.tapped(); return }
      if (!this.turns) return
      const step = ev.shiftKey ? KEY * 2 : KEY
      if (ev.key === 'ArrowLeft') this.azimuth -= step
      else if (ev.key === 'ArrowRight') this.azimuth += step
      else if (ev.key === 'ArrowUp') this.elevation = Math.min(89, this.elevation + step)
      else if (ev.key === 'ArrowDown') this.elevation = Math.max(-89, this.elevation - step)
      else return
      ev.preventDefault()
      this.frame()
    })
  }

  private tapped() {
    const name = this.getAttribute('tap')
    const clip = name ? clipNamed(this.clips, name) : undefined
    if (!clip || this.still || clip.name.toLowerCase() !== name!.trim().toLowerCase()) return
    // tapped again mid-move, it starts over
    this.once = clip
    if (this.playing === clip) this.stage?.setClip(clip, 0)
    else this.refresh()
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(CREATURE_TAG)) customElements.define(CREATURE_TAG, BlobscapeCreature)

declare global {
  interface HTMLElementTagNameMap { 'blobscape-creature': BlobscapeCreature }
}
