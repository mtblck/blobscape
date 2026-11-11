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
  /** Anything that changes what `overlay` draws, so it redraws. */
  overlayKey?: unknown
  tool?: ToolHandlers
  label: string
  /** Shown in the corner: how to drive the view. */
  hint?: string
  children?: ReactNode
  onView?: (v: SplatView) => void
  className?: string
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
export function Viewport({ blobs, version, orbit, setOrbit, reach, overlay, overlayKey, tool, label, hint, children, onView, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<SplatView | null>(null)
  const [failed, setFailed] = useState(false)
  const coarse = useRef(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches).current
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
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawRef.current?.(ctx, v.lens(), v)
  }

  useEffect(() => { viewRef.current?.sync(blobs) }, [blobs, version])
  useEffect(() => { if (viewRef.current) viewRef.current.orbit = orbit }, [orbit])
  useEffect(() => { if (viewRef.current && reach !== undefined) viewRef.current.reach = reach }, [reach])
  useEffect(() => { viewRef.current?.invalidate(2) }, [overlay, overlayKey])

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
    setOrbit((o) => clampOrbit({ ...o, azimuth: d.az - (ev.clientX - d.x) * 0.5, elevation: d.el + (ev.clientY - d.y) * 0.4 }))
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
    const step = ev.shiftKey ? 15 : 5
    const map: Record<string, (o: Orbit) => Orbit> = {
      ArrowLeft: (o) => ({ ...o, azimuth: o.azimuth - step }),
      ArrowRight: (o) => ({ ...o, azimuth: o.azimuth + step }),
      ArrowUp: (o) => ({ ...o, elevation: o.elevation + step }),
      ArrowDown: (o) => ({ ...o, elevation: o.elevation - step }),
      '+': (o) => ({ ...o, distance: o.distance / 1.15 }),
      '=': (o) => ({ ...o, distance: o.distance / 1.15 }),
      '-': (o) => ({ ...o, distance: o.distance * 1.15 }),
    }
    const f = map[ev.key]
    if (!f) return
    ev.preventDefault()
    setOrbit((o) => clampOrbit(f(o)))
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-rule bg-paper-sunk ${className ?? 'aspect-[4/3]'}`}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
      <canvas
        ref={overlayRef}
        role="img"
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
      />
      {failed && (
        <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">
          This browser could not start WebGL2, which the splat renderer needs.
        </div>
      )}
      {children}
      {hint && <p aria-hidden className="pointer-events-none absolute right-3 bottom-2 left-3 text-right text-xs text-ink-faint">{coarse ? hint.replace('scroll to zoom', 'pinch to zoom') : hint}</p>}
    </div>
  )
}
