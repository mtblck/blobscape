import { useEffect, useRef } from 'react'
import type { CreatureStage } from '../../splat-engine/stage.ts'
import type { Frame } from '../../splat-core/pixel.ts'
import { Button } from '../../shared/ui.tsx'
import { TOUR, busiestSpot, type TourFacts } from './tour.ts'

/** Art pixels across the magnifier's box, and screen pixels across each of its two pictures. */
const BOX = 12, SIDE = 132

/**
 * The words and buttons of How it's made, in the line under the view: which step, what it shows, and the way on.
 * The view itself is redrawn for each step by the page.
 */
export function TourStrip({ step, facts, onStep, onClose }: { step: number; facts: TourFacts; onStep: (n: number) => void; onClose: () => void }) {
  const s = TOUR[step]
  const next = useRef<HTMLButtonElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  // opening it puts the keyboard on the way forward
  useEffect(() => { next.current?.focus() }, [])
  const last = step === TOUR.length - 1
  return (
    <div role="group" aria-label="How this picture is made" data-testid="diorama-tour" className="grid w-full gap-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-x-4">
      <p role="status" className="min-h-[4.5em] sm:min-h-[3em]">
        <span className="font-medium text-ink"><span className="tabular-nums">{step + 1}</span> of {TOUR.length}: {s.title}.</span> {s.text(facts)}
      </p>
      <div className="flex gap-1.5">
        <Button small disabled={step === 0} onClick={() => onStep(step - 1)}>Back</Button>
        {/* the last step has nowhere on to go: the keyboard moves to Done rather than being left on a dead button */}
        <Button small primary ref={next} disabled={last} onClick={() => { if (step === TOUR.length - 2) done.current?.focus(); onStep(step + 1) }}>Next</Button>
        <Button small ref={done} onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}

/**
 * The magnifier of the Four samples step: a small box of the picture, as it was drawn (four samples to a pixel, with
 * the grid they fall on) beside what each pixel became. It looks where samples disagree most, and keeps looking there.
 */
export function Magnifier({ stage }: { stage: CreatureStage }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let gone = false, busy = false
    let spot: { x: number; y: number; w: number; h: number } | undefined
    const draw = async () => {
      if (busy || gone) return
      busy = true
      try {
        const f = await stage.pixelFrames()
        const c = canvas.current
        if (!f?.fine || !c || gone) return
        if (!spot || spot.w !== f.small.width || spot.h !== f.small.height) spot = { ...busiestSpot(f.fine.parts, BOX), w: f.small.width, h: f.small.height }
        const ctx = c.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        ctx.fillStyle = '#0b1026'
        ctx.fillRect(0, 0, c.width, c.height)
        const paint = (from: Frame, x0: number, y0: number, n: number, left: number) => {
          const cell = SIDE / n
          for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
              const j = ((y0 + y) * from.width + x0 + x) * 4
              if (y0 + y >= from.height || x0 + x >= from.width || from.data[j + 3] < 128) continue
              ctx.fillStyle = `rgb(${from.data[j]},${from.data[j + 1]},${from.data[j + 2]})`
              ctx.fillRect(left + x * cell, y * cell, cell, cell)
            }
          }
        }
        paint(f.fine.small, spot.x * 2, spot.y * 2, BOX * 2, 0)
        paint(f.small, spot.x, spot.y, BOX, SIDE + 8)
        // the grid the samples fall on: a faint line between samples, a clear one between pixels
        for (let k = 0; k <= BOX * 2; k++) {
          const at = Math.round((k * SIDE) / (BOX * 2))
          ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.5)'
          ctx.fillRect(at, 0, 1, SIDE)
          ctx.fillRect(0, at, SIDE, 1)
        }
        c.dataset.spot = `${spot.x},${spot.y}`
      } catch (e) { console.warn(e) } finally { busy = false }
    }
    const first = setTimeout(draw, 150), id = setInterval(draw, 600)
    return () => { gone = true; clearTimeout(first); clearInterval(id) }
  }, [stage])
  return (
    <figure className="pointer-events-none absolute bottom-3 left-14 m-0 rounded-lg border border-rule bg-paper/90 p-1.5 max-sm:bottom-2 max-sm:left-12">
      <canvas ref={canvas} width={SIDE * 2 + 8} height={SIDE} data-testid="diorama-magnifier" role="img" aria-label="A small box of the picture, enlarged: on the left as it was drawn, four samples to each pixel; on the right what each pixel became." className="block h-auto w-[272px] max-w-[60vw] [image-rendering:pixelated]" />
      <figcaption className="mt-1 flex justify-between text-[11px] leading-tight text-ink-muted"><span>As drawn: 4 samples a pixel</span><span>What each pixel became</span></figcaption>
    </figure>
  )
}
