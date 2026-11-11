import { useMemo, useRef, useState } from 'react'
import { Blobs, quatFacing, type Vec3 } from '../../splat-core/blobs.ts'
import type { Orbit, SplatView } from '../../splat-core/view.ts'
import { Button, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport, type ToolHandlers } from '../Viewport.tsx'
import { themeColour, toScreen } from '../overlay.ts'
import { useGoals } from '../progress.ts'

const START: Orbit = { target: [0, 0, 0], distance: 4.2, azimuth: 20, elevation: 48 }
/** The square to cover, on the floor: x and z from −HALF to +HALF. */
const HALF = 0.75
const GRID = 40
const MAX = 4000
const BRUSH = 0.28

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function dab(b: Blobs, round: Uint8Array, at: Vec3, count: number, size: number, flat: boolean, rand: () => number) {
  for (let k = 0; k < count && b.count < MAX; k++) {
    const r = BRUSH * Math.sqrt(rand()), a = rand() * Math.PI * 2
    const s = size * (0.8 + rand() * 0.4)
    const shade = 0.85 + rand() * 0.3
    const i = b.push({
      centre: [at[0] + Math.cos(a) * r, flat ? 0.002 : s * 0.6, at[2] + Math.sin(a) * r],
      scale: [s, s, flat ? s * 0.12 : s],
      quat: quatFacing([0, 1, 0]),
      colour: [0.22 * shade, 0.62 * shade, 0.42 * shade],
      opacity: 0.9,
    })
    round[i] = flat ? 0 : 1
  }
}

/** How much of the square the blobs cover: the share of grid cells at least 85% opaque. */
function coverage(b: Blobs): number {
  const T = new Float32Array(GRID * GRID).fill(1)
  const cell = (2 * HALF) / GRID
  for (let i = 0; i < b.count; i++) {
    const cx = b.centre[i * 3], cz = b.centre[i * 3 + 2], s = b.scale[i * 3], a = b.opacity[i]
    const reach = 2.5 * s
    const x0 = Math.max(0, Math.floor((cx - reach + HALF) / cell)), x1 = Math.min(GRID - 1, Math.floor((cx + reach + HALF) / cell))
    const z0 = Math.max(0, Math.floor((cz - reach + HALF) / cell)), z1 = Math.min(GRID - 1, Math.floor((cz + reach + HALF) / cell))
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const dx = -HALF + (gx + 0.5) * cell - cx, dz = -HALF + (gz + 0.5) * cell - cz
        T[gz * GRID + gx] *= 1 - a * Math.exp(-(dx * dx + dz * dz) / (2 * s * s))
      }
    }
  }
  let covered = 0
  for (let k = 0; k < T.length; k++) if (T[k] < 0.15) covered++
  return covered / T.length
}

function startingScene() {
  const b = new Blobs(MAX)
  const round = new Uint8Array(MAX)
  const rand = rng(11)
  for (const at of [[-0.5, 0, -0.45], [-0.25, 0, -0.55], [-0.55, 0, -0.15]] as Vec3[]) dab(b, round, at, 14, 0.07, true, rand)
  return { b, round }
}

export function Paint() {
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [size, setSize] = useState(0.07)
  const [perDab, setPerDab] = useState(12)
  const [flat, setFlat] = useState(true)
  const [view, setView] = useState<SplatView | null>(null)
  const scene = useRef(startingScene())
  const rand = useRef(rng(5))
  const [version, setVersion] = useState(0)
  const last = useRef<[number, number] | null>(null)

  const b = scene.current.b
  const covered = useMemo(() => coverage(b), [b, version])
  let rounds = 0
  for (let i = 0; i < b.count; i++) rounds += scene.current.round[i]

  const done = useGoals('paint', {
    cover: covered >= 0.9,
    few: covered >= 0.9 && b.count < 150,
    balls: rounds >= 30 && orbit.elevation < 10,
  })

  const sprayAt = (x: number, y: number) => {
    if (!view) return
    const { origin: o, dir: d } = view.ray(x, y)
    if (d.y > -0.02) return
    const t = -o.y / d.y
    const at: Vec3 = [o.x + d.x * t, 0, o.z + d.z * t]
    if (Math.abs(at[0]) > 3 || Math.abs(at[2]) > 3) return
    dab(b, scene.current.round, at, perDab, size, flat, rand.current)
    setVersion((v) => v + 1)
  }

  const tool: ToolHandlers = {
    down: (x, y) => { last.current = [x, y]; sprayAt(x, y) },
    move: (x, y) => {
      const l = last.current
      if (l && Math.hypot(x - l[0], y - l[1]) < 14) return
      last.current = [x, y]
      sprayAt(x, y)
    },
    up: () => { last.current = null },
    activate: (x, y) => sprayAt(x, y),
    cursor: 'crosshair',
  }

  const clear = () => {
    scene.current.b.count = 0
    scene.current.round.fill(0)
    setVersion((v) => v + 1)
  }

  return (
    <LessonShell
      id="paint"
      intro={<p>Every splat so far was made for you. What does it take to make one by hand, and how many blobs does a surface need?</p>}
      view={
        <Viewport
          bare
          blobs={b}
          version={version}
          orbit={orbit}
          setOrbit={setOrbit}
          onView={(v) => { setView(v); v.setFloor(true, '#8a8070') }}
          tool={tool}
          label="A floor with a square marked on it. Drag to spray blobs, or press Enter to spray in the middle. Right-drag, the arrow keys or the camera sliders turn the view."
          hint="drag to spray · right-drag to orbit"
          overlay={(ctx, lens) => {
            const corners = [[-HALF, 0, -HALF], [HALF, 0, -HALF], [HALF, 0, HALF], [-HALF, 0, HALF]].map((p) => toScreen(p, lens))
            if (corners.some((c) => !c)) return
            ctx.setLineDash([6, 5])
            ctx.lineWidth = 1.5
            ctx.strokeStyle = themeColour('accent', ctx.canvas)
            ctx.beginPath()
            corners.forEach((c, k) => (k ? ctx.lineTo(c![0], c![1]) : ctx.moveTo(c![0], c![1])))
            ctx.closePath()
            ctx.stroke()
            ctx.setLineDash([])
          }}
        />
      }
      caption={
        <p>
          <span className="tabular-nums text-ink" data-testid="blob-count">{b.count.toLocaleString()}</span> blobs cover{' '}
          <span className="tabular-nums text-ink" data-testid="coverage">{Math.round(covered * 100)}%</span> of the dashed square.
          {b.count >= MAX && ' That is as many as this lesson holds: clear it to start again.'}
        </p>
      }
      groups={[
        {
          id: 'brush',
          title: 'Brush',
          note: 'what each dab puts down',
          span: 2,
          cols: 2,
          content: (
            <>
              <Slider label="Blob size" value={size} min={0.02} max={0.35} step={0.005} onChange={setSize} format={(v) => v.toFixed(3)} />
              <Slider label="Blobs per dab" value={perDab} min={1} max={30} step={1} onChange={setPerDab} format={(v) => `${v}`} />
            </>
          ),
        },
        {
          id: 'kind',
          title: 'Blobs',
          note: 'and starting over',
          content: (
            <>
              <Toggle label="Flat discs on the floor" checked={flat} onChange={setFlat} />
              <div><Button small onClick={clear}>Clear the floor</Button></div>
            </>
          ),
        },
        {
          id: 'camera',
          title: 'Camera',
          note: 'or right-drag the view',
          span: 2,
          cols: 2,
          content: (
            <>
              <Slider label="Turn" value={Math.round(orbit.azimuth)} min={-180} max={180} step={1} onChange={(azimuth) => setOrbit((o) => ({ ...o, azimuth }))} format={(v) => `${v}°`} />
              <Slider label="Height" value={Math.round(orbit.elevation)} min={1} max={85} step={1} onChange={(elevation) => setOrbit((o) => ({ ...o, elevation }))} format={(v) => `${v}°`} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['paint']}
      done={done}
      scene={() => b}
      explainTitle="Coverage is a trade"
      explain={
        <>
          <p>
            Each blob you sprayed is a soft patch that fades out from its centre. Where enough patches overlap, light can't get through,
            and you see a surface. The square was covered when almost every spot in it had several blobs on top.
          </p>
          <p>
            Big blobs got there with fewer than 150, but each one is a single colour, so any detail smaller than a blob is gone. Real
            captures make the other choice: hundreds of thousands of small blobs, packed most tightly where the detail is.
          </p>
          <p>
            Edge-on, flat discs nearly vanish into the floor, the way a real surface does. Round balls stood up out of it as bumps.
            That's why training squashes most blobs flat. Next: where real splats come from, and what their files hold.
          </p>
        </>
      }
    />
  )
}
