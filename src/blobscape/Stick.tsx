import { useRef, useState } from 'react'

/** What the stick asks for: forward and back, and turning, each −1 to 1. */
export interface StickInput { forward: number; turn: number }

/**
 * A thumb stick for touch (and mouse): push up to walk, down to back up,
 * sideways to turn. Keys do the same, so it's hidden from screen readers.
 */
export function Stick({ onChange, testid }: { onChange: (v: StickInput) => void; testid?: string }) {
  const pad = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState<[number, number]>([0, 0])
  const id = useRef<number | null>(null)
  const move = (x: number, y: number) => {
    const r = pad.current!.getBoundingClientRect()
    const R = r.width / 2
    let dx = (x - (r.left + R)) / R, dy = (y - (r.top + R)) / R
    const d = Math.hypot(dx, dy)
    if (d > 1) { dx /= d; dy /= d }
    setKnob([dx, dy])
    // a little dead zone in the middle, so a resting thumb doesn't creep
    const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85)
    onChange({ forward: dead(-dy), turn: dead(dx) })
  }
  const end = () => { id.current = null; setKnob([0, 0]); onChange({ forward: 0, turn: 0 }) }
  return (
    <div
      ref={pad}
      aria-hidden
      data-testid={testid}
      className="absolute bottom-3 left-3 size-28 cursor-grab touch-none rounded-full border border-white/25 bg-black/20 backdrop-blur-[2px] active:cursor-grabbing max-sm:size-24"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); id.current = e.pointerId; move(e.clientX, e.clientY) }}
      onPointerMove={(e) => { if (id.current === e.pointerId) move(e.clientX, e.clientY) }}
      onPointerUp={(e) => { if (id.current === e.pointerId) end() }}
      onPointerCancel={(e) => { if (id.current === e.pointerId) end() }}
    >
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 size-11 rounded-full border border-white/50 bg-white/35 shadow"
        style={{ transform: `translate(calc(-50% + ${knob[0] * 2.5}rem), calc(-50% + ${knob[1] * 2.5}rem))` }}
      />
    </div>
  )
}
