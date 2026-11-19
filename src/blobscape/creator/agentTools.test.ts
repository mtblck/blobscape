import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creatorTools, type CreatorApi, type LightAsk } from './agentTools.ts'

function fake() {
  const calls: unknown[][] = []
  const api: CreatorApi = {
    describe: () => 'a hill',
    props: () => ['windmill-mill', 'turkey-bird'],
    addProp: (...a) => { calls.push(['add', ...a]); return 'added' },
    moveProp: (...a) => { calls.push(['move', ...a]); return 'moved' },
    setLight: (a: LightAsk) => { calls.push(['light', a]); return 'lit' },
    styles: () => ['pixel', 'oil'],
    setStyle: (s) => { calls.push(['style', s]); return 'styled' },
    undo: () => 'undone',
  }
  const tools = new Map(creatorTools(api).map((t) => [t.name, t]))
  return { calls, run: (name: string, input: unknown = {}) => tools.get(name)!.execute(input) }
}

test('Scene Creator tools pass checked input through', async () => {
  const f = fake()
  assert.equal(await f.run('describe_scene'), 'a hill')
  assert.equal(await f.run('add_prop', { prop: 'turkey-bird', at: [0.5, -1] }), 'added')
  assert.equal(await f.run('move_prop', { index: 2, turn: 90 }), 'moved')
  assert.equal(await f.run('set_light', { sun_turn: 30, sun_height: 40, weather: 'none', hour: null }), 'lit')
  assert.equal(await f.run('set_style', { style: 'oil' }), 'styled')
  assert.deepEqual(f.calls, [
    ['add', 'turkey-bird', [0.5, -1]],
    ['move', 2, { at: undefined, turn: 90, size: undefined }],
    ['light', { sun: { turn: 30, height: 40 }, hour: null, weather: null }],
    ['style', 'oil'],
  ])
})

test('Scene Creator tools refuse bad input in words, touching nothing', async () => {
  const f = fake()
  for (const [name, input] of [
    ['add_prop', { prop: 'dragon' }],
    ['add_prop', { prop: 'turkey-bird', at: [1] }],
    ['move_prop', { index: -1, turn: 3 }],
    ['move_prop', { index: 0 }],
    ['move_prop', { index: 0, size: 9 }],
    ['set_light', {}],
    ['set_light', { sun_turn: 10 }],
    ['set_light', { hour: 30 }],
    ['set_style', { style: 'crayon' }],
  ] as const) assert.match(await f.run(name, input), /^Not done: /, `${name} ${JSON.stringify(input)}`)
  assert.equal(f.calls.length, 0)
})
