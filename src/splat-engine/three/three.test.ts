import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { SplatSkinning, SplatSkinningMode } from '@sparkjsdev/spark'
import { sampleClip } from '../glb.ts'
import { RiggedSplatLoader, skinMatrices } from './rigged.ts'
import { bindSpark, poseSparkMatrices } from './spark.ts'

const SAMPLES = ['fox', 'frog', 'puffer']
const open = (name: string) => new RiggedSplatLoader().parse(readFileSync(new URL(`../../../public/rigged-splats/${name}.glb`, import.meta.url)))

test('the spec samples open as a bone tree, a skeleton and clips three can bind', () => {
  for (const name of SAMPLES) {
    const t = open(name)
    assert.equal(t.bones.length, t.rig.skeleton.count, name)
    assert.equal(new Set(t.bones.map((b) => b.name)).size, t.bones.length, `${name}: bone names unique`)
    assert.equal(t.animations.length, t.rig.clips.length, name)
    for (const clip of t.animations) {
      assert.ok(clip.validate(), `${name} ${clip.name}`)
      // every track finds its bone
      for (const track of clip.tracks) assert.ok(t.root.getObjectByName(THREE.PropertyBinding.parseTrackName(track.name).nodeName), `${name}: ${track.name}`)
    }
  }
})

test("three's mixer playing a sample's clips moves its bones as our own player does", () => {
  for (const name of SAMPLES) {
    const t = open(name)
    const sk = t.rig.skeleton
    for (const [k, clip] of t.animations.entries()) {
      const mixer = new THREE.AnimationMixer(t.root)
      const action = mixer.clipAction(clip)
      action.play()
      for (const time of [0, clip.duration * 0.37, clip.duration * 0.81]) {
        mixer.setTime(time)
        const theirs = skinMatrices(t)
        sk.reset()
        sampleClip(t.rig.clips[k], sk, time)
        sk.update()
        let worst = 0
        for (let i = 0; i < theirs.length; i++) worst = Math.max(worst, Math.abs(theirs[i] - sk.matrix[i]))
        // three slerps between keys where we blend and renormalize: a hair apart between keys 1/24 s apart
        assert.ok(worst < 2e-3, `${name} ${clip.name} at ${time.toFixed(2)}s: ${worst}`)
      }
      mixer.stopAllAction()
    }
  }
})

test("Spark's linear blend, fed a file's three.js bones, puts its splats where the file's own rule does", () => {
  const t = open('fox')
  const fake = { numSplats: t.rig.blobs.count, needsUpdate: false } as never
  const sk = new SplatSkinning({ mesh: fake, numSplats: t.rig.blobs.count, numBones: t.bones.length, mode: SplatSkinningMode.LINEAR_BLEND })
  bindSpark(sk, t)
  const mixer = new THREE.AnimationMixer(t.root)
  mixer.clipAction(t.animations[0]).play()
  mixer.setTime(t.animations[0].duration * 0.4)
  const m = skinMatrices(t)
  poseSparkMatrices(sk, m, t.bones.length)
  // Spark's GLSL, mirrored: weights are bytes, each bone's 3×4 packed in four texels
  const d = sk.boneData, b = t.rig.blobs
  let worst = 0
  for (let i = 0; i < b.count; i += 7) {
    const c = b.center.subarray(i * 3, i * 3 + 3)
    const spark = [0, 0, 0], ours = [0, 0, 0]
    for (let k = 0; k < 4; k++) {
      const w = (sk.skinData[i * 4 + k] & 0xff) / 255, bone = (sk.skinData[i * 4 + k] >> 8) & 0xff
      if (!w) continue
      const o = bone * 16
      for (let r = 0; r < 3; r++) spark[r] += w * (d[o + r] * c[0] + d[o + 3 + r] * c[1] + d[o + 6 + r] * c[2] + d[o + 9 + r])
      for (let r = 0; r < 3; r++) ours[r] += w * (m[bone * 16 + r] * c[0] + m[bone * 16 + 4 + r] * c[1] + m[bone * 16 + 8 + r] * c[2] + m[bone * 16 + 12 + r])
    }
    worst = Math.max(worst, Math.hypot(spark[0] - ours[0], spark[1] - ours[1], spark[2] - ours[2]))
  }
  assert.ok(worst < 1e-4, `worst ${worst}`)
})
