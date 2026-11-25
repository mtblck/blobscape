import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHARE_SITES, choiceEntries, choiceFrom, linkWith, orbitFrom, orbitText } from './shareLink.ts'

const START = { size: 2, turn: -50, shadows: true, backdrop: '' }

test('only the settings changed go into the link, and they read back the same', () => {
  const now = { size: 3, turn: -50.00001, shadows: false, backdrop: 'cream' }
  const e = choiceEntries('block', now, START)
  assert.deepEqual(e, [['block.size', '3'], ['block.turn', undefined], ['block.shadows', '0'], ['block.backdrop', 'cream']])
  const link = linkWith('https://blobscape.dev/experiments/diorama/?style=blocks&block.turn=10#x', e)
  assert.equal(link, 'https://blobscape.dev/experiments/diorama/?style=blocks&block.size=3&block.shadows=0&block.backdrop=cream')
  assert.deepEqual({ ...START, ...choiceFrom('block', START, new URL(link).searchParams) }, { ...now, turn: -50 })
})

test('a mistyped setting is left as it was', () => {
  const q = new URLSearchParams('c.size=abc&c.turn=&c.shadows=yes&c.backdrop=&c.other=1')
  assert.deepEqual(choiceFrom('c', START, q), {})
})

test('a view goes into the address and back', () => {
  const o = { azimuth: 33.333333, elevation: 12, distance: 7.5, target: [0, 0.25, -1] as const }
  const back = orbitFrom(orbitText(o))!
  assert.ok(Math.abs(back.azimuth - o.azimuth) < 0.01)
  assert.deepEqual(back.target, [0, 0.25, -1])
  assert.equal(orbitFrom('1,2,0,0,0,0'), undefined)
  assert.equal(orbitFrom('1,2,3'), undefined)
})

test('each site gets the link whole', () => {
  const link = 'https://blobscape.dev/experiments/diorama/?scene=koi&style=blocks&block.size=1'
  for (const s of SHARE_SITES) {
    const u = new URL(s.url(link, 'A koi pond & rain'))
    assert.ok([...u.searchParams.values()].includes(link), s.id)
  }
})

test('a field that starts as null (the look’s own way) is written only once it is set, and read back as a switch', () => {
  const start = { outline: null as boolean | null, size: 1 }
  assert.deepEqual(choiceEntries('marks', start, start), [['marks.outline', undefined], ['marks.size', undefined]])
  const e = choiceEntries('marks', { outline: false, size: 1 }, start)
  assert.deepEqual(e[0], ['marks.outline', '0'])
  const q = new URLSearchParams(linkWith('https://x.test/', e).split('?')[1])
  assert.deepEqual(choiceFrom('marks', start, q), { outline: false })
  assert.deepEqual(choiceFrom('marks', start, new URLSearchParams('marks.outline=maybe')), {})
})
