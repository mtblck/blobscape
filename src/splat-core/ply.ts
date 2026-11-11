import { SH_C0 } from './colour.ts'
import { Blobs } from './blobs.ts'

/**
 * Writes blobs as a standard 3D Gaussian splatting .ply (the layout the
 * original 3DGS code, SuperSplat, Spark and most viewers read): position,
 * the colour as the zeroth spherical-harmonic term, opacity before its
 * sigmoid, log scales, and the rotation as w, x, y, z.
 */
const PROPS = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'] as const

export function writePly(b: Blobs): Uint8Array {
  const header = `ply\nformat binary_little_endian 1.0\ncomment made in Blobscape\nelement vertex ${b.count}\n${PROPS.map((p) => `property float ${p}`).join('\n')}\nend_header\n`
  const head = new TextEncoder().encode(header)
  const out = new Uint8Array(head.length + b.count * PROPS.length * 4)
  out.set(head)
  const body = new DataView(out.buffer, head.length)
  let o = 0
  const put = (v: number) => { body.setFloat32(o, v, true); o += 4 }
  for (let i = 0; i < b.count; i++) {
    put(b.centre[i * 3]); put(b.centre[i * 3 + 1]); put(b.centre[i * 3 + 2])
    for (let c = 0; c < 3; c++) put((b.colour[i * 3 + c] - 0.5) / SH_C0)
    const a = Math.min(1 - 1e-6, Math.max(1e-6, b.opacity[i]))
    put(Math.log(a / (1 - a)))
    for (let c = 0; c < 3; c++) put(Math.log(Math.max(1e-8, b.scale[i * 3 + c])))
    put(b.quat[i * 4 + 3]); put(b.quat[i * 4]); put(b.quat[i * 4 + 1]); put(b.quat[i * 4 + 2])
  }
  return out
}

/**
 * Reads back exactly what `writePly` writes (for tests). Real files of any
 * layout are read by Spark when imported.
 */
export function readOwnPly(bytes: Uint8Array): Blobs {
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)))
  const end = text.indexOf('end_header\n') + 'end_header\n'.length
  const n = Number(/element vertex (\d+)/.exec(text)![1])
  const view = new DataView(bytes.buffer, bytes.byteOffset + end)
  const b = new Blobs(n)
  const sig = (x: number) => 1 / (1 + Math.exp(-x))
  for (let i = 0; i < n; i++) {
    const f = (k: number) => view.getFloat32((i * PROPS.length + k) * 4, true)
    b.push({
      centre: [f(0), f(1), f(2)],
      colour: [0.5 + SH_C0 * f(3), 0.5 + SH_C0 * f(4), 0.5 + SH_C0 * f(5)],
      opacity: sig(f(6)),
      scale: [Math.exp(f(7)), Math.exp(f(8)), Math.exp(f(9))],
      quat: [f(11), f(12), f(13), f(10)],
    })
  }
  return b
}
