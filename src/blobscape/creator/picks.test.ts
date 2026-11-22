import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TURKEY } from '../diorama/scenes/turkey.ts'
import { checkScene, compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { checkProject, compileProject, mergedSpec, pickedParts, propSpec, landSpec, splitScene, type PropPick } from '../../splat-engine/project.ts'
import { TURKEY_PICKS } from './picks.ts'

const CHUNKY = 0.042
const scenes: [string, SceneDoc, PropPick[]][] = [['turkey', TURKEY, TURKEY_PICKS]]

for (const [id, doc, picks] of scenes) {
  test(`${id}: every pick takes parts no other pick takes`, () => {
    const seen = new Set<number>()
    for (const p of picks) {
      const parts = pickedParts(doc, p)
      assert.ok(parts.length > 0, `${p.name} takes nothing`)
      for (const i of parts) { assert.ok(!seen.has(i), `${p.name} takes part ${i} again`); seen.add(i) }
    }
  })

  test(`${id}: the land and every prop are sound descriptions that cut to something and stand on the ground`, () => {
    const { land, props, project } = splitScene(doc, picks)
    assert.deepEqual(checkScene(land.doc), [])
    for (const p of props) {
      assert.deepEqual(checkScene(p.doc), [], p.name)
      const built = buildVoxels(compileScene(p.doc, { puffs: false }).spec(CHUNKY))
      assert.ok(built.blobs.count > 10, // the duck is a dozen blobs at the coarsest detail
        `${p.name}: ${built.blobs.count} blobs`)
      assert.ok(p.foot[1] > -0.1 && p.foot[1] < 0.3, `${p.name} stands at ${p.foot[1]}`)
    }
    assert.deepEqual(checkProject(JSON.parse(JSON.stringify(project)), () => false), [])
  })

  test(`${id}: split and merged where they stood, it cuts as it did whole`, () => {
    const whole = buildVoxels(compileScene(doc).spec(CHUNKY, compileScene(doc).steps ? compileScene(doc).palette : undefined)).blobs.count
    const cp = compileProject(splitScene(doc, picks).project, () => undefined)
    const merged = buildVoxels(mergedSpec(cp, CHUNKY).spec).blobs.count
    assert.ok(Math.abs(merged / whole - 1) < 0.02, `whole ${whole}, merged ${merged}`)
    // apart, nothing is culled between the land and what stands on it, so a little more
    const apart = buildVoxels(landSpec(cp, CHUNKY)).blobs.count + cp.props.reduce((n, _, i) => n + buildVoxels(propSpec(cp, i, CHUNKY)).blobs.count, 0)
    assert.ok(apart >= merged * 0.98 && apart < whole * 1.25, `apart ${apart}, whole ${whole}`)
  })
}
