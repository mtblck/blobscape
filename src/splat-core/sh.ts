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
