import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Blobs } from '../../splat-core/blobs.ts'
import { srgbToLinear } from '../../splat-core/colour.ts'
import type { Orbit, SplatView } from '../../splat-core/view.ts'
import { makeCreature, poseWalk } from '../../splat-engine/creature.ts'
import { recordClip, writeRiggedGlb, writeRiggedMeshGlb } from '../../splat-engine/glb.ts'
import { blobsToMesh, meshError, skinMesh, type SplatMesh } from '../../splat-engine/mesh.ts'
import { poseBlobs } from '../../splat-engine/pose.ts'
import { Button, Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport, ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { download, kb } from '../files.ts'

const START: Orbit = { target: [0, 0.7, 0], distance: 4.6, azimuth: 55, elevation: 14 }
const start = (): Orbit => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? { ...START, distance: 6.8 } : START)
const GRIDS = [16, 24, 32, 48, 64, 96]
const STRIDE = 1 / 1.4
const NONE = new Blobs(1)

/** A three.js mesh for a SplatMesh, with colours made linear as three.js expects. */
function toThree(m: SplatMesh) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.positions.slice(), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals.slice(), 3))
  g.setAttribute('color', new THREE.BufferAttribute(m.colours.map(srgbToLinear), 3))
  g.setIndex(new THREE.BufferAttribute(m.indices, 1))
  g.computeBoundingSphere()
  return g
}

export function Model() {
  const [orbit, setOrbit] = useState<Orbit>(start)
  const [cells, setCells] = useState(48)
  const [level, setLevel] = useState(1)
  // The mesh is rebuilt from the level a moment after the slider stops, not on every step of a drag
  const [meshLevel, setMeshLevel] = useState(1)
  useEffect(() => { const t = setTimeout(() => setMeshLevel(level), 160); return () => clearTimeout(t) }, [level])
  const [walking, setWalking] = useState(false)
  const [wire, setWire] = useState(false)

  const fox = useMemo(() => makeCreature(8000), [])
  const shown = useMemo(() => fox.blobs.clone(), [fox])
  const trot = useMemo(() => {
    const clip = recordClip('trot', fox.skeleton, poseWalk, STRIDE, 24)
    fox.skeleton.reset()
    fox.skeleton.update()
    return clip
  }, [fox])
  const splatGlb = useMemo(() => writeRiggedGlb({ name: 'blob fox', ...fox, clips: [trot] }), [fox, trot])

  const mesh = useMemo(() => blobsToMesh(fox.blobs, fox.skin, { cells, level: meshLevel }), [fox, cells, meshLevel])
  const error = useMemo(() => meshError(mesh, fox.blobs), [mesh, fox])
  const meshGlb = useMemo(() => writeRiggedMeshGlb({ name: 'blob fox', mesh, skeleton: fox.skeleton, clips: [trot] }), [mesh, fox, trot])

  // The mesh lives in the right-hand view's scene, next to its (empty) splat
  const meshView = useRef<SplatView | null>(null)
  const splatView = useRef<SplatView | null>(null)
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

  // Walking: both trot from the same clip, the blobs posed on the CPU, the mesh skinned the way a game engine would
  const live = useRef({ walking, mesh })
  live.current = { walking, mesh }
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const pos = { buf: new Float32Array(0), nrm: new Float32Array(0) }
    const tick = (now: number) => {
      const { walking: on, mesh: m } = live.current
      const sk = fox.skeleton
      if (on) poseWalk(sk, (now - t0) / 1000)
      else { sk.reset(); sk.update() }
      poseBlobs(fox.blobs, fox.skin, sk, 'quat', shown)
      void splatView.current?.sync(shown)
      if (pos.buf.length !== m.positions.length) { pos.buf = new Float32Array(m.positions.length); pos.nrm = new Float32Array(m.normals.length) }
      skinMesh(m, sk, pos.buf, pos.nrm)
      const g = object.geometry
      const pa = g.getAttribute('position') as THREE.BufferAttribute | undefined
      if (pa && pa.array.length === pos.buf.length) {
        ;(pa.array as Float32Array).set(pos.buf)
        pa.needsUpdate = true
        const na = g.getAttribute('normal') as THREE.BufferAttribute
        ;(na.array as Float32Array).set(pos.nrm)
        na.needsUpdate = true
        meshView.current?.invalidate(1)
      }
      if (on) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [walking, mesh, fox, shown, object])

  const done = useGoals('model', {
    pieces: mesh.pieces >= 3,
    coarse: error >= 0.08 && mesh.pieces >= 1,
    keep: mesh.pieces === 1 && Math.round(error * 100) <= 5 && meshGlb.byteLength <= 300 * 1024,
  })

  const half = (title: string, testId: string, node: React.ReactNode) => (
    <figure className="relative h-full min-w-0" data-testid={testId}>
      {node}
      <figcaption className="pointer-events-none absolute bottom-2.5 left-3 text-xs font-medium text-ink-muted sm:text-sm">{title}</figcaption>
    </figure>
  )

  return (
    <LessonShell
      id="model"
      intro={<p>Blender, Godot and Unity all open a .glb file, and most of them draw triangles, not blobs. What survives the trip from a cloud of blobs to a solid model?</p>}
      view={
        <div className="relative h-full">
          <div className="grid h-full grid-cols-2 divide-x divide-rule-soft">
            {half('Splats', 'splat-view', (
              <Viewport bare noZoom blobs={shown} version={0} orbit={orbit} setOrbit={setOrbit}
                onView={(v) => { splatView.current = v; v.setFloor(true, '#8a8a8a') }}
                label={`The blob fox as ${fox.blobs.count.toLocaleString()} splats${walking ? ', trotting' : ''}. Drag or use the arrow keys to orbit.`} />
            ))}
            {half(`Mesh, ${mesh.triangleCount.toLocaleString()} triangles`, 'mesh-view', (
              <Viewport bare noZoom blobs={NONE} version={0} orbit={orbit} setOrbit={setOrbit}
                onView={(v) => { meshView.current = v; v.setFloor(true, '#8a8a8a'); v.scene.add(object); v.invalidate(2) }}
                label={`The same fox as a solid mesh of ${mesh.triangleCount.toLocaleString()} triangles in ${mesh.pieces} piece${mesh.pieces === 1 ? '' : 's'}${walking ? ', trotting' : ''}. Drag or use the arrow keys to orbit.`} />
            ))}
          </div>
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(start)} />
        </div>
      }
      caption={
        <p data-testid="mesh-readout">
          The mesh is <span className="tabular-nums text-ink">{mesh.pieces}</span> piece{mesh.pieces === 1 ? '' : 's'}, on average{' '}
          <span className="tabular-nums text-ink">{Math.round(error * 100)} cm</span> from the blobs, and{' '}
          <span className="tabular-nums text-ink">{kb(meshGlb.byteLength)}</span> as a .glb. The splats are {kb(splatGlb.byteLength)}.
        </p>
      }
      groups={[
        {
          id: 'grid',
          title: 'Grid',
          note: 'cells along the fox',
          content: (
            <Field label="Cells">
              <div className="flex flex-wrap gap-1.5">
                {GRIDS.map((g) => <Chip key={g} active={cells === g} onClick={() => setCells(g)}>{g}</Chip>)}
              </div>
            </Field>
          ),
        },
        {
          id: 'surface',
          title: 'Surface',
          note: 'how dense counts as solid',
          content: <Slider label="Level" value={level} min={0.5} max={10} step={0.1} onChange={setLevel} format={(v) => `×${v.toFixed(1)}`} />,
        },
        {
          id: 'show',
          title: 'Show',
          content: (
            <>
              <Toggle label="Trot" checked={walking} onChange={setWalking} />
              <Toggle label="Triangles" checked={wire} onChange={setWire} />
            </>
          ),
        },
        {
          id: 'export',
          title: 'Download',
          note: 'with bones and the trot',
          content: (
            <div className="flex flex-wrap gap-2">
              <Button small onClick={() => download(splatGlb, 'blob-fox-splats.glb')}>Splats .glb ({kb(splatGlb.byteLength)})</Button>
              <Button small onClick={() => download(meshGlb, 'blob-fox-mesh.glb')}>Mesh .glb ({kb(meshGlb.byteLength)})</Button>
            </div>
          ),
        },
      ]}
      goals={LESSON_GOALS['model']}
      done={done}
      scene={() => shown}
      explainTitle="Two files, two trade-offs"
      explain={
        <>
          <p>
            The mesh is a skin wrapped wherever the blobs are dense enough. Raise that level and thin legs fall under it first. Make
            the grid coarse and anything thinner than a cell melts into a lump. Fine grids cost triangles, and triangles cost
            bytes, so a good mesh is the coarsest one that keeps what matters.
          </p>
          <p>
            Either way the mesh loses what made the fox a splat: soft edges, see-through fur, the colour of every single blob. The
            splat .glb keeps all of that, using the KHR_gaussian_splatting standard, with the bones and trot in standard glTF and a
            small extension of ours saying how a skinned blob turns. Today most viewers show it standing still. The mesh walks in
            any of them. That's why Creature, next door, saves both.
          </p>
        </>
      }
    />
  )
}
