import test from 'node:test'
import assert from 'node:assert/strict'
import { START_WAITS, withRetries, type Attempt } from './startRenderer.ts'

const quiet = async <T>(run: () => Promise<T>) => {
  const warn = console.warn
  console.warn = () => {}
  try { return await run() } finally { console.warn = warn }
}

test('a start that fails once works on the next try, after a wait', async () => {
  const waited: number[] = []
  let tries = 0
  const got = await quiet(() => withRetries(async () => {
    if (tries++ === 0) throw new Error('no adapter')
    return 'renderer'
  }, { wait: async (ms) => { waited.push(ms) } }))
  assert.equal(got, 'renderer')
  assert.equal(tries, 2)
  assert.deepEqual(waited, [START_WAITS[0]])
})

test('it gives up after the last wait with the real error', async () => {
  let tries = 0
  const boom = new Error('no context')
  await quiet(() => assert.rejects(withRetries(async () => { tries++; throw { error: boom, reachedWebGL: false } }, { wait: async () => {} }), (e) => e === boom))
  assert.equal(tries, START_WAITS.length + 1)
})

test('once the canvas has handed out a WebGL context, later tries ask for WebGL only', async () => {
  const asked: Attempt[] = []
  await quiet(() => withRetries(async (a) => {
    asked.push({ ...a })
    if (asked.length === 1) throw { error: new Error('x'), reachedWebGL: false }
    if (asked.length === 2) throw { error: new Error('y'), reachedWebGL: true }
    return 1
  }, { wait: async () => {} }))
  assert.deepEqual(asked.map((a) => a.webgl), [false, false, true])
})

test('a caller that asked for WebGL gets it on every try', async () => {
  const asked: boolean[] = []
  await quiet(() => withRetries(async (a) => { asked.push(a.webgl); if (asked.length < 2) throw new Error('x'); return 1 }, { webgl: true, wait: async () => {} }))
  assert.deepEqual(asked, [true, true])
})
