import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUFFERS_NEEDED, PLANS, TRAIN_MAX_SIDE, TRAIN_MAX_SPLATS, cannotTrain, captureKind, pictureCount, trainConfig, trainSay } from './trainCapture.ts'

test('a folder is a capture when it has camera positions, in either layout', () => {
  assert.equal(captureKind(['transforms.json', 'images/a.png']), 'nerfstudio')
  assert.equal(captureKind(['shoe/transforms_train.json', 'shoe/train/r_0.png']), 'nerfstudio')
  assert.equal(captureKind(['sparse/0/cameras.bin', 'sparse/0/images.bin', 'sparse/0/points3D.bin', 'images/IMG_1.JPG']), 'colmap')
  assert.equal(captureKind(['sparse\\0\\cameras.txt', 'sparse\\0\\images.txt']), 'colmap')
  // photos alone have no camera positions, and neither has half a COLMAP folder
  assert.equal(captureKind(['IMG_1.jpg', 'IMG_2.jpg']), null)
  assert.equal(captureKind(['sparse/0/cameras.bin']), null)
  assert.equal(captureKind(['my-transforms.json.bak', 'images.binary']), null)
  assert.equal(pictureCount(['images/a.png', 'images/b.JPG', 'masks/a.png', 'transforms.json', 'c.webp']), 3)
})

test('a run is as long as asked, no bigger than the sandbox takes, and writes nothing into the folder', () => {
  const init = { 'total-train-iters': 30000, 'max-splats': 10_000_000, 'sh-degree': 3, 'max-resolution': 1920, 'export-every': 5000, 'eval-every': 1000, 'eval-save-to-disk': false, 'lr-mean': 0.00002, 'rerun-enabled': true }
  for (const plan of PLANS) {
    const c = trainConfig(init, plan.steps)
    assert.equal(c['total-train-iters'], plan.steps)
    assert.ok((c['export-every'] as number) > plan.steps && (c['eval-every'] as number) > plan.steps)
    assert.ok((c['growth-stop-iter'] as number) < plan.steps)
    assert.equal(c['max-splats'], TRAIN_MAX_SPLATS)
    assert.equal(c['max-resolution'], TRAIN_MAX_SIDE)
    assert.equal(c['sh-degree'], 0)
    assert.equal(c['rerun-enabled'], false)
    assert.equal(c['lr-mean'], 0.00002, 'what is not ours to set is left alone')
  }
  // a capture's own smaller limits are kept
  const small = trainConfig({ ...init, 'max-splats': 50_000, 'max-resolution': 800 }, 2000)
  assert.equal(small['max-splats'], 50_000)
  assert.equal(small['max-resolution'], 800)
  assert.equal(trainConfig(init, 2000, 100_000)['max-splats'], 100_000)
  assert.deepEqual(PLANS.map((p) => p.steps), [...PLANS.map((p) => p.steps)].sort((a, b) => a - b))
})

test('where it cannot run it says why, and the progress line reads as a sentence', () => {
  assert.match(cannotTrain({ picker: false, gpu: true })!, /open a folder/)
  assert.match(cannotTrain({ picker: true, gpu: false })!, /WebGPU/)
  assert.match(cannotTrain({ picker: true, gpu: true, buffers: 8 })!, /allows 8 buffers.*needs 10/)
  assert.equal(cannotTrain({ picker: true, gpu: true, buffers: 10, subgroups: true, software: false }), null)
  assert.match(cannotTrain({ picker: true, gpu: true, buffers: 10, subgroups: true, software: true })!, /software graphics/)
  assert.match(cannotTrain({ picker: true, gpu: true, buffers: 16, subgroups: false })!, /no subgroups/)
  assert.equal(cannotTrain({ picker: true, gpu: true, buffers: BUFFERS_NEEDED }), null)
  assert.equal(cannotTrain({ picker: true, gpu: true }), null)
  assert.equal(trainSay(1250, 7000, 48213), 'Step 1,250 of 7,000, 48,213 blobs')
  assert.equal(trainSay(7010, 7000, 300000), 'Step 7,000 of 7,000, 300,000 blobs')
})
