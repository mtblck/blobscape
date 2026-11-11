import { useMemo, useState } from 'react'
import { Blobs, project, quatFromEuler } from '../../splat-core/blobs.ts'
import type { Orbit, SplatView } from '../../splat-core/view.ts'
import { Chip, Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { Viewport } from '../Viewport.tsx'
import { drawOutlines, themeColour } from '../overlay.ts'
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

  // A pancake: wide in x, a little less in y, thin in z, facing +Z
  const blobs = useMemo(() => {
    const b = new Blobs(1)
    b.push({ centre: [0, 0, 0], scale: [0.6, 0.35, 0.04], quat: quatFromEuler(0, 0, 15), colour: [0.24, 0.6, 0.88], opacity: 0.95 })
    return b
  }, [])

  // orbit is a dependency of the lens even though it isn't read here directly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useMemo(() => (view ? project(blobs, 0, view.lens()) : null), [view, orbit, blobs])
  const ratio = f && f.b > 0 ? f.a / f.b : 1
  const done = useGoals('footprint', {
    round: !!f && ratio < 1.15,
    line: !!f && ratio > 8,
    hard: reach <= 1.1,
  })

  return (
    <LessonShell
      id="footprint"
      intro={<p>The renderer never draws a 3D blob. It works out the flat ellipse the blob would cast on the screen, and fills that.</p>}
      view={
        <Viewport
          blobs={blobs}
          version={0}
          orbit={orbit}
          setOrbit={setOrbit}
          reach={reach}
          onView={setView}
          label="A flat blob and the ellipse it covers on screen. Drag or use the arrow keys to orbit."
          hint="drag to orbit · scroll to zoom"
          overlayKey={reach}
          overlay={(ctx, lens) => {
            drawOutlines(ctx, blobs, lens, { sigmas: [1, 2], colour: themeColour('ink-faint') })
            ctx.setLineDash([5, 4])
            drawOutlines(ctx, blobs, lens, { sigmas: [reach], colour: themeColour('accent'), width: 1.5 })
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
      controls={
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Look from">
            {VIEWS.map((v) => (
              <Chip key={v.name} onClick={() => setOrbit((o) => ({ ...o, azimuth: v.azimuth, elevation: v.elevation }))}>{v.name}</Chip>
            ))}
          </div>
          <Slider label="Turn" value={Math.round(orbit.azimuth)} min={-180} max={180} step={1} onChange={(azimuth) => setOrbit((o) => ({ ...o, azimuth }))} format={(v) => `${v}°`} />
          <Slider label="Height" value={Math.round(orbit.elevation)} min={-85} max={85} step={1} onChange={(elevation) => setOrbit((o) => ({ ...o, elevation }))} format={(v) => `${v}°`} />
          <Slider
            label="Reach"
            value={reach}
            min={0.5}
            max={3}
            step={0.01}
            onChange={setReach}
            format={(v) => `${v.toFixed(2)}σ`}
            hint="How far out each blob gets drawn before the renderer gives up. Real renderers stop around 3σ, where the Gaussian is under 1%."
          />
        </>
      }
      goals={[
        { id: 'round', label: 'Find an angle where the footprint is round', hint: 'Look straight at the flat face.' },
        { id: 'line', label: 'Make the footprint a thin line', hint: 'Look at it edge-on.' },
        { id: 'hard', label: 'Cut the reach to 1σ or less and see the hard edge' },
      ]}
      done={done}
      scene={() => blobs}
      explain={
        <>
          <p>
            Every frame, each blob's 3D shape (its covariance: the size and rotation from the last lesson, multiplied together) is
            squashed onto the screen. Mathematically it's Σ′ = J W Σ Wᵀ Jᵀ, where W turns the world to face the camera and J is how
            perspective stretches things at that spot. The result is always an ellipse, so the GPU only ever draws flat, soft ovals.
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
