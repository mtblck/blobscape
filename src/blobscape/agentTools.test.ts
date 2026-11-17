import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerTools, sandboxTools, type AgentTool, type SandboxApi } from './agentTools.ts'

function fake() {
  const calls: unknown[][] = []
  const say = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return `${name} done` }
  const api: SandboxApi = {
    describe: say('describe'), creatures: () => ['fox', 'frog'], addCreature: say('addCreature'), writeScene: say('writeScene'),
    cut: say('cut'), recolor: say('recolor'), brush: say('brush'), save: say('save'), undo: say('undo'),
  }
  return { api, calls, tools: sandboxTools(api) }
}
const named = (tools: AgentTool[], name: string) => tools.find((t) => t.name === name)!

test('every tool has what WebMCP asks for: a plain name, a description, and a schema for an object', () => {
  const { tools } = fake()
  assert.deepEqual(tools.map((t) => t.name), ['describe_scene', 'add_creature', 'write_scene', 'cut', 'recolor', 'paint', 'save_scene', 'undo'])
  for (const t of tools) {
    assert.match(t.name, /^[a-z][a-z0-9_]{1,62}$/)
    assert.ok(t.description.length > 30 && t.description.length < 700, t.name)
    assert.equal(t.inputSchema.type, 'object')
    for (const key of t.inputSchema.required ?? []) assert.ok(key in t.inputSchema.properties, `${t.name}: ${key} is required and not described`)
    // a schema must survive the trip to the browser
    assert.deepEqual(JSON.parse(JSON.stringify(t.inputSchema)), t.inputSchema)
  }
  assert.equal(named(tools, 'describe_scene').annotations?.readOnlyHint, true)
  assert.equal(named(tools, 'save_scene').annotations?.consequentialHint, true)
  assert.deepEqual((named(tools, 'add_creature').inputSchema.properties.creature as { enum: string[] }).enum, ['fox', 'frog'])
})

test('sound input reaches the sandbox, as the sandbox takes it', async () => {
  const { tools, calls } = fake()
  assert.equal(await named(tools, 'describe_scene').execute({}), 'describe done')
  await named(tools, 'add_creature').execute({ creature: 'frog' })
  await named(tools, 'write_scene').execute({ description: '{"name":"x"}' })
  await named(tools, 'cut').execute({ center: [0, 1, 2], radius: 0.5 })
  await named(tools, 'recolor').execute({ center: [0, 1, 2], radius: 0.5, color: '#ff8000' })
  await named(tools, 'paint').execute({ brush: 'moss', at: [1, 0, 1], radius: 0.3 })
  await named(tools, 'save_scene').execute(undefined)
  await named(tools, 'undo').execute({})
  assert.deepEqual(calls, [
    ['describe'], ['addCreature', 'frog'], ['writeScene', '{"name":"x"}'], ['cut', [0, 1, 2], 0.5],
    ['recolor', [0, 1, 2], 0.5, [1, 128 / 255, 0]], ['brush', 'moss', [1, 0, 1], 0.3], ['save'], ['undo'],
  ])
})

test('unsound input touches nothing and says what was wrong', async () => {
  const { tools, calls } = fake()
  const bad: [string, unknown, RegExp][] = [
    ['add_creature', { creature: 'unicorn' }, /no creature "unicorn".*fox, frog/],
    ['add_creature', {}, /"creature" must be text/],
    ['write_scene', { description: 'x'.repeat(200_001) }, /longer than 200,000/],
    ['cut', { center: [0, 1], radius: 1 }, /"center" must be three numbers/],
    ['cut', { center: [0, 1, NaN], radius: 1 }, /"center"/],
    ['cut', { center: [0, 1, 2], radius: -1 }, /"radius"/],
    ['cut', null, /"center"/],
    ['recolor', { center: [0, 1, 2], radius: 1, color: 'red' }, /hex color/],
    ['paint', { brush: 'lava', at: [0, 0, 0], radius: 1 }, /no brush "lava".*grass/],
    ['paint', { brush: 'grass', at: 'here', radius: 1 }, /"at"/],
  ]
  for (const [name, input, why] of bad) {
    const said = await named(tools, name).execute(input)
    assert.match(said, /^Not done: /, name)
    assert.match(said, why, name)
  }
  assert.deepEqual(calls, [])
})

test('tools are registered where there is a WebMCP, taken away again, and a browser without one changes nothing', () => {
  const { tools } = fake()
  assert.deepEqual({ ...registerTools(tools, undefined), remove: 0 }, { count: 0, remove: 0 })
  const held = new Set<string>()
  const mc = {
    registerTool(t: AgentTool, o?: { signal?: AbortSignal }) {
      if (t.name === 'undo') throw new Error('this browser will not have it')
      held.add(t.name)
      o?.signal?.addEventListener('abort', () => held.delete(t.name))
      return Promise.resolve()
    },
  }
  const { count, remove } = registerTools(tools, mc)
  assert.equal(count, tools.length - 1)
  assert.equal(held.size, tools.length - 1)
  remove()
  assert.equal(held.size, 0)
})
