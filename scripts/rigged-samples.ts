/**
 * Writes the sample files for docs/rigged-splats.md: small rigged splat .glb
 * files from the creature zoo, every move recorded as a clip.
 *
 *   node --experimental-strip-types scripts/rigged-samples.ts
 */
import { writeFileSync } from 'node:fs'
import { ZOO } from '../src/splat-engine/zoo/index.ts'
import { recordClip, writeRiggedGlb } from '../src/splat-engine/glb.ts'

const out = new URL('../public/rigged-splats/', import.meta.url)
for (const [id, count] of [['fox', 4000], ['frog', 4000]] as const) {
  const sp = ZOO.find((s) => s.id === id)!
  const body = sp.make(count, sp.looks[0].id)
  const clips = sp.moves.map((m) => recordClip(m.name, body.skeleton, m.pose, m.seconds, m.fps ?? 24))
  body.skeleton.reset()
  body.skeleton.update()
  const bytes = writeRiggedGlb({ name: `blob ${sp.name}`, ...body, clips })
  writeFileSync(new URL(`${id}.glb`, out), bytes)
  console.log(`${id}.glb: ${body.blobs.count} blobs, ${body.skeleton.count} bones, clips ${clips.map((c) => c.name).join(', ')}, ${(bytes.byteLength / 1024).toFixed(0)} KB`)
}
