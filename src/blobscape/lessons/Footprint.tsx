import { useMemo, useState } from 'react'
import { Blobs, project } from '../../splat-core/blobs.ts'
import { orbitLens, type Orbit, type SplatView } from '../../splat-core/view.ts'
import { Chip, Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { drawOutlines, themeColor } from '../overlay.ts'
import { useGoals } from '../progress.ts'

const VIEWS: { name: string; azimuth: number; elevation: number }[] = [
  { name: 'Face on', azimuth: 0, elevation: 0 },
  { name: 'Edge on', azimuth: 90, elevation: 0 },
  { name: 'From above', azimuth: 0, elevation: 80 },
]

export function Footprint() {
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0, 0], distance: 4, azimuth: 35, elevation: 25 })
  const [reach, setReach] = useState(Math.sqrt(8))
  const [view, setView] = useState<SplatView | null>(null)

  // A round pancake: wide in x and y, thin in z, facing +Z (the "Face on" view)
  const blobs = useMemo(() => {
    const b = new Blobs(1)
    b.push({ center: [0, 0, 0], scale: [0.5, 0.5, 0.04], quat: [0, 0, 0, 1], color: [0.24, 0.6, 0.88], opacity: 0.95 })
    return b
  }, [])

  // Worked out from the orbit in state, not the view's camera, which only catches up after this render
  const f = view ? project(blobs, 0, orbitLens(orbit, view.canvas.clientWidth, view.canvas.clientHeight)) : null
  const ratio = f && f.b > 0 ? f.a / f.b : 1
  const done = useGoals('footprint', {
    round: !!f && ratio < 1.15,
    line: !!f && ratio > 8,
    hard: reach <= 1.0,
  })

  return (
    <LessonShell
      id="footprint"
      intro={<p>The screen is flat, so a 3D blob has to land on it as a flat shape. What shape does one flat blob make as you walk round it?</p>}
      view={
        <Viewport
          bare
          blobs={blobs}
          version={0}
          orbit={orbit}
          setOrbit={setOrbit}
          reach={reach}
          onView={setView}
          label="A flat blob and the ellipse it covers on screen. Drag or use the arrow keys to orbit."
          hint="drag to orbit · scroll to zoom"
          overlay={(ctx, lens) => {
            drawOutlines(ctx, blobs, lens, { sigmas: [1, 2], color: themeColor('ink-faint', ctx.canvas) })
            ctx.setLineDash([5, 4])
            drawOutlines(ctx, blobs, lens, { sigmas: [reach], color: themeColor('accent', ctx.canvas), width: 1.5 })
            ctx.setLineDash([])
          }}
        />
      }
      caption={
        f && (
          <p data-testid="footprint">
            On screen: <span className="tabular-nums text-ink">{Math.round(f.a * 2)} × {Math.round(f.b * 2)} px</span> across at 1σ,{' '}
            <span className="tabular-nums text-ink">{ratio > 99 ? '99+' : ratio.toFixed(1)} : 1</span>. The dashed ring is where drawing stops ({reach.toFixed(2)}σ).
          </p>
        )
      }
      groups={[
        {
          id: 'camera',
          title: 'Camera',
          note: 'or drag the view',
          span: 2,
          cols: 2,
          content: (
            <>
              <Slider label="Turn" value={Math.round(orbit.azimuth)} min={-180} max={180} step={1} onChange={(azimuth) => setOrbit((o) => ({ ...o, azimuth }))} format={(v) => `${v}°`} />
              <Slider label="Height" value={Math.round(orbit.elevation)} min={-85} max={85} step={1} onChange={(elevation) => setOrbit((o) => ({ ...o, elevation }))} format={(v) => `${v}°`} />
              <div className="flex flex-wrap items-center gap-1.5 lg:col-span-2" role="group" aria-label="Look from">
                <span className="mr-1 text-xs text-ink-faint">Jump to</span>
                {VIEWS.map((v) => (
                  <Chip small key={v.name} onClick={() => setOrbit((o) => ({ ...o, azimuth: v.azimuth, elevation: v.elevation }))}>{v.name}</Chip>
                ))}
              </div>
            </>
          ),
        },
        {
          id: 'reach',
          title: 'Reach',
          note: 'where drawing stops',
          content: (
            <Slider
              label="Reach"
              value={reach}
              min={0.5}
              max={3}
              step={0.01}
              onChange={setReach}
              format={(v) => `${v.toFixed(2)}σ`}
              hint="Real renderers stop around 3σ, where the Gaussian is under 1%."
            />
          ),
        },
      ]}
      goals={LESSON_GOALS['footprint']}
      done={done}
      scene={() => blobs}
      explainTitle="The screen only sees a shadow"
      formula={{
        eq: <>Σ′ = J W Σ W<sup className="font-sans text-[0.4em]">T</sup> J<sup className="font-sans text-[0.4em]">T</sup></>,
        terms: [
          ['Σ', "the blob's 3D shape: its sizes and rotation from the last lesson, multiplied together (its covariance)"],
          ['W', 'turns the world to face the camera'],
          ['J', 'how perspective stretches things at that spot on screen'],
          ['Σ′', 'the flat 2D ellipse that actually gets drawn'],
        ],
      }}
      explain={
        <>
          <p>
            Every frame, each blob's 3D shape is squashed onto the screen. The result is always an ellipse, so the GPU only ever draws
            flat, soft ovals. When you looked at the face, that oval was a circle; edge on, it was a line. Same Σ, different view.
          </p>
          <p>
            That's why a flat pancake works so well as a piece of surface: face-on it covers a wide area, edge-on it nearly disappears,
            exactly like a real surface would. It's also why splats are fast: no triangles, no lighting, just sorted ovals.
          </p>
          <p>
            Reach is a speed trade. Drawing to 3σ catches almost all of the blob; cutting it shorter saves pixels but leaves a visible
            edge where the Gaussian is chopped off.
          </p>
        </>
      }
    />
  )
}
