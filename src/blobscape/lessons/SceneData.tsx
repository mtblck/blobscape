import { useEffect, useMemo, useState } from 'react'
import type { Orbit } from '../../splat-core/orbit.ts'
import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'
import type { Stage } from '../../splat-engine/stage.ts'
import type { Built } from '../../splat-engine/body.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { Button } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { ZoomBar } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'
import { StageView } from '../build/StageView.tsx'
import { SCENE_SPACING, SCENE_START, brokeTheLoop, docText, lanternFlickers, readDoc, sceneCode, shapeKey, swaying } from '../build/scene.ts'

const START_TEXT = docText(SCENE_START)
/** How long after the last key the description is read again. */
const SETTLE = 500

declare global { interface Window { __scene?: { stage: Stage; type: (text: string) => void; text: () => string } } }

export function SceneData() {
  const [text, setText] = useState(START_TEXT)
  // what is read: the text once typing has paused
  const [settled, setSettled] = useState(START_TEXT)
  useEffect(() => {
    if (text === settled) return
    const t = setTimeout(() => setSettled(text), SETTLE)
    return () => clearTimeout(t)
  }, [text, settled])
  const read = useMemo(() => readDoc(settled), [settled])

  // the view keeps the last sound description while the text has mistakes in it
  const [good, setGood] = useState(() => ({ doc: SCENE_START, scene: readDoc(START_TEXT).scene! }))
  useEffect(() => { if (read.scene) setGood({ doc: read.doc as SceneDoc, scene: read.scene }) }, [read])

  // the blobs are cut again only when what they are cut from changes; moves and lights only pose them
  const key = shapeKey(good.doc)
  const [built, setBuilt] = useState<{ key: string; built: Built }>()
  const [cutting, setCutting] = useState(true)
  useEffect(() => {
    if (built?.key === key) return
    setCutting(true)
    const scene = good.scene
    const t = setTimeout(() => { setBuilt({ key, built: buildVoxels(scene.spec(SCENE_SPACING)) }); setCutting(false) }, 60)
    return () => clearTimeout(t)
  }, [key, good, built])

  const [orbit, setOrbit] = useState<Orbit>(SCENE_START.camera)
  const [stage, setStage] = useState<Stage>()
  useEffect(() => { if (stage && built) stage.setActor(built.built) }, [stage, built])
  useEffect(() => {
    if (!stage || !built) return
    const scene = good.scene
    stage.setPoser((sk, t) => { scene.pose(sk, t); stage.setLights(scene.lights(t)) })
  }, [stage, built, good])

  useEffect(() => {
    if (!stage) return
    window.__scene = { stage, type: setText, text: () => text }
    return () => { delete window.__scene }
  })

  const done = useGoals('scene-data', {
    sway: swaying(good.doc),
    loop: brokeTheLoop(read.errors),
    light: lanternFlickers(good.doc),
  })
  const moves = good.doc.moves?.length ?? 0, lights = good.doc.lights?.length ?? 0
  const bytes = new TextEncoder().encode(JSON.stringify(good.doc)).length

  return (
    <LessonShell
      id="scene-data"
      intro={<p>The pixel scenes on this site aren&rsquo;t code. Each is a page of data: shapes, paints, bones and moves. Here is a small one. What does the engine ask of a description before it will play it?</p>}
      view={
        <div className="relative h-full">
          <StageView
            orbit={orbit}
            setOrbit={setOrbit}
            onStage={setStage}
            label={`${good.doc.name}: a cottage, a tree, and a lantern on a post, ${moves ? `with ${moves} move${moves > 1 ? 's' : ''}` : 'standing still'}${lights ? ` and ${lights} live light${lights > 1 ? 's' : ''}` : ''}.`}
            waiting={cutting ? 'Cutting the scene into blobs…' : undefined}
          />
          <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => setOrbit(good.doc.camera)} />
        </div>
      }
      caption={
        <p data-testid="scene-readout">
          <span className="tabular-nums text-ink">{good.doc.parts.length}</span> parts, <span className="tabular-nums text-ink">{moves}</span> {moves === 1 ? 'move' : 'moves'} and{' '}
          <span className="tabular-nums text-ink">{lights}</span> {lights === 1 ? 'light' : 'lights'} in <span className="tabular-nums text-ink">{(bytes / 1024).toFixed(1)} KB</span> of text,
          cut into <span className="tabular-nums text-ink">{(built?.built.blobs.count ?? 0).toLocaleString()}</span> blobs. It all comes round every{' '}
          <span className="tabular-nums text-ink">{good.scene.loop}</span> seconds.
        </p>
      }
      groups={[
        {
          id: 'scene',
          title: 'Description',
          note: 'JSON: edit it',
          span: 2,
          content: (
            <textarea
              data-testid="scene-text"
              aria-label="The scene's description, as JSON"
              aria-describedby="scene-problems"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              className="h-[26rem] w-full resize-y rounded-lg border border-rule bg-paper p-3 font-mono text-[0.78rem] leading-relaxed text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          ),
        },
        {
          id: 'checker',
          title: 'Checker',
          note: 'what it says',
          content: (
            <div className="flex flex-col gap-3">
              <div id="scene-problems" role="status" data-testid="scene-problems" className="min-h-24 text-sm">
                {text !== settled ? (
                  <p className="text-ink-faint">Reading…</p>
                ) : read.errors.length ? (
                  <>
                    <p className="text-ink">The view keeps the last scene that was sound. The checker says:</p>
                    <ul className="mt-2 space-y-1.5">
                      {read.errors.slice(0, 8).map((e) => <li key={e} className="font-mono text-[0.78rem] break-words text-accent">{e}</li>)}
                    </ul>
                    {read.errors.length > 8 && <p className="mt-1.5 text-ink-faint">and {read.errors.length - 8} more</p>}
                  </>
                ) : (
                  <p className="text-ink-muted">Sound: nothing to say. The view shows it.</p>
                )}
              </div>
              <div>
                <Button small disabled={text === START_TEXT} onClick={() => setText(START_TEXT)}>Start again</Button>
              </div>
            </div>
          ),
        },
      ]}
      goals={LESSON_GOALS['scene-data']}
      done={done}
      scene={() => built?.built.blobs ?? buildVoxels(good.scene.spec(SCENE_SPACING)).blobs}
      explainTitle="A scene is a description, checked, then compiled"
      formula={{
        eq: <>times × period = loop</>,
        terms: [
          ['loop', 'seconds before the whole scene starts over'],
          ['times', 'how often a move repeats in that loop: a whole number'],
          ['period', 'how long one sway, flicker or turn takes'],
        ],
      }}
      explain={
        <>
          <p>
            A description says what is there, not how to draw it. Each part is a shape (a box, a ball, a roof, a cylinder) and a
            paint (a color, bricks, speckles, one paint on top and another on the sides). A part with no bone is land and stands
            still; a part on a bone goes where the bone goes. A bone does nothing until a move names it.
          </p>
          <p>
            Before anything is cut, the checker reads the whole description and says what is wrong and where, as{' '}
            <code>moves[0].times: must be a whole number</code>. Then the compiler turns it into the shapes the grid is cut from,
            a poser that sets every bone from the time, and the live lights. Change a move or a light and only the pose changes;
            change a shape and the scene is cut again.
          </p>
          <p>
            Every move fits a whole number of times into the loop, so at the end of the loop every bone is where it started and the
            scene runs for ever with no seam. That&rsquo;s also why the same moment always looks the same, and why a loop can be
            recorded once and played as a picture. Because it is only text, a description can be checked before it runs, kept in a
            file, and written from a sentence.
          </p>
        </>
      }
      code={{
        title: 'This scene, as code',
        note: (
          <>
            <p>The last sound description in the box, played with the engine package. The description could as well be read from a .json file.</p>
            <p>Install it with <code>npm install @blobscape/engine three</code>. Every shape, paint and move is in the{' '}
              <a href="https://github.com/mtblck/blobscape/blob/main/docs/scene-descriptions.md" className="text-accent underline underline-offset-2">guide to scene descriptions</a>.
            </p>
          </>
        ),
        source: sceneCode(good.doc),
      }}
    />
  )
}
