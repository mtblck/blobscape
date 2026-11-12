import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../../splat-core/view.ts'
import { DRAG, clampOrbit, orbitKey } from '../Viewport.tsx'
import { PHOTO, orbitCam, render, type Model } from './train3d.ts'
import { asBlobs } from './cleanup.ts'

/** Views and helpers shared by the lessons that train round blobs on the CPU (Photo shoot, Floaters). */

/** The trained blobs as a scene for the sandbox. */
export const toBlobs = asBlobs

export function toImage(px: Float64Array, w: number, h: number): ImageData {
  const bytes = new Uint8ClampedArray(w * h * 4)
  for (let k = 0, j = 0; k < px.length; k += 3, j += 4) {
    bytes[j] = px[k] * 255
    bytes[j + 1] = px[k + 1] * 255
    bytes[j + 2] = px[k + 2] * 255
    bytes[j + 3] = 255
  }
  return new ImageData(bytes, w, h)
}

/** One photo, small. */
export function Thumb({ photo }: { photo: Float64Array }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    ref.current!.getContext('2d')!.putImageData(toImage(photo, PHOTO, PHOTO), 0, 0)
  }, [photo])
  return <canvas ref={ref} width={PHOTO} height={PHOTO} className="h-8 w-8 rounded-sm ring-1 ring-rule" />
}

/** A software-rendered view of round blobs. Drag or arrow keys orbit. */
export function CpuView({ model, orbit, setOrbit, title, testId, label }: { model: Model | null; orbit: Orbit; setOrbit: (f: Orbit | ((o: Orbit) => Orbit)) => void; title: string; testId: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 200, h: 150 })
  useEffect(() => {
    const c = ref.current!
    const ro = new ResizeObserver(() => {
      // Soft blobs need few pixels: render small and let the browser scale it up
      const w = Math.min(220, Math.max(60, Math.round(c.clientWidth / 1.5)))
      setSize({ w, h: Math.max(45, Math.round((c.clientHeight / Math.max(1, c.clientWidth)) * w)) })
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [])
  const cam = useMemo(() => orbitCam(orbit.azimuth, orbit.elevation, size.w, size.h, orbit.distance), [orbit, size])
  useEffect(() => {
    const c = ref.current!
    c.width = size.w
    c.height = size.h
    const ctx = c.getContext('2d')!
    if (!model) { ctx.clearRect(0, 0, size.w, size.h); return }
    ctx.putImageData(toImage(render(model, cam), size.w, size.h), 0, 0)
  }, [model, cam, size])

  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null)
  return (
    <figure className="relative h-full min-w-0">
      <canvas
        ref={ref}
        role="application"
        aria-roledescription="3D view"
        aria-label={`${title}. ${label} Drag or use the arrow keys to turn.`}
        tabIndex={0}
        data-testid={testId}
        className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
        onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); drag.current = { x: ev.clientX, y: ev.clientY, az: orbit.azimuth, el: orbit.elevation } }}
        onPointerMove={(ev) => {
          const d = drag.current
          if (d) setOrbit((o) => clampOrbit({ ...o, azimuth: d.az - (ev.clientX - d.x) * DRAG.azimuth, elevation: d.el + (ev.clientY - d.y) * DRAG.elevation }))
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onKeyDown={(ev) => {
          if (!orbitKey(ev, orbit)) return
          ev.preventDefault()
          setOrbit((o) => orbitKey(ev, o) ?? o)
        }}
      />
      <figcaption className="pointer-events-none absolute top-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )
}
