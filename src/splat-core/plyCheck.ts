/**
 * A sanity check of a .ply header against the file's size, before any
 * decoder sees it. Returns null when it looks fine, 'mesh' when it has no
 * Gaussian splat properties, or 'damaged' when it promises more data than
 * the file holds (or can't be read at all). ASCII files and list properties
 * can't be sized from the header, so those only get the splat check.
 */
export function checkPlyHeader(head: Uint8Array, fileSize: number): null | 'mesh' | 'damaged' {
  const text = new TextDecoder('latin1').decode(head)
  const end = text.indexOf('end_header')
  if (!text.startsWith('ply') || end < 0) return 'damaged'
  const nl = text.indexOf('\n', end)
  const bodyStart = nl < 0 ? text.length : nl + 1
  const lines = text.slice(0, end).split(/\r?\n/).map((l) => l.trim().split(/\s+/))
  const binary = lines.some((l) => l[0] === 'format' && l[1]?.startsWith('binary'))
  const SIZES: Record<string, number> = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 }
  const names: string[] = []
  let bytes = 0, count = 0, stride = 0, sizable = binary
  const close = () => { bytes += count * stride; count = 0; stride = 0 }
  for (const l of lines) {
    if (l[0] === 'element') {
      close()
      count = Number(l[2])
      if (!Number.isFinite(count) || count < 0) return 'damaged'
    } else if (l[0] === 'property') {
      if (l[1] === 'list') { sizable = false; continue }
      const size = SIZES[l[1]]
      if (!size) return 'damaged'
      stride += size
      names.push(l[2])
    }
  }
  close()
  // Plain 3DGS files have scale_0; SuperSplat's compressed ones pack it
  if (!names.some((n) => n === 'scale_0' || n.startsWith('packed_') || n.startsWith('min_scale'))) return 'mesh'
  if (sizable && bytes > fileSize - bodyStart) return 'damaged'
  return null
}
