import { useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../../splat-core/orbit.ts'
import type { Stage } from '../../splat-engine/stage.ts'
import { LoadingMark } from '../../shared/BlobLoader.tsx'
import { beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from '../Viewport.tsx'

/**
 * The engine lessons' view: the package's `Stage` on a canvas inside the display case, orbited by drag, keys, wheel
 * and pinch like every other view. It starts the stage once and hands it up (`onStage`); the lesson sets the actor,
 * the poser and the rest. `?offscreen=1` draws to a target for headless checks, as the engine experiments do.
 */
export function StageView({ orbit, setOrbit, label, onStage, waiting }: {
  orbit: Orbit
  setOrbit: (fn: Orbit | ((o: Orbit) => Orbit)) => void
  label: string
  onStage: (stage: Stage | undefined) => void
  /** What the view is waiting for, for the status line, while it shows the loading mark (a creature being cut). */
  waiting?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<Stage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState(false)
  const offscreen = useMemo(() => typeof location !== 'undefined' && new URLSearchParams(location.search).get('offscreen') === '1', [])
  const handUp = useRef(onStage)
  handUp.current = onStage

  useEffect(() => {
    let live: Stage | undefined, gone = false
    import('../../splat-engine/stage.ts')
      .then(({ Stage }) => Stage.start(canvas.current!, { offscreen, lights: true }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        setStage(s)
        handUp.current(s)
      }, (e: unknown) => { console.warn(e); setFailed(true) })
    return () => { gone = true; handUp.current(undefined); live?.dispose() }
  }, [offscreen])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  useWheelZoom(canvas, setOrbit)
  const busy = !failed && (!drawn || !!waiting)

  return (
    <div className="relative h-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${label} Drag or use the arrow keys to orbit; scroll or pinch to zoom.`}
        tabIndex={0}
        data-testid="stage-view"
        className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
        onPointerDown={(ev) => {
          ev.currentTarget.setPointerCapture(ev.pointerId)
          pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
          drag.current = beginOrbitDrag(pointers.current, ev, orbit)
        }}
        onPointerMove={(ev) => {
          if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
          const d = drag.current
          if (d) setOrbit(dragOrbit(d, pointers.current, ev))
        }}
        onPointerUp={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
        onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
        onKeyDown={(ev) => {
          if (!orbitKey(ev, orbit)) return
          ev.preventDefault()
          setOrbit((o) => orbitKey(ev, o) ?? o)
        }}
      />
      {busy && <LoadingMark testid="stage-loading" />}
      <p role="status" className="sr-only">{failed ? '' : !stage ? 'Starting the splat engine…' : busy ? waiting ?? 'Drawing…' : ''}</p>
      {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">This browser could not start WebGPU or WebGL 2, which this lesson needs.</div>}
    </div>
  )
}
