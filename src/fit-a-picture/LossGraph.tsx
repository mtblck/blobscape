import { useEffect, useMemo, useRef, useState } from 'react'
import { psnr } from './fit.ts'
import type { History } from './history.ts'

const H = 166
const PAD = { top: 10, right: 10, bottom: 36, left: 46 }
const SUPER = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/**
 * The loss after every step, on a log scale: one line, recessive grid, and a
 * crosshair with the value under the pointer. Focus it and use the arrow
 * keys to read values without a pointer.
 */
export function LossGraph({ history, version }: { history: History; version: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  /** The point under the pointer or the keyboard, as an index into the drawn points. */
  const [hover, setHover] = useState<{ i: number; key: boolean } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotW = width - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const n = history.length

  // Average the stored points into about one per 2 px, then plot their logs
  const g = useMemo(() => {
    const buckets = Math.max(1, Math.min(n, Math.floor(plotW / 2)))
    const pts: { step: number; loss: number }[] = []
    for (let b = 0; b < buckets && n; b++) {
      const i0 = Math.floor((b * n) / buckets), i1 = Math.max(i0 + 1, Math.floor(((b + 1) * n) / buckets))
      let sum = 0
      for (let i = i0; i < i1; i++) sum += history.data[i]
      pts.push({ step: i1 * history.stride, loss: sum / (i1 - i0) })
    }
    let lo = Infinity, hi = -Infinity
    for (const p of pts) {
      const l = Math.log10(Math.max(1e-7, p.loss))
      lo = Math.min(lo, l)
      hi = Math.max(hi, l)
    }
    if (!pts.length) { lo = -3; hi = -1 }
    lo = Math.floor(lo)
    hi = Math.max(lo + 1, Math.ceil(hi))
    const xMax = Math.max(100, n * history.stride)
    const x = (step: number) => PAD.left + (step / xMax) * plotW
    const y = (loss: number) => PAD.top + ((hi - Math.log10(Math.max(1e-7, loss))) / (hi - lo)) * plotH
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.step).toFixed(1)},${y(p.loss).toFixed(1)}`).join('')
    const decades = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i)
    return { pts, x, y, xMax, path, decades, xTicks: niceTicks(xMax) }
    // version changes whenever the buffer gets new losses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, plotW, n])

  // The point nearest the pointer's step
  const nearestTo = (px: number) => {
    const step = ((px - PAD.left) / plotW) * g.xMax
    let best = 0
    for (let i = 1; i < g.pts.length; i++) if (Math.abs(g.pts[i].step - step) < Math.abs(g.pts[best].step - step)) best = i
    return best
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = g.pts.length - 1
    if (last < 0) return
    const at = hover?.i ?? last
    const by = e.shiftKey ? 10 : 1
    const to = e.key === 'ArrowLeft' ? at - by : e.key === 'ArrowRight' ? at + by : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (to === null) return
    e.preventDefault()
    setHover({ i: Math.min(last, Math.max(0, to)), key: true })
  }

  const near = hover && g.pts.length ? g.pts[Math.min(hover.i, g.pts.length - 1)] : null
  const readout = near ? `Step ${near.step.toLocaleString()} · loss ${near.loss.toPrecision(2)} · ${psnr(near.loss).toFixed(1)} dB` : ''
  const first = n ? history.data[0] : null
  const last = n ? history.data[n - 1] : null
  const summary = first === null || last === null
    ? 'Loss graph: no steps yet.'
    : `Loss graph, log scale: from ${first.toPrecision(2)} at the start to ${last.toPrecision(2)} after ${history.steps.toLocaleString()} steps. Use the arrow keys to read values.`

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">Loss</span>
        <span className="text-xs text-ink-faint">log scale: each line down is 10× closer</span>
      </figcaption>
      <div ref={box} className="relative mt-1.5" data-testid="loss-graph" data-points={history.steps}>
        <svg
          width={width}
          height={H}
          className="block rounded"
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
          onPointerMove={(e) => g.pts.length && setHover({ i: nearestTo(e.clientX - e.currentTarget.getBoundingClientRect().left), key: false })}
          onPointerLeave={() => setHover((h) => (h?.key ? h : null))}
        >
          {g.decades.map((d) => (
            <g key={d}>
              <line x1={PAD.left} x2={width - PAD.right} y1={g.y(10 ** d)} y2={g.y(10 ** d)} stroke="var(--c-rule-soft)" />
              <text x={PAD.left - 6} y={g.y(10 ** d)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--c-ink-faint)">
                {power(d)}
              </text>
            </g>
          ))}
          {g.xTicks.map((t) => (
            <text key={t} x={g.x(t)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="11" fill="var(--c-ink-faint)">
              {t.toLocaleString()}
            </text>
          ))}
          <text x={PAD.left + plotW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--c-ink-faint)">steps</text>
          <line x1={PAD.left} x2={width - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--c-rule)" />
          <path d={g.path} fill="none" stroke="var(--c-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {near && (
            <g aria-hidden>
              <line x1={g.x(near.step)} x2={g.x(near.step)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--c-ink-faint)" strokeDasharray="2 3" />
              <circle cx={g.x(near.step)} cy={g.y(near.loss)} r="4" fill="var(--c-accent)" stroke="var(--c-paper)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {near && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-1 rounded border border-rule bg-paper px-2 py-1 text-xs whitespace-nowrap text-ink shadow-sm tabular-nums"
            style={g.x(near.step) > width / 2 ? { right: width - g.x(near.step) + 8 } : { left: g.x(near.step) + 8 }}
          >
            {readout}
          </div>
        )}
        {/* Keyboard readings are spoken; pointer ones would chatter */}
        <p aria-live="polite" className="sr-only">{hover?.key ? readout : ''}</p>
      </div>
    </figure>
  )
}

/** 10 to the power d, written out: 1, 10⁻¹, 10⁻², … */
function power(d: number) {
  if (d === 0) return '1'
  if (d === 1) return '10'
  return `10${d < 0 ? '⁻' : ''}${String(Math.abs(d)).split('').map((c) => SUPER[+c]).join('')}`
}

/** About four round step numbers between 0 and max. */
function niceTicks(max: number) {
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const out: number[] = []
  for (let t = 0; t <= max; t += step) out.push(t)
  return out
}
