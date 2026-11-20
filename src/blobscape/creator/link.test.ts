import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openScene } from './library.ts'
import { LINK_MOST, isLink, linkFor, readLink, whyNoLink } from './link.ts'
import { modelId } from './models.ts'

const windmill = () => {
  const p = openScene('windmill')!
  return { ...p, props: p.props.map((x, i) => ({ ...x, at: [x.at[0] + i / 7, x.at[1], x.at[2]] as [number, number, number], turn: 12.3456789 })) }
}

test('a scene of library props goes into a link and comes back the same, to a thousandth', async () => {
  const p = windmill()
  const { hash, why } = await linkFor(p)
  assert.equal(why, undefined)
  assert.ok(hash && isLink(hash) && hash.length < LINK_MOST, `${hash?.length}`)
  const back = await readLink(hash!)
  assert.deepEqual(back.problems, [])
  assert.equal(back.project!.props.length, p.props.length)
  assert.equal(back.project!.land, p.land)
  back.project!.props.forEach((x, i) => {
    assert.equal(typeof x.prop === 'string' ? x.prop : x.prop.name, typeof p.props[i].prop === 'string' ? p.props[i].prop : p.props[i].prop.name)
    assert.equal(x.turn, 12.346)
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(x.at[k] - p.props[i].at[k]) <= 5e-4)
  })
})

test('your own models only go in a file', () => {
  const p = windmill()
  const id = modelId(new Uint8Array([1, 2, 3]))
  assert.match(whyNoLink({ ...p, land: id })!, /land/)
  assert.match(whyNoLink({ ...p, props: [...p.props, { ...p.props[0], prop: id }] })!, /props of your own/)
  assert.equal(whyNoLink(p), undefined)
})

test('a broken or changed link says what is wrong and opens nothing', async () => {
  const { hash } = await linkFor(windmill())
  assert.deepEqual((await readLink('#other=1')).problems, ['link: not a shared scene'])
  const cut = await readLink(hash!.slice(0, hash!.length / 2))
  assert.equal(cut.project, undefined)
  assert.ok(cut.problems.length)
  assert.equal((await readLink('#shared=!!')).project, undefined)
})
