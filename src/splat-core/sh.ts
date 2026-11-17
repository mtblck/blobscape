/**
 * Real spherical harmonics up to degree 3, the way Gaussian splat files store
 * view-dependent color: each blob keeps (degree + 1)² coefficients per color
 * channel, and its color from direction v is Σ c·Y(v). Degree 0 is one color
 * for every direction; each degree after it adds finer variation.
 */

export const SH_TERMS = [1, 4, 9, 16] as const

/** Writes the 16 basis values Y₀₀…Y₃₃ for unit direction (x, y, z) into `out`. */
export function shBasis(x: number, y: number, z: number, out: Float64Array | number[] = new Float64Array(16)) {
  const xx = x * x, yy = y * y, zz = z * z
  out[0] = 0.28209479177387814
  out[1] = 0.4886025119029199 * y
  out[2] = 0.4886025119029199 * z
  out[3] = 0.4886025119029199 * x
  out[4] = 1.0925484305920792 * x * y
  out[5] = 1.0925484305920792 * y * z
  out[6] = 0.31539156525252005 * (3 * zz - 1)
  out[7] = 1.0925484305920792 * x * z
  out[8] = 0.5462742152960396 * (xx - yy)
  out[9] = 0.5900435899266435 * y * (3 * xx - yy)
  out[10] = 2.890611442640554 * x * y * z
  out[11] = 0.4570457994644658 * y * (5 * zz - 1)
  out[12] = 0.3731763325901154 * z * (5 * zz - 3)
  out[13] = 0.4570457994644658 * x * (5 * zz - 1)
  out[14] = 1.445305721320277 * z * (xx - yy)
  out[15] = 0.5900435899266435 * x * (xx - 3 * yy)
  return out
}

/** `n` directions spread evenly over the sphere (Fibonacci), as x, y, z triples. */
export function sphereDirections(n: number): Float64Array {
  const d = new Float64Array(n * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2
    const r = Math.sqrt(1 - y * y)
    d[i * 3] = Math.cos(golden * i) * r
    d[i * 3 + 1] = y
    d[i * 3 + 2] = Math.sin(golden * i) * r
  }
  return d
}

/**
 * Projects a color function of direction onto degree-3 harmonics: 16
 * coefficients per channel, as 48 numbers (r0…r15, g0…g15, b0…b15).
 * Truncating the result to a lower degree is that degree's best fit.
 */
export function projectSH(f: (x: number, y: number, z: number) => [number, number, number], dirs: Float64Array, out = new Float64Array(48)) {
  out.fill(0)
  const n = dirs.length / 3
  const Y = new Float64Array(16)
  const w = (4 * Math.PI) / n
  for (let i = 0; i < n; i++) {
    const x = dirs[i * 3], y = dirs[i * 3 + 1], z = dirs[i * 3 + 2]
    const c = f(x, y, z)
    shBasis(x, y, z, Y)
    for (let k = 0; k < 16; k++) {
      out[k] += c[0] * Y[k] * w
      out[16 + k] += c[1] * Y[k] * w
      out[32 + k] += c[2] * Y[k] * w
    }
  }
  return out
}

/** The color the coefficients give toward (x, y, z), using terms up to `degree`. */
export function evalSH(c: ArrayLike<number>, degree: number, x: number, y: number, z: number, Y = new Float64Array(16)): [number, number, number] {
  shBasis(x, y, z, Y)
  const n = SH_TERMS[degree]
  let r = 0, g = 0, b = 0
  for (let k = 0; k < n; k++) {
    r += c[k] * Y[k]
    g += c[16 + k] * Y[k]
    b += c[32 + k] * Y[k]
  }
  return [r, g, b]
}

/** How many numbers one blob takes with color by angle up to `degree`: 14, 23, 38 or 59. */
export const numbersPerBlob = (degree: number) => 11 + 3 * SH_TERMS[degree]

/**
 * As splat files hold it (.ply's f_rest, .spz, the 3DGS reference): a blob's
 * view color is its base color (0.5 + C0·f_dc, what `Blobs.color` keeps) plus
 * Σ rest·Y over the terms after the first, toward the blob from the camera, in
 * the blob's own frame. The files' basis is this file's with every odd term's
 * sign turned, so `toFileOrder` converts `projectSH` output.
 */
export function fileBasis(x: number, y: number, z: number, out: Float64Array | number[] = new Float64Array(16)) {
  shBasis(x, y, z, out)
  for (let k = 1; k < 16; k += 2) out[k] = -out[k]
  return out
}

/** `projectSH` coefficients (r0…r15, g0…, b0…) as a file's rest terms for `degree`: per term r, g, b, from term 1. */
export function toFileOrder(c: ArrayLike<number>, degree: number, out = new Float32Array(3 * (SH_TERMS[degree] - 1))) {
  for (let k = 1; k < SH_TERMS[degree]; k++) for (let ch = 0; ch < 3; ch++) out[(k - 1) * 3 + ch] = c[ch * 16 + k] * (k % 2 ? -1 : 1)
  return out
}

/**
 * A blob's color seen along unit direction d (from the camera toward the blob,
 * in the blob's frame): `base` (sRGB 0–1) plus its `terms` rest terms from
 * `rest[at…]` (r, g, b per term, file signs), clamped to 0–1. The engine's
 * `viewed` is the GPU twin (change both).
 */
export function viewColor(base: ArrayLike<number>, rest: ArrayLike<number>, at: number, terms: number, d: ArrayLike<number>, Y = new Float64Array(16)): [number, number, number] {
  fileBasis(d[0], d[1], d[2], Y)
  const c: [number, number, number] = [base[0], base[1], base[2]]
  for (let k = 0; k < terms; k++) for (let ch = 0; ch < 3; ch++) c[ch] += rest[at + k * 3 + ch] * Y[k + 1]
  for (let ch = 0; ch < 3; ch++) c[ch] = Math.max(0, Math.min(1, c[ch]))
  return c
}

/** Per band, (AᵀA)⁻¹Aᵀ for the basis at a fixed spread of directions, so a band's turned coefficients are a least-squares fit. */
let fitters: { dirs: Float64Array; P: number[][][] } | null = null

function bandFitters() {
  if (fitters) return fitters
  const dirs = sphereDirections(64), n = 64
  const Y = new Float64Array(16)
  const P: number[][][] = [[]]
  for (let l = 1; l <= 3; l++) {
    const first = l * l, m = 2 * l + 1
    const A: number[][] = []
    for (let j = 0; j < n; j++) { fileBasis(dirs[j * 3], dirs[j * 3 + 1], dirs[j * 3 + 2], Y); A.push(Array.from(Y.subarray(first, first + m))) }
    // AᵀA, inverted by Gauss–Jordan (m ≤ 7, well conditioned: the basis is orthogonal over the sphere)
    const M = Array.from({ length: m }, (_, r) => [...Array.from({ length: m }, (_, c) => A.reduce((s, row) => s + row[r] * row[c], 0)), ...Array.from({ length: m }, (_, c) => (c === r ? 1 : 0))])
    for (let c = 0; c < m; c++) {
      let p = c
      for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
      ;[M[c], M[p]] = [M[p], M[c]]
      const d = M[c][c]
      for (let k = 0; k < 2 * m; k++) M[c][k] /= d
      for (let r = 0; r < m; r++) if (r !== c) { const f = M[r][c]; for (let k = 0; k < 2 * m; k++) M[r][k] -= f * M[c][k] }
    }
    P.push(Array.from({ length: m }, (_, r) => Array.from({ length: n }, (_, j) => A[j].reduce((s, v, c) => s + M[r][m + c] * v, 0))))
  }
  return (fitters = { dirs, P })
}

/**
 * Turns color by angle with a whole set of blobs: after the blobs' places and
 * facings are turned by unit quaternion `q`, their terms must turn too, or a
 * highlight stays where the old view put it. Each band is turned on its own
 * (a band's terms only ever mix with each other), by one matrix per band for
 * the whole turn. `which` limits it to some blobs.
 */
export function turnSH(sh: Float32Array, degree: number, count: number, q: ArrayLike<number>, which?: (i: number) => boolean) {
  if (!degree) return
  const { dirs, P } = bandFitters()
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]]
  // rows of R; the turned colors at d are the old ones at Rᵀd
  const R = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
  const n = dirs.length / 3, Y = new Float64Array(16)
  const B: Float64Array[] = []
  for (let j = 0; j < n; j++) {
    const dx = dirs[j * 3], dy = dirs[j * 3 + 1], dz = dirs[j * 3 + 2]
    B.push(Float64Array.from(fileBasis(R[0] * dx + R[3] * dy + R[6] * dz, R[1] * dx + R[4] * dy + R[7] * dz, R[2] * dx + R[5] * dy + R[8] * dz, Y)))
  }
  const terms = SH_TERMS[degree] - 1
  const mats: number[][][] = [[]]
  for (let l = 1; l <= degree; l++) {
    const first = l * l, m = 2 * l + 1
    mats.push(Array.from({ length: m }, (_, r) => Array.from({ length: m }, (_, c) => P[l][r].reduce((s, p, j) => s + p * B[j][first + c], 0))))
  }
  const v = new Float64Array(7)
  for (let i = 0; i < count; i++) {
    if (which && !which(i)) continue
    for (let l = 1; l <= degree; l++) {
      const first = l * l - 1, m = 2 * l + 1, M = mats[l]
      for (let ch = 0; ch < 3; ch++) {
        for (let k = 0; k < m; k++) v[k] = sh[(i * terms + first + k) * 3 + ch]
        for (let r = 0; r < m; r++) { let s = 0; for (let k = 0; k < m; k++) s += M[r][k] * v[k]; sh[(i * terms + first + r) * 3 + ch] = s }
      }
    }
  }
}
