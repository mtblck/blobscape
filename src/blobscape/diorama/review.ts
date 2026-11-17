import { checkScene, compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { MAX_MUD, MIN_VALUE_RANGE, loopSnaps, partClashes, valuesOf } from '../../splat-engine/sceneChecks.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { DETAIL } from './scene.ts'

/**
 * A scene description looked over before anyone looks at it: everything that can be told without a picture, as lines
 * a person or an assistant can act on. The same checks the site's own scenes must pass (`scenes.test.ts`), for a
 * description that isn't in the site: the page's Open a description and `npm run scene` both use it.
 */
export interface Review {
  /** What must be fixed, each as `where: what`. With any of these the scene isn't shown. */
  problems: string[]
  /** What will probably look wrong, but still draws. */
  warnings: string[]
  /** What was measured, when the description was sound enough to cut. */
  facts?: { name: string; parts: number; bones: number; blobs: number; loop: number; colors: number; dark: number; light: number; mud: number; seconds: number }
}

/** The most blobs a scene should cut to at the coarsest detail: more and the finest detail is too heavy for a phone. */
export const MOST_BLOBS = 60000

/** The largest description read, in bytes: the site's biggest is under a tenth of this. */
export const MOST_BYTES = 1_000_000

const where = (doc: SceneDoc, i: number) => {
  const p = doc.parts[i]
  return `parts[${i}] (${p?.shape.kind ?? 'part'}${p?.bone ? ` on bone '${p.bone}'` : ''})`
}

/** Reads a description from text: the scene, or why it can't be one. */
export function readScene(text: string): { doc?: SceneDoc; problems: string[] } {
  if (text.length > MOST_BYTES) return { problems: [`file: over ${MOST_BYTES / 1000} KB, which no scene needs`] }
  let doc: unknown
  try { doc = JSON.parse(text) } catch (e) { return { problems: [`file: not JSON (${e instanceof Error ? e.message : String(e)})`] } }
  let problems: string[]
  // shapes nested thousands deep run the checker out of stack: no scene is, so it is turned away like any other mistake
  try { problems = checkScene(doc) } catch (e) { return { problems: [`file: could not be checked (${e instanceof Error ? e.message : String(e)})`] } }
  return problems.length ? { problems } : { doc: doc as SceneDoc, problems }
}

/**
 * Checks a description, cuts it at `spacing` (the coarsest detail unless given) and measures what was cut: parts
 * that caught no blobs, values that read as one tone, gray mud, anything that snaps as it loops, and parts that pass
 * through each other as it plays.
 */
export function reviewScene(doc: unknown, spacing: number = DETAIL[0].spacing): Review {
  let problems: string[]
  try { problems = checkScene(doc) } catch (e) { return { problems: [`file: could not be checked (${e instanceof Error ? e.message : String(e)})`], warnings: [] } }
  if (problems.length) return { problems, warnings: [] }
  const scene = doc as SceneDoc
  const warnings: string[] = []
  const started = Date.now()
  let c, built
  try {
    c = compileScene(scene)
    built = buildVoxels(c.spec(spacing))
  } catch (e) {
    return { problems: [`build: ${e instanceof Error ? e.message : String(e)}`], warnings }
  }
  const seconds = (Date.now() - started) / 1000
  for (const i of c.empty(built)) problems.push(`${where(scene, i)}: caught no blobs. It is thinner than the grid, sits inside another part on the same bone, or a cut swallows it`)
  const v = valuesOf(built.blobs)
  if (v.light - v.dark < MIN_VALUE_RANGE) problems.push(`palette: the scene's lightest and darkest blobs are too close (${v.dark.toFixed(2)} to ${v.light.toFixed(2)}, need ${MIN_VALUE_RANGE} apart): it reads as one tone. Add darker shade steps or a lighter subject`)
  if (v.mud > MAX_MUD) problems.push(`palette: ${Math.round(v.mud * 100)}% of the blobs are colorless mid-gray (at most ${Math.round(MAX_MUD * 100)}%). Give the grays a hue or move them lighter or darker`)
  for (const s of loopSnaps(built.skeleton, c.pose, c.loop)) problems.push(`moves: bone '${s.bone}' jumps at ${s.at.toFixed(2)} s. Every move must fit a whole number of times into the loop and end where it began`)
  for (const k of partClashes(built, c.pose, c.loop, spacing)) if (!c.touching.includes(k.part) && !c.touching.includes(k.into)) problems.push(`${where(scene, k.part)}: passes through ${where(scene, k.into)} at ${k.at.toFixed(2)} s (${k.blobs} blobs inside). Move it clear, shorten it, make its swing smaller, or mark it touches if they are meant to meet`)
  const [l0, l1] = [c.lights(0.9), c.lights(0.9 + c.loop)]
  if (l0.some((l, i) => [...l.position, ...l.color].some((x, j) => Math.abs(x - [...l1[i].position, ...l1[i].color][j]) > 1e-6))) problems.push('lights: a light is not where it started when the loop comes round')
  if (built.blobs.count > MOST_BLOBS) warnings.push(`size: ${built.blobs.count.toLocaleString('en-US')} blobs at the coarsest detail (the site's scenes stay under ${MOST_BLOBS.toLocaleString('en-US')}). Open ground or water only spends blobs: make the subject fill the scene, or give it a focus`)
  if (seconds > 20) warnings.push(`build: took ${seconds.toFixed(0)} s. Mark small parts noShadow, and keep far-apart shapes in separate parts rather than one join`)
  if (!scene.bones?.length) warnings.push('bones: nothing moves. Give the things people would poke (trees, creatures, lamps) a bone and a small move')
  return {
    problems, warnings,
    facts: {
      name: c.name, parts: scene.parts.length, bones: scene.bones?.length ?? 0, blobs: built.blobs.count, loop: c.loop, colors: c.palette.length,
      dark: v.dark, light: v.light, mud: v.mud, seconds,
    },
  }
}
