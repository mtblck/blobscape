import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SplatView, type Orbit } from '../splat-core/view.ts'
import type { Blobs, Lens } from '../splat-core/blobs.ts'

export type Draw = (ctx: CanvasRenderingContext2D, lens: Lens, view: SplatView) => void

/** Pointer handlers for a tool. When given, a one-finger drag goes to the tool instead of orbiting. */
export interface ToolHandlers {
  down: (x: number, y: number, ev: React.PointerEvent) => void
  move?: (x: number, y: number, ev: React.PointerEvent) => void
  up?: () => void
  /** Pointer moving with no button down, for brush previews. */
  hover?: (x: number | null, y: number | null) => void
  /** A key on the focused view; return true if the tool used it (it then doesn't orbit). */
  key?: (ev: React.KeyboardEvent) => boolean
  /** Enter or Space on the focused view: use the tool at the centre. */
  activate?: (x: number, y: number, shift: boolean) => void
  cursor?: string
}

interface Props {
  blobs: Blobs
  /** Bump to send edited blobs to the GPU. */
  version: number
  orbit: Orbit
  setOrbit: (fn: (o: Orbit) => Orbit) => void
  reach?: number
  /** Draws over the splats after every frame (x-ray outlines, brush rings). */
  overlay?: Draw
  /**
   * Called when the blobs are about to be sent to the GPU: returns the first
   * index that changed (the old count after an append), so only new blobs are
   * rewritten, and optionally a GPU order (see SplatView.sync). Without it,
   * every sync rewrites them all in list order.
   */
  takeSync?: () => { from: number; order?: ArrayLike<number> | null }
  tool?: ToolHandlers
  label: string
  /** Shown in the corner: how to drive the view. */
  hint?: string
  children?: ReactNode
  onView?: (v: SplatView) => void
  className?: string
  /** No frame of its own: it fills a lesson's display case. */
  bare?: boolean
  /** Where the reset button takes the camera; the view it opened with when omitted. */
  home?: () => Orbit
  /** Leave out the zoom bar (a page showing two views shares one). */
  noZoom?: boolean
}

/** Degrees of turn per pixel dragged, shared by every view so they all feel the same. */
export const DRAG = { azimuth: 0.5, elevation: 0.4 }

/** Arrow keys orbit (Shift for bigger steps), + and − zoom. Returns the new orbit, or null for other keys. */
export function orbitKey(ev: { key: string; shiftKey: boolean }, o: Orbit): Orbit | null {
  const step = ev.shiftKey ? 15 : 5
  const next: Partial<Orbit> | undefined = {
    ArrowLeft: { azimuth: o.azimuth - step },
    ArrowRight: { azimuth: o.azimuth + step },
    ArrowUp: { elevation: o.elevation + step },
    ArrowDown: { elevation: o.elevation - step },
    '+': { distance: o.distance / 1.15 },
    '=': { distance: o.distance / 1.15 },
    '-': { distance: o.distance * 1.15 },
  }[ev.key]
  return next ? clampOrbit({ ...o, ...next }) : null
}

export const clampOrbit = (o: Orbit): Orbit => ({
  ...o,
  azimuth: ((o.azimuth % 360) + 540) % 360 - 180,
  elevation: Math.max(-85, Math.min(85, o.elevation)),
  distance: Math.max(0.6, Math.min(40, o.distance)),
})

/**
 * The 3D view every lesson and the sandbox share: Spark draws the blobs, a 2D
 * canvas on top draws whatever the page wants over them. Drag (or arrow keys)
 * to orbit, scroll, pinch or +/− to zoom.
 */
export function Viewport({ blobs, version, orbit, setOrbit, reach, overlay, takeSync, tool, label, hint, children, onView, className, bare, home, noZoom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<SplatView | null>(null)
  const [failed, setFailed] = useState(false)
  const coarse = useRef(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches).current
  const start = useRef(orbit).current
  const drawRef = useRef(overlay)
  drawRef.current = overlay

  useEffect(() => {
    let v: SplatView
    try {
      v = new SplatView(canvasRef.current!)
    } catch (err) {
      console.warn(err)
      setFailed(true)
      return
    }
    viewRef.current = v
    v.onFrame = () => paint(v)
    onView?.(v)
    return () => { v.dispose(); viewRef.current = null }
    // onView is for the first mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paint = (v: SplatView) => {
    const c = overlayRef.current
    if (!c) return
    const { clientWidth: w, clientHeight: h } = c
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) { c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr) }
    // A CPU-backed canvas: in Chrome a GPU one could keep showing an old frame after a clear that draws nothing new
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawRef.current?.(ctx, v.lens(), v)
  }

  useEffect(() => {
    const { from, order } = takeSync?.() ?? { from: 0 }
    viewRef.current?.sync(blobs, Number.isFinite(from) ? from : 0, order ?? null)
    // takeSync is read at sync time, not a trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobs, version])
  useEffect(() => { if (viewRef.current) viewRef.current.orbit = orbit }, [orbit])
  useEffect(() => { if (viewRef.current && reach !== undefined) viewRef.current.reach = reach }, [reach])
  // A new overlay function (a re-render with new settings) means it may draw something different
  useEffect(() => { viewRef.current?.invalidate(2) }, [overlay])

  // --- pointers: one finger orbits (or uses the tool), two fingers pinch-zoom
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ x: number; y: number; az: number; el: number; pinch?: number; dist: number; tool: boolean } | null>(null)
  const local = (ev: React.PointerEvent) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    return [ev.clientX - r.left, ev.clientY - r.top] as const
  }
  const onPointerDown = (ev: React.PointerEvent) => {
    ;(ev.currentTarget as Element).setPointerCapture(ev.pointerId)
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (pointers.current.size === 2) {
      // A second finger: stop the tool stroke and pinch instead
      if (drag.current?.tool) tool?.up?.()
      const [a, b] = [...pointers.current.values()]
      drag.current = { x: 0, y: 0, az: orbit.azimuth, el: orbit.elevation, pinch: Math.hypot(a.x - b.x, a.y - b.y), dist: orbit.distance, tool: false }
      return
    }
    // Right/middle button or a held modifier orbits even with a tool picked
    const useTool = !!tool && ev.button === 0 && !ev.altKey
    drag.current = { x: ev.clientX, y: ev.clientY, az: orbit.azimuth, el: orbit.elevation, dist: orbit.distance, tool: useTool }
    if (useTool) tool!.down(...local(ev), ev)
  }
  const onPointerMove = (ev: React.PointerEvent) => {
    if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    const d = drag.current
    if (!d) { if (ev.pointerType === 'mouse') tool?.hover?.(...local(ev)); return }
    if (d.pinch !== undefined && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const now = Math.hypot(a.x - b.x, a.y - b.y)
      setOrbit((o) => clampOrbit({ ...o, distance: d.dist * (d.pinch! / Math.max(now, 1)) }))
      return
    }
    if (d.tool) { tool?.move?.(...local(ev), ev); tool?.hover?.(...local(ev)); return }
    setOrbit((o) => clampOrbit({ ...o, azimuth: d.az - (ev.clientX - d.x) * DRAG.azimuth, elevation: d.el + (ev.clientY - d.y) * DRAG.elevation }))
  }
  const onPointerUp = (ev: React.PointerEvent) => {
    pointers.current.delete(ev.pointerId)
    if (drag.current?.tool) tool?.up?.()
    drag.current = null
  }

  // A native, non-passive listener: React's onWheel is passive, so the page would scroll while you zoom.
  useEffect(() => {
    const c = overlayRef.current
    if (!c) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      setOrbit((o) => clampOrbit({ ...o, distance: o.distance * (ev.deltaY > 0 ? 1.08 : 1 / 1.08) }))
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [setOrbit])

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (tool?.key?.(ev)) { ev.preventDefault(); return }
    if ((ev.key === 'Enter' || ev.key === ' ') && tool?.activate) {
      ev.preventDefault()
      const c = ev.currentTarget as HTMLElement
      tool.activate(c.clientWidth / 2, c.clientHeight / 2, ev.shiftKey)
      return
    }
    if (!orbitKey(ev, orbit)) return
    ev.preventDefault()
    setOrbit((o) => orbitKey(ev, o) ?? o)
  }

  return (
    <div className={`relative overflow-hidden ${bare ? 'h-full' : `rounded-lg border border-rule bg-paper-sunk ${className ?? 'aspect-[4/3]'}`}`}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
      <canvas
        ref={overlayRef}
        // An application, not an image: screen readers then pass the arrow keys through to it
        role="application"
        aria-roledescription="3D view"
        aria-label={label}
        tabIndex={0}
        data-testid="viewport"
        className="absolute inset-0 h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        style={{ cursor: tool?.cursor ?? 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => tool?.hover?.(null, null)}
        onContextMenu={(ev) => ev.preventDefault()}
        onKeyDown={onKeyDown}
        // The overlay can mark the centre for keyboard aiming while the view has focus
        onFocus={() => viewRef.current?.invalidate(1)}
        onBlur={() => viewRef.current?.invalidate(1)}
      />
      {failed && (
        <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">
          This browser could not start WebGL2, which the splat renderer needs.
        </div>
      )}
      {children}
      {!noZoom && <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(() => clampOrbit(home ? home() : start))} />}
      {hint && <p aria-hidden className={`pointer-events-none absolute ${noZoom ? 'right-3' : 'right-14'} bottom-2 left-3 text-right text-xs text-ink-faint`}>{coarse ? hint.replace('scroll to zoom', 'pinch to zoom') : hint}</p>}
    </div>
  )
}

const ZOOM = { near: Math.log(0.6), far: Math.log(40) }

/**
 * A vertical zoom slider along the inside right edge of a view, with a reset
 * button under it. Up is closer. The slider is on a log scale, so each notch
 * feels the same at any distance.
 */
export function ZoomBar({ orbit, setOrbit, onReset }: { orbit: Orbit; setOrbit: (fn: (o: Orbit) => Orbit) => void; onReset: () => void }) {
  // 0 = furthest, 1 = closest
  const t = (ZOOM.far - Math.log(orbit.distance)) / (ZOOM.far - ZOOM.near)
  return (
    <div className="absolute top-3 right-2.5 bottom-3 flex w-8 flex-col items-center gap-1.5 max-sm:top-2 max-sm:bottom-2">
      <button type="button" aria-label="Zoom in" onClick={() => setOrbit((o) => clampOrbit({ ...o, distance: o.distance / 1.15 }))} className="zoom-btn">+</button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={Math.min(1, Math.max(0, t))}
        onChange={(e) => {
          const v = Number(e.target.value)
          setOrbit((o) => clampOrbit({ ...o, distance: Math.exp(ZOOM.far - v * (ZOOM.far - ZOOM.near)) }))
        }}
        aria-label="Zoom"
        aria-valuetext={`${orbit.distance.toFixed(1)} units away`}
        className="zoom-range min-h-0 flex-1"
      />
      <button type="button" aria-label="Zoom out" onClick={() => setOrbit((o) => clampOrbit({ ...o, distance: o.distance * 1.15 }))} className="zoom-btn">−</button>
      <button type="button" aria-label="Reset the view" title="Reset the view" onClick={onReset} className="zoom-btn mt-1">
        <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a5 5 0 1 0 1.5-3.6" /><path d="M3 2.5v2.8h2.8" /></svg>
      </button>
    </div>
  )
}
