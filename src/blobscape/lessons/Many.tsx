import { useMemo, useState } from 'react'
import type { Orbit } from '../../splat-core/view.ts'
import { SHAPES, blobsFromSamples, sampleShape, type ShapeId } from '../../splat-core/shapes.ts'
import { Chip, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { drawCentres, drawOutlines, themeColour } from '../overlay.ts'
import { useGoals } from '../progress.ts'

const MAX = 20000
// Counts on a log slider, from a single blob to 20,000
const toCount = (v: number) => Math.max(1, Math.round(10 ** v))
const OUTLINE_LIMIT = 600

export function Many() {
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0.8, 0], distance: 4.2, azimuth: 30, elevation: 20 })
  const [shape, setShape] = useState<ShapeId>('sphere')
  const [logCount, setLogCount] = useState(Math.log10(300))
  const [sizeMul, setSizeMul] = useState(1)
  const [flat, setFlat] = useState(true)
  const [xray, setXray] = useState(false)
  const count = toCount(logCount)

  const all = useMemo(() => sampleShape(shape, MAX), [shape])
  const blobs = useMemo(() => {
    // Size each blob so the set covers the surface about once: area / count = π r²
    const area = SHAPES.find((s) => s.id === shape)!.area
    const size = Math.sqrt(area / count / Math.PI) * 0.75 * sizeMul
    return blobsFromSamples(all.slice(0, count), size, flat)
  }, [all, count, sizeMul, flat, shape])

  const done = useGoals('many', {
    few: count < 30,
    lots: count > 5000,
    balls: !flat,
    gaps: sizeMul <= 0.35 && count >= 200,
  })

  return (
    <LessonShell
      id="many"
      intro={<p>No blob knows what shape it's part of. So how many does it take before a pile of them looks like a solid thing?</p>}
      view={
        <Viewport
          bare
          blobs={blobs}
          version={0}
          orbit={orbit}
          setOrbit={setOrbit}
          label={`A ${SHAPES.find((s) => s.id === shape)!.name.toLowerCase()} made of ${count.toLocaleString()} blobs. Drag or use the arrow keys to orbit.`}
          hint="drag to orbit · scroll to zoom"
          overlay={
            xray
              ? (ctx, lens) => {
                  if (blobs.count <= OUTLINE_LIMIT) drawOutlines(ctx, blobs, lens, { sigmas: [2], colour: themeColour('ink-faint', ctx.canvas) })
                  else drawCentres(ctx, blobs, lens, themeColour('ink', ctx.canvas))
                }
              : undefined
          }
        />
      }
      caption={
        <p>
          <span className="tabular-nums text-ink" data-testid="blob-count">{count.toLocaleString()}</span> blobs, about{' '}
          <span className="tabular-nums">{Math.max(1, Math.round((count * 56) / 1024)).toLocaleString()} KB</span> of data.
          {xray && (count <= OUTLINE_LIMIT ? ' X-ray shows each footprint.' : ' X-ray shows centres only: past 600 blobs the outlines are just a scribble.')}
        </p>
      }
      groups={[
        {
          id: 'shape',
          title: 'Shape',
          note: 'what the blobs are scattered over',
          content: (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Shape">
              {SHAPES.map((s) => <Chip key={s.id} active={shape === s.id} onClick={() => setShape(s.id)}>{s.name}</Chip>)}
            </div>
          ),
        },
        {
          id: 'count',
          title: 'How many',
          note: 'and how big',
          span: 2,
          cols: 2,
          content: (
            <>
              <Slider label="Blobs" value={logCount} min={0} max={Math.log10(MAX)} step={0.01} onChange={setLogCount} format={(v) => toCount(v).toLocaleString()} />
              <Slider label="Blob size" value={sizeMul} min={0.15} max={3} step={0.01} onChange={setSizeMul} format={(v) => `${v.toFixed(2)}×`} hint="1× sizes the blobs to cover the surface about once." />
            </>
          ),
        },
        {
          id: 'blobs',
          title: 'Blobs',
          note: 'their kind',
          content: (
            <>
              <Toggle label="Flat discs on the surface" checked={flat} onChange={setFlat} />
              <Toggle label="X-ray" checked={xray} onChange={setXray} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['many']}
      done={done}
      scene={() => blobs}
      explainTitle="The shape is only where they are"
      explain={
        <>
          <p>
            Each blob here sits at a point on the surface, and the shading is baked into its colour. The renderer has no idea it's
            drawing a sphere: it just draws a few thousand ovals, sorted back to front. The shape only exists because of where they are.
          </p>
          <p>
            Fewer blobs means each has to be bigger to cover the surface, so the shape gets lumpy. That's the core trade in splatting:
            a real capture uses hundreds of thousands to millions of blobs, mostly small, flat and packed into the places with the most
            detail, which is why the files run to tens of megabytes.
          </p>
          <p>
            Flat discs lying along the surface give a clean edge from any angle, because edge-on they nearly vanish. Round balls bulge out
            past the surface at the silhouette. Training tends to flatten blobs for exactly this reason.
          </p>
        </>
      }
    />
  )
}
