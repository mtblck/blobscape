// A made-up capture in Nerfstudio's format: balls on a ground disc, photographed from a ring of cameras.
import { deflateSync } from 'node:zlib'
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0 }
const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8); out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length); return out }
export function png(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1)
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const BALLS = [{ c: [0, 0.5, 0], r: 0.5, col: [220, 60, 50] }, { c: [0.8, 0.25, 0.3], r: 0.25, col: [60, 120, 220] }, { c: [-0.6, 0.3, -0.5], r: 0.3, col: [240, 200, 60] }]
const SUN = [0.4, 0.8, 0.45].map((v) => v / Math.hypot(0.4, 0.8, 0.45))
function shade(o, d) {
  let best = Infinity, col = [235, 232, 225]
  for (const b of BALLS) {
    const oc = [o[0] - b.c[0], o[1] - b.c[1], o[2] - b.c[2]], B = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2], C = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - b.r * b.r, D = B * B - C
    if (D < 0) continue
    const t = -B - Math.sqrt(D)
    if (t > 0 && t < best) { best = t; const n = [0, 1, 2].map((k) => (o[k] + d[k] * t - b.c[k]) / b.r), l = 0.35 + 0.65 * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]); col = b.col.map((v) => v * l) }
  }
  if (d[1] < 0) { const t = -o[1] / d[1], x = o[0] + d[0] * t, z = o[2] + d[2] * t; if (t < best && x * x + z * z < 1.8 * 1.8) { const k = (Math.floor(x * 3 + 50) + Math.floor(z * 3 + 50)) & 1; col = k ? [70, 130, 70] : [110, 170, 90] } }
  return col
}
export function capture(views = 24, w = 160, h = 120, fov = 50) {
  const f = h / 2 / Math.tan((fov * Math.PI) / 360), files = {}, frames = []
  for (let v = 0; v < views; v++) {
    const az = (v / views) * Math.PI * 2, el = (v % 3 === 0 ? 40 : v % 3 === 1 ? 22 : 10) * Math.PI / 180, dist = 3.6, T = [0, 0.35, 0]
    const eye = [T[0] + dist * Math.sin(az) * Math.cos(el), T[1] + dist * Math.sin(el), T[2] + dist * Math.cos(az) * Math.cos(el)]
    const back = [0, 1, 2].map((k) => (eye[k] - T[k]) / dist) // the camera's +z
    let right = [back[2], 0, -back[0]]; const rl = Math.hypot(...right); right = right.map((x) => x / rl)
    const up = [back[1] * right[2] - back[2] * right[1], back[2] * right[0] - back[0] * right[2], back[0] * right[1] - back[1] * right[0]]
    const rgb = new Uint8Array(w * h * 3)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / f, dy = -(y + 0.5 - h / 2) / f
      let d = [0, 1, 2].map((k) => right[k] * dx + up[k] * dy - back[k]); const dl = Math.hypot(...d); d = d.map((q) => q / dl)
      rgb.set(shade(eye, d), (y * w + x) * 3)
    }
    const name = `images/view_${String(v).padStart(3, '0')}.png`
    files[name] = png(rgb, w, h)
    frames.push({ file_path: name, transform_matrix: [[right[0], up[0], back[0], eye[0]], [right[1], up[1], back[1], eye[1]], [right[2], up[2], back[2], eye[2]], [0, 0, 0, 1]] })
  }
  files['transforms.json'] = Buffer.from(JSON.stringify({ camera_model: 'OPENCV', fl_x: f, fl_y: f, cx: w / 2, cy: h / 2, w, h, frames }, null, 1))
  return files
}
