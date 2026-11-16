import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Blobs } from '../../splat-core/blobs.ts'
import { srgbToLinear } from '../../splat-core/color.ts'
import type { Orbit, SplatView } from '../../splat-core/view.ts'
import { blobsToMesh, meshError, type SplatMesh } from '../../splat-engine/mesh.ts'
import { Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS, href } from '../routes.ts'
import { Viewport, ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { kb } from '../files.ts'
import { BLADES, SUBJECTS, type SubjectId } from '../fuzzy/subjects.ts'
import { tidyBlock } from '../fuzzy/tidy.ts'
import { SPLAT_BYTES, lightThroughMesh, lightThroughSplats, meshBytes, pointsKeptByMesh, pointsKeptBySplats } from '../fuzzy/measure.ts'

const START: Orbit = { target: [0, 0.4, 0], distance: 2.2, azimuth: 25, elevation: 12 }
const start = (): Orbit => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? { ...START, distance: 3.2 } : START)
const GRIDS = [16, 32, 48, 64, 96]
/** Blob counts the slider steps through: a log scale from 100 to 16,000. */
const COUNTS = [100, 150, 200, 300, 450, 700, 1000, 1500, 2200, 3200, 4500, 6500, 9000, 12000, 16000]
const NONE = new Blobs(1)

const KINDS: { id: SubjectId; name: string; what: string }[] = [
  { id: 'grass', name: 'Grass', what: 'a tuft of grass' },
  { id: 'fluff', name: 'Dandelion clock', what: 'a dandelion clock' },
  { id: 'block', name: 'Wooden block', what: 'a painted wooden block' },
]

/** Whether a mesh kept any of the dandelion's fluff: surface out past the solid center, up in the head. */
function hasFluff(m: SplatMesh) {
  for (let i = 0; i < m.vertexCount; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1] - 0.72, z = m.positions[i * 3 + 2]
    if (y > -0.05 && Math.hypot(x, y, z) > 0.11) return true
  }
  return false
}

/** A ray across the dandelion's fluff, above its solid center, for measuring how much light gets through. */
const RAY: [[number, number, number], [number, number, number]] = [[-0.6, 0.87, 0.03], [0.6, 0.87, 0.03]]

function toThree(m: SplatMesh) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.positions.slice(), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals.slice(), 3))
  g.setAttribute('color', new THREE.BufferAttribute(m.colors.map(srgbToLinear), 3))
  g.setIndex(new THREE.BufferAttribute(m.indices, 1))
  g.computeBoundingSphere()
  return g
}

export function Fuzzy() {
  const [orbit, setOrbit] = useState<Orbit>(start)
  const [kind, setKind] = useState<SubjectId>('grass')
  const [step, setStep] = useState(9)
  const [cells, setCells] = useState(32)
  const [wire, setWire] = useState(false)
  const [tidy, setTidy] = useState(false)
  const count = COUNTS[step]

  const subject = useMemo(() => SUBJECTS[kind](count), [kind, count])
  // The mesh is always wrapped round a well-sampled capture, so only its own grid limits it
  const full = useMemo(() => SUBJECTS[kind](6500), [kind])
  const tidied = kind === 'block' && tidy
  const mesh = useMemo(() => (tidied ? tidyBlock() : blobsToMesh(full.blobs, null, { cells, level: 1 })), [full, cells, tidied])

  const splatSize = subject.blobs.count * SPLAT_BYTES
  const meshSize = meshBytes(mesh)
  const tips = useMemo(() => (kind === 'grass' ? { splats: pointsKeptBySplats(subject.blobs, subject.tips), mesh: pointsKeptByMesh(mesh, full.tips) } : null), [kind, subject, mesh, full])
  const light = useMemo(() => (kind === 'fluff' ? { splats: lightThroughSplats(subject.blobs, ...RAY), mesh: lightThroughMesh(mesh, ...RAY), meshFluff: hasFluff(mesh) } : null), [kind, subject, mesh])
  const error = useMemo(() => (kind === 'block' && !tidied ? meshError(mesh, full.blobs) : null), [kind, mesh, full, tidied])

  const meshView = useRef<SplatView | null>(null)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true }), [])
  const object = useMemo(() => new THREE.Mesh(new THREE.BufferGeometry(), material), [material])
  useEffect(() => {
    const old = object.geometry
    object.geometry = toThree(mesh)
    old.dispose()
    meshView.current?.invalidate(2)
  }, [mesh, object])
  useEffect(() => { material.wireframe = wire; meshView.current?.invalidate(2) }, [wire, material])
  useEffect(() => () => { object.geometry.dispose(); material.dispose() }, [object, material])

  const done = useGoals('fuzzy', {
    blades: kind === 'grass' && cells >= 96 && tips?.mesh === 0,
    tiny: kind === 'grass' && splatSize <= 10 * 1024 && tips?.splats === BLADES,
    fluff: kind === 'fluff' && !!light && light.splats >= 0.2 && (!light.meshFluff || light.mesh === 0),
    block: tidied && meshSize * 20 < splatSize,
  })

  const what = KINDS.find((k) => k.id === kind)!
  const half = (title: string, testId: string, node: React.ReactNode) => (
    <figure className="relative h-full min-w-0" data-testid={testId}>
      {node}
      <figcaption className="pointer-events-none absolute bottom-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <LessonShell
      id="fuzzy"
      intro={<p>Scan something and you can keep it as splats or wrap a solid mesh round it. Which keeps grass, fluff and a wooden block best, and which costs fewer bytes?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            {half(`Splats, ${kb(splatSize)}`, 'splat-view', (
              <Viewport bare noZoom blobs={subject.blobs} version={0} orbit={orbit} setOrbit={setOrbit}
                onView={(v) => v.setFloor(true, '#8a8a8a')}
                label={`${what.what} as ${subject.blobs.count.toLocaleString()} splats. Drag or use the arrow keys to orbit.`} />
            ))}
            {half(`Mesh, ${kb(meshSize)}`, 'mesh-view', (
              <Viewport bare noZoom blobs={NONE} version={0} orbit={orbit} setOrbit={setOrbit}
                onView={(v) => { meshView.current = v; v.setFloor(true, '#8a8a8a'); v.scene.add(object); v.invalidate(2) }}
                label={`The same ${what.name.toLowerCase()} as a mesh of ${mesh.triangleCount.toLocaleString()} triangles. Drag or use the arrow keys to orbit.`} />
            ))}
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start)} />
        </div>
      }
      caption={
        <p data-testid="fuzzy-readout" className="tabular-nums">
          {tips && <>Blade tips kept: splats <b className="text-ink">{tips.splats} of {BLADES}</b>, mesh <b className="text-ink">{tips.mesh} of {BLADES}</b>.</>}
          {light && <>Light getting through the fluff: splats <b className="text-ink">{pct(light.splats)}</b>, mesh {light.meshFluff ? <b className="text-ink">{pct(light.mesh)}</b> : <b className="text-ink">no fluff left</b>}.</>}
          {kind === 'block' && (tidied
            ? <>Merged into flat faces: <b className="text-ink">{mesh.triangleCount} triangles</b>, every edge sharp, <b className="text-ink">{kb(meshSize)}</b> against the splats’ {kb(splatSize)}.</>
            : <>The mesh is on average <b className="text-ink">{((error ?? 0) * 100).toFixed(1)} cm</b> from the blobs, in {mesh.triangleCount.toLocaleString()} triangles.</>)}
        </p>
      }
      groups={[
        {
          id: 'thing',
          title: 'Thing',
          note: 'what was scanned',
          content: (
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.name}</Chip>)}
            </div>
          ),
        },
        {
          id: 'splats',
          title: 'Splats',
          note: 'how many blobs',
          content: <Slider label="Blobs" value={step} min={0} max={COUNTS.length - 1} step={1} onChange={setStep} format={() => `${subject.blobs.count.toLocaleString()} · ${kb(splatSize)}`} />,
        },
        {
          id: 'mesh',
          title: 'Mesh',
          note: 'grid cells across',
          content: (
            <>
              <Field label="Grid">
                <div className="flex flex-wrap gap-1.5">
                  {GRIDS.map((g) => <Chip key={g} active={!tidied && cells === g} onClick={() => { setCells(g); setTidy(false) }}>{g}</Chip>)}
                </div>
              </Field>
              {kind === 'block' && <Toggle label="Merge flat faces" checked={tidy} onChange={setTidy} />}
              <Toggle label="Show triangles" checked={wire} onChange={setWire} />
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['fuzzy']}
      done={done}
      scene={() => subject.blobs}
      explainTitle="A surface is there or it isn’t"
      explain={
        <>
          <p>
            A mesh is a skin: every point of it is solid, and it has to wrap round some volume. A grass blade is thinner than any grid
            cell a scan can afford, so the skin can't close round it, and the blades melt into the clump at the bottom. One flat blob,
            though, is a whole stretch of blade, so a few hundred blobs keep every one.
          </p>
          <p>
            Fluff is worse for a mesh. Each blob carries its own opacity, so a cloud of faint ones lets some light through, the way the
            real seed head does. The skin round the same cloud is either solid or nothing at all, and here the fluff is simply gone. Hair, fur, foliage,
            smoke and frosted glass all go the same way, which is why scans of them are where splats look most like a photo. Growing fur and grass from scratch, a strand at a time, is <a href={href({ page: 'lesson', id: 'fur' })} className="text-accent underline underline-offset-2">Fur and grass</a>.
          </p>
          <p>
            The block is the other way round. Flat faces and sharp corners are exactly what triangles are for: merge the flat faces, as
            a modeler or a tidying tool would, and a few dozen triangles keep every edge and stripe sharp at a fraction of the splats'
            size. It's a clean solid a game can light, collide with and edit. The splat block only ever has soft edges. So the honest rule is: scan fuzzy, thin and see-through things as splats; model hard, flat things as meshes.
          </p>
        </>
      }
    />
  )
}
