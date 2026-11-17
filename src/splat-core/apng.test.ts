import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync, inflateSync } from 'node:zlib'
import { crc32, encodeApng, type RgbaFrame } from './apng.ts'

const deflate = async (b: Uint8Array) => new Uint8Array(deflateSync(b))

/** Reads an APNG back: its chunks (checking each CRC), the loop and delay, and every frame's pixels. */
function readApng(png: Uint8Array) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const v = new DataView(png.buffer, png.byteOffset)
  const chunks: { type: string; data: Uint8Array }[] = []
  for (let at = 8; at < png.length;) {
    const len = v.getUint32(at), type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    assert.equal(v.getUint32(at + 8 + len), crc32(png, at + 4, at + 8 + len), `${type} crc`)
    chunks.push({ type, data: png.subarray(at + 8, at + 8 + len) })
    at += 12 + len
  }
  const ihdr = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset)
  const width = ihdr.getUint32(0), height = ihdr.getUint32(4)
  const actl = new DataView(chunks[1].data.buffer, chunks[1].data.byteOffset)
  const frames: Uint8Array[] = [], delays: number[] = [], seqs: number[] = []
  for (const c of chunks) {
    const d = new DataView(c.data.buffer, c.data.byteOffset)
    if (c.type === 'fcTL') { seqs.push(d.getUint32(0)); delays.push(d.getUint16(20) / d.getUint16(22)) }
    if (c.type === 'IDAT' || c.type === 'fdAT') {
      if (c.type === 'fdAT') seqs.push(d.getUint32(0))
      const raw = inflateSync(c.type === 'IDAT' ? c.data : c.data.subarray(4))
      const px = new Uint8Array(width * height * 4)
      for (let y = 0; y < height; y++) {
        assert.equal(raw[y * (width * 4 + 1)], 0, 'no filter')
        px.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4)
      }
      frames.push(px)
    }
  }
  return { types: chunks.map((c) => c.type), width, height, count: actl.getUint32(0), plays: actl.getUint32(4), frames, delays, seqs }
}

test('an APNG holds every frame exactly, loops forever at the frame rate, with chunks in order', async () => {
  const frame = (k: number): RgbaFrame => {
    const data = new Uint8Array(5 * 3 * 4)
    for (let i = 0; i < data.length; i++) data[i] = (i * 37 + k * 91) & 255
    return { width: 5, height: 3, data }
  }
  const frames = [frame(0), frame(1), frame(2)]
  const r = readApng(await encodeApng(frames, 12, deflate))
  assert.deepEqual(r.types, ['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT', 'IEND'])
  assert.deepEqual([r.width, r.height, r.count, r.plays], [5, 3, 3, 0])
  assert.deepEqual(r.seqs, [0, 1, 2, 3, 4])
  for (const d of r.delays) assert.ok(Math.abs(d - 1 / 12) < 1e-9)
  r.frames.forEach((px, k) => assert.deepEqual(px, frames[k].data))
})

test('frames of different sizes are refused', async () => {
  await assert.rejects(encodeApng([{ width: 1, height: 1, data: new Uint8Array(4) }, { width: 2, height: 1, data: new Uint8Array(8) }], 12, deflate))
})
