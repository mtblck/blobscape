import * as THREE from 'three/webgpu'
import type { Frame } from '../splat-core/pixel.ts'
import { SplatWorld } from './engine.ts'
import { makeCreature, poseWalk, type Creature } from './creature.ts'
import { recordClip } from './glb.ts'
import { bakeSheet } from './bakeSheet.ts'
import { tinkerkitJson } from './spriteSheet.ts'

/**
 * The engine lab's fox trot as a Tinkerkit sheet: four directions, eight
 * frames per stride, through the same baker as Splat Creatures' Sprites tab.
 */
export interface WalkSheet {
  frames: Frame[]
  cols: number
  rows: number
  size: number
  png: () => Promise<Blob>
  json: (image: string) => object
}

const STRIDE = 1 / 1.4

/** One fox and its world per renderer, kept between sheets so their GPU buffers are made once. */
const stages = new WeakMap<object, { fox: Creature; world: SplatWorld; scene: THREE.Scene }>()

export async function makeWalkSheet(renderer: THREE.WebGPURenderer, opts: { size?: number; frames?: number; colours?: number } = {}): Promise<WalkSheet> {
  let stage = stages.get(renderer)
  if (!stage) {
    const fox = makeCreature(20000)
    const world = new SplatWorld([fox])
    const scene = new THREE.Scene()
    scene.add(world)
    stage = { fox, world, scene }
    stages.set(renderer, stage)
  }
  const { fox, world, scene } = stage
  const walk = { name: 'walk', clip: recordClip('walk', fox.skeleton, poseWalk, STRIDE, 24), frames: opts.frames ?? 8 }
  const s = await bakeSheet({ renderer, scene, actor: fox, posed: () => world.markPosed() }, [walk], { directions: 4, size: opts.size ?? 48, colours: opts.colours ?? 12, outline: true })
  return {
    frames: s.frames, cols: s.plan.cols, rows: s.plan.rows.length, size: s.size, png: s.png,
    json: (image: string) => tinkerkitJson('Blob fox', image, s.plan, s.size, s.anchorY),
  }
}
