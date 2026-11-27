/**
 * Draws what a Blobscape stage has on show through Ink Studio's own WebGL renderer, with an Ink look laid on: the
 * browser half of the translation layer (translate.ts is the pure half). Ink Studio is loaded from the dev server's
 * `/ink-studio/` (scripts/ink-studio-dev.ts), never bundled: its modules are imported by address at run time.
 */
import { Blobs } from '../../splat-core/blobs.ts'
import { STAGE_FOV } from '../../splat-core/orbit.ts'
import type { Rgb } from '../../splat-core/pixel.ts'
import { poseBlobs } from '../../splat-engine/pose.ts'
import type { Actor, CreatureStage } from '../../splat-engine/stage.ts'
import { inkCamera, inkCloud, inkFit, inkPalette, type InkFit, type InkLook } from './translate.ts'

/* Ink Studio has no types; these are the few parts used, as its docs give them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
interface InkModule {
  createRenderer(canvas: HTMLCanvasElement, opts: { toolkit: Any; resolve?: 'auto' | 'simple' }): { render(world: Any, frame: Record<string, unknown>): unknown; dispose(): void }
  gaussianSplatWorld(cloud: Any, opts: { size: number; colorMode?: string; palette?: number[] }): Any
}

declare global {
  interface Window {
    /** Ink Studio's toolkit (`KIT`, `PixelLook`), set by the page after its browser bundle loads. */
    __inkToolkit?: { KIT: Any; PixelLook: Any }
  }
}

/** Where the dev server serves Ink Studio from. */
export const INK_BASE = '/ink-studio/'

/** Loads Ink Studio's renderer module, or says why not. */
export async function loadInk(): Promise<{ ink: InkModule; toolkit: { KIT: Any; PixelLook: Any } }> {
  const status = await fetch(`${INK_BASE}status.json`).then((r) => r.ok ? r.json() : undefined).catch(() => undefined) as { dir: string | null; built: boolean; renderer: boolean } | undefined
  if (!status) throw new Error('The dev server has no Ink Studio route: run this page with `npm run dev`.')
  if (!status.dir) throw new Error('Set INK_STUDIO_DIR to a clone of Ink Studio and restart `npm run dev`.')
  if (!status.renderer) throw new Error(`${status.dir} holds no webgl.mjs: is it Ink Studio?`)
  if (!status.built) throw new Error(`Build Ink Studio first: cd ${status.dir} && npm install && npm run build`)
  if (!window.__inkToolkit) throw new Error('Ink Studio\'s browser bundle did not load (dist/ink-studio.browser.js).')
  const ink = await import(/* @vite-ignore */ `${INK_BASE}webgl.mjs`) as InkModule
  return { ink, toolkit: window.__inkToolkit }
}

/** What the comparison reads from a Blobscape page with a stage (Diorama's `window.__diorama`). */
export interface Source {
  stage: CreatureStage
  /** The palette the page's pixel art snaps to, and its sky's top color. */
  palette: Rgb[]
  sky?: Rgb
}

/** One drawing of the Ink side, for the page's line under it. */
export interface InkDrawn {
  blobs: number
  art: { width: number; height: number }
  error?: string
}

export class InkView {
  private renderer?: ReturnType<InkModule['createRenderer']>
  private world: Any
  private fit?: InkFit
  private posed: Blobs[] = []
  private builtFor?: { actors: readonly unknown[]; time: number; look?: InkLook; extras: boolean; palette: string }
  private builtAt = 0

  constructor(private readonly canvas: HTMLCanvasElement, private readonly ink: InkModule, private readonly toolkit: { KIT: Any; PixelLook: Any }) {}

  /**
   * Draws `src` as it stands, in `look`, `width` × `height` CSS pixels. The scene is posed and handed over again only
   * when the actors change or the clock moved and `every` milliseconds have passed (posing a big scene on the CPU
   * takes a moment); the camera follows every frame.
   */
  draw(src: Source, look: InkLook | undefined, size: { width: number; height: number; pixel: number }, opts: { extras: boolean; every: number }): InkDrawn {
    const actors = opts.extras ? src.stage.shownActors : src.stage.shownActors.slice(0, 1)
    const time = src.stage.time
    const palette = JSON.stringify(look?.palette ?? src.palette)
    const was = this.builtFor
    const now = performance.now()
    const changed = !was || was.look !== look || was.extras !== opts.extras || was.palette !== palette || was.actors.length !== actors.length || was.actors.some((a, i) => a !== actors[i])
    const moved = !!was && was.time !== time && now - this.builtAt >= opts.every
    if (changed || moved) {
      this.build(src, actors, look)
      this.builtFor = { actors, time, look, extras: opts.extras, palette }
      this.builtAt = now
    }
    const art = { width: Math.max(1, Math.round(size.width / size.pixel)), height: Math.max(1, Math.round(size.height / size.pixel)) }
    if (!this.world || !this.fit) return { blobs: 0, art }
    this.renderer ??= this.ink.createRenderer(this.canvas, { toolkit: this.toolkit })
    this.world.cam = inkCamera(src.stage.orbit, this.fit, STAGE_FOV)
    try {
      this.renderer.render(this.world, { ...look?.frame, width: art.width, height: art.height, time })
    } catch (e) {
      return { blobs: this.world.count, art, error: e instanceof Error ? e.message : String(e) }
    }
    return { blobs: this.world.count, art }
  }

  private build(src: Source, actors: readonly Actor[], look: InkLook | undefined) {
    // each actor's blobs as its skeleton stands now, on the CPU (the stage poses on the GPU)
    this.posed = actors.map((a, i) => {
      const out = this.posed[i]?.capacity && this.posed[i].capacity >= a.blobs.count ? this.posed[i] : new Blobs(a.blobs.count)
      out.count = a.blobs.count
      out.color.set(a.blobs.color.subarray(0, a.blobs.count * 3))
      out.opacity.set(a.blobs.opacity.subarray(0, a.blobs.count))
      poseBlobs(a.blobs, a.skin, a.skeleton, src.stage.mode, out)
      return out
    })
    const cloud = inkCloud(this.posed)
    this.fit = inkFit(cloud)
    const palette = look?.palette ?? inkPalette(src.palette.length ? src.palette : [[0, 0, 0], [255, 255, 255]])
    const world = this.ink.gaussianSplatWorld(cloud, { size: this.fit.size, colorMode: look?.colorMode ?? 'baked', palette: palette.length ? palette : [0, 0xffffff] })
    if (src.sky) world.bg = [...src.sky]
    Object.assign(world, look?.world ?? {})
    world.look = { ...(world.look ?? {}), ...(look?.look ?? {}) }
    if (look?.asset) {
      // a look from an asset pack: installed on the world and named by its look, as an Ink scene's finish.look.asset is
      world.assetPacks = [look.asset.pack]
      world.look.asset = look.asset.id
    }
    this.world = world
  }

  dispose() {
    this.renderer?.dispose()
    this.renderer = undefined
  }
}
