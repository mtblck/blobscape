import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ZOO } from './zoo/index.ts'
import { recordClip } from './glb.ts'
import { asepriteJson, frameAll, frameTimes, moveFps, planSheet, tinkerkitJson, type SheetMove } from './spriteSheet.ts'

function frog() {
  const sp = ZOO.find((s) => s.id === 'frog')!
  const body = sp.make(3000, sp.looks[0].id)
  const clips = Object.fromEntries(sp.moves.map((m) => [m.name, recordClip(m.name, body.skeleton, m.pose, m.seconds, m.fps ?? 24)]))
  body.skeleton.reset()
  body.skeleton.update()
  return { body, clips }
}

test('a sheet has a row per move per direction, as wide as the longest move', () => {
  const { clips } = frog()
  const moves: SheetMove[] = [{ name: 'jump', clip: clips.jump, frames: 8 }, { name: 'still', frames: 1 }]
  const p4 = planSheet(moves, 4)
  assert.equal(p4.rows.length, 8)
  assert.equal(p4.cols, 8)
  assert.deepEqual(p4.rows.slice(0, 4).map((r) => r.dir), ['down', 'left', 'right', 'up'])
  const p8 = planSheet(moves, 8)
  assert.equal(p8.rows.length, 16)
  assert.equal(new Set(p8.rows.slice(0, 8).map((r) => r.dir)).size, 8)
})

test("a move's frames are spread through one loop, so the last leads back into the first", () => {
  const { clips } = frog()
  const m = { name: 'jump', clip: clips.jump, frames: 8 }
  const t = frameTimes(m)
  const end = clips.jump.times[clips.jump.times.length - 1]
  assert.equal(t.length, 8)
  assert.equal(t[0], 0)
  assert.ok(Math.abs(t[7] - (end * 7) / 8) < 1e-9)
  assert.ok(moveFps(m) >= 1)
})

test('the framing takes in the tongue at full stretch, which the rest pose hides', () => {
  const { body, clips } = frog()
  const sitting = frameAll(body, [{ name: 'idle', clip: clips.idle, frames: 8 }])
  const flicking = frameAll(body, [{ name: 'tongue', clip: clips.tongue, frames: 12 }])
  assert.ok(flicking.radius > sitting.radius * 1.05, `${flicking.radius} vs ${sitting.radius}`)
  // and it leaves the skeleton at rest for whoever draws next
  assert.equal(body.skeleton.size.every((s) => s === 1), true)
})

test('the Tinkerkit file names every row and stands the creature on its first frame', () => {
  const { clips } = frog()
  const plan = planSheet([{ name: 'Jump', clip: clips.jump, frames: 6 }, { name: 'tongue', clip: clips.tongue, frames: 8 }], 4)
  const j = tinkerkitJson('Blob frog', 'blob-frog.png', plan, 48, 44)
  assert.equal(j.formatVersion, 71)
  assert.equal(j.id, 'blob-frog')
  assert.equal(j.imageWidth, 8 * 48)
  assert.equal(j.imageHeight, 8 * 48)
  assert.deepEqual(j.anchor, { x: 24, y: 44 })
  assert.deepEqual(j.animations['jump-down'].frames, [0, 1, 2, 3, 4, 5])
  assert.deepEqual(j.animations['tongue-up'].frames, [7 * 8, 7 * 8 + 1, 7 * 8 + 2, 7 * 8 + 3, 7 * 8 + 4, 7 * 8 + 5, 7 * 8 + 6, 7 * 8 + 7])
  assert.deepEqual(j.animations['idle-left'], { frames: [8], fps: 1, loop: false })
})

test('the Aseprite file has one rectangle per drawn frame and a tag per animation', () => {
  const { clips } = frog()
  const plan = planSheet([{ name: 'jump', clip: clips.jump, frames: 6 }, { name: 'still', frames: 1 }], 8)
  const a = asepriteJson('blob-frog.png', plan, 32) as { frames: { frame: { x: number; y: number } }[]; meta: { frameTags: { name: string; from: number; to: number }[]; size: { w: number; h: number } } }
  assert.equal(a.frames.length, 8 * 6 + 8 * 1)
  assert.equal(a.meta.frameTags.length, 16)
  assert.deepEqual(a.meta.size, { w: 6 * 32, h: 16 * 32 })
  const still = a.meta.frameTags.find((t) => t.name === 'still-up')!
  assert.equal(still.to - still.from, 0)
  // the still row's frame sits at the start of its own row
  assert.deepEqual(a.frames[still.from].frame, { x: 0, y: 12 * 32, w: 32, h: 32 })
})
