import { useMemo, useRef, useState } from 'react'
import { Blobs } from '../../splat-core/blobs.ts'
import { hash01 } from '../../splat-core/effects.ts'
import { PRESETS } from '../../splat-core/presets.ts'
import { blobsFromPreset } from '../../splat-core/shapes.ts'
import type { Orbit } from '../../splat-core/view.ts'
import { Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [0, 0.55, 0], distance: 4.6, azimuth: 25, elevation: 18 }
const CENTRE = [0, 0.5, 0]

/** Throws blob i out from the middle, partly in a random direction so the cloud fills a volume and gaps open (a purely radial push just looks like a bigger toadstool). */
function scatter(b: Blobs, i: number, amount: number) {
  const c = b.centre, k = i * 3
  let rx = c[k] - CENTRE[0], ry = c[k + 1] - CENTRE[1], rz = c[k + 2] - CENTRE[2]
  const r = Math.hypot(rx, ry, rz) || 1
  // Uniform random direction from two hashes
  const u = hash01(i, 11) * 2 - 1, t = hash01(i, 12) * Math.PI * 2, q = Math.sqrt(1 - u * u)
  rx = rx / r * 0.7 + q * Math.cos(t); ry = ry / r * 0.7 + u; rz = rz / r * 0.7 + q * Math.sin(t)
  const l = Math.hypot(rx, ry, rz) || 1
  const d = amount * 0.75 * (0.25 + hash01(i, 13)) / l
  c[k] += rx * d; c[k + 1] += ry * d; c[k + 2] += rz * d
}

export function Break() {
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [size, setSize] = useState(1)
  const [explode, setExplode] = useState(0)
  const base = useMemo(() => blobsFromPreset(PRESETS[0]), [])
  const shown = useMemo(() => {
    const b = new Blobs(base.count)
    b.count = base.count
    b.centre.set(base.centre.subarray(0, base.count * 3))
    b.quat.set(base.quat.subarray(0, base.count * 4))
    b.colour.set(base.colour.subarray(0, base.count * 3))
    b.opacity.set(base.opacity.subarray(0, base.count))
    return b
  }, [base])
  // Rewritten from the untouched original every time, so nothing drifts
  const version = useMemo(() => {
    const n = base.count
    for (let k = 0; k < n * 3; k++) { shown.scale[k] = base.scale[k] * size; shown.centre[k] = base.centre[k] }
    if (explode > 0) for (let i = 0; i < n; i++) scatter(shown, i, explode)
    return size * 1000 + explode
  }, [base, shown, size, explode])

  const before = useRef(new Set<string>())
  const done = useGoals('break', {
    dots: size <= 0.15,
    apart: explode >= 0.6,
    back: before.current.has('dots') && before.current.has('apart') && explode < 0.05 && Math.abs(size - 1) < 0.1,
  })
  before.current = done

  return (
    <LessonShell
      id="break"
      intro={<p>The toadstool looks solid: a red cap, a pale stem. What's really in there, and what happens if you take it apart?</p>}
      view={
        <Viewport
          bare
          blobs={shown}
          version={version}
          orbit={orbit}
          setOrbit={setOrbit}
          label={`A toadstool made of ${base.count.toLocaleString()} blobs, each at ${size.toFixed(2)} times its size${explode > 0 ? `, blown apart by ${Math.round(explode * 100)}%` : ''}. Drag or use the arrow keys to orbit.`}
          hint="drag to orbit · scroll to zoom"
        />
      }
      caption={
        <p>
          The same <span className="tabular-nums text-ink" data-testid="blob-count">{base.count.toLocaleString()}</span> blobs, each at{' '}
          <span className="tabular-nums text-ink">×{size.toFixed(2)}</span> its size, {explode > 0 ? <>thrown <span className="tabular-nums text-ink">{Math.round(explode * 100)}%</span> of the way out</> : 'in their places'}.
        </p>
      }
      groups={[
        {
          id: 'size',
          title: 'Blob size',
          note: 'every blob at once',
          content: <Slider label="Size" value={size} min={0.02} max={2} step={0.01} onChange={setSize} format={(v) => `×${v.toFixed(2)}`} />,
        },
        {
          id: 'explode',
          title: 'Explode',
          note: 'each blob flies off on its own',
          content: <Slider label="Explode" value={explode} min={0} max={1} step={0.01} onChange={setExplode} format={(v) => `${Math.round(v * 100)}%`} />,
        },
      ]}
      goals={LESSON_GOALS['break']}
      done={done}
      scene={() => shown}
      explainTitle="There is no surface"
      explain={
        <>
          <p>
            Shrunk to dots, the cap and stem turned into a cloud of points: the surface you saw was only ever soft blobs overlapping.
            Blown apart, each blob flew on its own, because nothing joins one blob to the next. There are no triangles, no edges and
            no inside.
          </p>
          <p>
            And when you put the sliders back, the toadstool came back exactly. Every blob still had its own 14 numbers. A splat is a
            list, and anything you can do to a list, you can do to a scene: filter it, move part of it, recolour it, animate it.
          </p>
          <p>
            That's what the sandbox is for. It has every tool from these lessons, any scene you like and effects that bend whole
            scenes at once.
          </p>
        </>
      }
    />
  )
}
