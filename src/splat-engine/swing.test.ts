import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foxBones } from './creature.ts'
import { Skeleton, axisAngle, mulQ, posedPoint } from './rig.ts'
import { Swing, type SwingSpec } from './swing.ts'
import { DRAGON, dragonBones } from './zoo/dragon.ts'
import { FOX, FOX_SWING } from './zoo/fox.ts'
import { layout, monsterSpecies, planMonster } from './zoo/monster.ts'
import type { Species } from './zoo/species.ts'

const end = (sk: Skeleton, name: string) => { const b = sk.index(name); return posedPoint(sk, b, sk.bones[b].tail!) }
const dist = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const lastOf = (spec: SwingSpec) => spec.chains.map((c) => c.bones[c.bones.length - 1])

/** Plays a move with the creature turning hard one way and the other, swinging its loose parts; calls `each` every frame. */
function play(sp: Species, sk: Skeleton, frames: number, each: (f: number, clip: Float32Array) => void, turn = 1.2) {
  const s = new Swing(sk, sp.swing!)
  const move = sp.moves[0], dt = 1 / 60
  for (let f = 0; f < frames; f++) {
    const t = f * dt
    move.pose(sk, t % move.seconds)
    const heading = turn * Math.sin(t * 2)
    sk.setRotation(0, mulQ(axisAngle([0, 1, 0], heading), sk.rotation.subarray(0, 4)))
    sk.update()
    const clip = sk.rotation.slice()
    s.update(sk, dt)
    each(f, clip)
  }
}

const SWINGERS: [string, Species, () => Skeleton][] = [
  ['fox', FOX, () => new Skeleton(foxBones())],
  ['dragon', DRAGON, () => new Skeleton(dragonBones())],
  ...[3, 11, 27, 40, 58].map((seed): [string, Species, () => Skeleton] => [`monster ${seed}`, monsterSpecies(seed), () => new Skeleton(layout(planMonster(seed)).bones)]),
]

test('loose parts swing behind a turning creature, keep their length and stay finite', () => {
  let monsters = 0
  for (const [name, sp, make] of SWINGERS) {
    if (!sp.swing) continue
    if (name.startsWith('monster')) monsters++
    const sk = make(), rest = make()
    rest.update()
    // each chain's points: every bone's head, then the last one's tail
    const points = (k: Skeleton) => sp.swing!.chains.map((c) => [...c.bones.map((b) => posedPoint(k, k.index(b), k.bones[k.index(b)].head)), end(k, c.bones[c.bones.length - 1])])
    const links = (k: Skeleton) => points(k).flatMap((ps) => ps.slice(1).map((p, j) => dist(p, ps[j])))
    const length = links(rest)
    let differs = 0
    play(sp, sk, 180, (f, clip) => {
      links(sk).forEach((got, j) => assert.ok(Math.abs(got - length[j]) < 1e-3 * Math.max(1, length[j]), `${name}: link ${j} is ${got} long at frame ${f}, not ${length[j]}`))
      const tip = sk.index(lastOf(sp.swing!)[0])
      if (Math.abs(sk.rotation[tip * 4 + 1] - clip[tip * 4 + 1]) > 0.02) differs++
    })
    for (let i = 0; i < sk.rotation.length; i++) assert.ok(Number.isFinite(sk.rotation[i]), `${name}: rotation ${i}`)
    assert.ok(differs > 30, `${name}: the loose parts follow the move too closely (${differs} frames differ)`)
  }
  assert.ok(monsters >= 3, `only ${monsters} of the monsters have loose parts`)
})

test('standing still, a loose part settles where the move puts it', () => {
  const sk = new Skeleton(foxBones())
  const s = new Swing(sk, FOX_SWING)
  const pose = FOX.moves.find((m) => m.name === 'idle')!.pose
  // a pose held still (not the idle's look round): the tail ends up as posed
  for (let f = 0; f < 600; f++) { pose(sk, 0); s.update(sk, 1 / 60) }
  const swung = end(sk, 'tail2')
  pose(sk, 0)
  sk.update()
  assert.ok(dist(swung, end(sk, 'tail2')) < 0.01, `the tail hangs ${dist(swung, end(sk, 'tail2'))} from where it's posed`)
})

test('a creature moved far in one frame starts still, and reset forgets the motion', () => {
  const sk = new Skeleton(foxBones())
  const s = new Swing(sk, FOX_SWING)
  const pose = FOX.moves[0].pose
  pose(sk, 0)
  s.update(sk, 1 / 60)
  sk.place.set([20, 0, 0])
  pose(sk, 0)
  s.update(sk, 1 / 60)
  const swung = end(sk, 'tail2')
  pose(sk, 0)
  sk.update()
  assert.ok(dist(swung, end(sk, 'tail2')) < 1e-3, 'the tail was left behind')
  assert.ok(s.sim.energy() < 0.01, `it starts moving (${s.sim.energy()})`)
})

test('a chain must be bones that hang from each other and end in a tail', () => {
  const sk = new Skeleton(foxBones())
  assert.throws(() => new Swing(sk, { parts: 'x', chains: [{ bones: ['nope'], follow: 0.01 }] }), /no bone nope/)
  assert.throws(() => new Swing(sk, { parts: 'x', chains: [{ bones: ['tail2', 'tail1'], follow: 0.01 }] }), /doesn't hang/)
})
