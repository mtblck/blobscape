import { DynamicDrawUsage, StorageBufferAttribute } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, If, Loop, atomicAdd, atomicLoad, atomicStore, instanceIndex, invocationLocalIndex, select, storage, uint, workgroupArray, workgroupBarrier, workgroupId } = TSL

/** Bits in a key: depth in 2²⁴ steps between the view's near and far. */
export const RADIX_BITS = 24
const DIGIT = 8
const DIGITS = 1 << DIGIT
const PASSES = RADIX_BITS / DIGIT
/** Blobs per block: one workgroup ranks a block at a time. */
const BLOCK = 256
const SCAN = 256

/**
 * A stable radix sort over 24-bit depth keys on the GPU: three passes of
 * eight bits, each a block histogram, a prefix over (digit, block), and a
 * scatter in which every blob counts the blobs before it in its block with
 * the same digit, so its slot never depends on which thread ran first. Equal
 * keys keep index order without a settle pass, however many share a depth
 * (a wall seen dead on), and 2²⁴ steps leave almost none equal.
 *
 * It has the counting sort's shape (`DepthSort` in sort.ts): the project pass
 * writes `keysW`, `order` sorts, the draw reads `orderRead`, and `sortCPU` is
 * the WebGL path and the twin (LSD radix on the CPU, the same order).
 */
export class RadixSort {
  readonly count: number
  readonly bins = 1 << RADIX_BITS
  readonly keysAttr: StorageBufferAttribute
  readonly orderAttr: StorageBufferAttribute
  private readonly attrs: StorageBufferAttribute[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly keysW: any; readonly orderRead: any; readonly histogram: undefined = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly nodes: any[] = []
  private readonly scratch: RadixScratch
  private webgl = false

  constructor(count: number) {
    const n = Math.max(1, count)
    this.count = n
    const blocks = Math.ceil(n / BLOCK)
    const order = new Uint32Array(n)
    for (let i = 0; i < n; i++) order[i] = i
    this.keysAttr = new StorageBufferAttribute(new Uint32Array(n), 1)
    this.orderAttr = new StorageBufferAttribute(order, 1)
    const k1 = new StorageBufferAttribute(new Uint32Array(n), 1), v1 = new StorageBufferAttribute(new Uint32Array(n), 1)
    const k2 = new StorageBufferAttribute(new Uint32Array(n), 1), v2 = new StorageBufferAttribute(new Uint32Array(n), 1)
    // per digit, per block: the count, then (after the prefix) the first slot
    const entries = DIGITS * blocks
    const tableAttr = new StorageBufferAttribute(new Uint32Array(entries), 1)
    // the prefix runs in `groups` workgroups of 256 threads, each thread over `per` entries
    const per = Math.ceil(entries / (SCAN * SCAN))
    const groups = Math.ceil(entries / (SCAN * per))
    const sumsAttr = new StorageBufferAttribute(new Uint32Array(SCAN), 1)
    this.attrs = [this.keysAttr, this.orderAttr, k1, v1, k2, v2, tableAttr, sumsAttr]
    this.scratch = radixScratch(n)

    const ro = (a: StorageBufferAttribute) => storage(a, 'uint', n).toReadOnly()
    const rw = (a: StorageBufferAttribute) => storage(a, 'uint', n)
    this.keysW = rw(this.keysAttr)
    this.orderRead = ro(this.orderAttr)
    const table = storage(tableAttr, 'uint', entries)
    const sums = storage(sumsAttr, 'uint', SCAN)

    // pass p reads keys (and values, after the first) from `src` and writes them to `dst`; the last writes values only, into the order
    const io = [
      { keys: ro(this.keysAttr), vals: null, outK: rw(k1), outV: rw(v1) },
      { keys: ro(k1), vals: ro(v1), outK: rw(k2), outV: rw(v2) },
      { keys: ro(k2), vals: ro(v2), outK: null, outV: rw(this.orderAttr) },
    ]

    /**
     * The workgroup's exclusive prefix of `own` (Hillis–Steele in `shared`), read into variables before returning, so
     * the same shared array can be used again straight after.
     */
    const scanIn = (shared: N, own: N) => {
      const lid = invocationLocalIndex
      shared.element(lid).assign(own)
      workgroupBarrier()
      for (let step = 1; step < SCAN; step *= 2) {
        const add = select(lid.greaterThanEqual(uint(step)), shared.element(lid.sub(uint(step)).min(uint(SCAN - 1))), uint(0)).toVar()
        workgroupBarrier()
        shared.element(lid).addAssign(add)
        workgroupBarrier()
      }
      const before = shared.element(lid).sub(own).toVar(), total = shared.element(uint(SCAN - 1)).toVar()
      workgroupBarrier()
      return { before, total }
    }
    const scanGroup = (own: N) => scanIn(workgroupArray('uint', SCAN), own)

    /** This blob's digit, and whether it is a blob at all (the last block runs past the end). */
    const digitOf = (keys: N, shift: number) => {
      const i = instanceIndex
      const real = i.lessThan(uint(n))
      const key = keys.element(i.min(uint(n - 1))).toVar()
      return { real, key, digit: key.shiftRight(uint(shift)).bitAnd(uint(DIGITS - 1)).toVar() }
    }

    for (let p = 0; p < PASSES; p++) {
      const shift = p * DIGIT, { keys, vals, outK, outV } = io[p]

      // 1. block histogram, by shared atomics
      this.nodes.push(Fn(() => {
        const counts = workgroupArray('uint', DIGITS).toAtomic()
        const lid = invocationLocalIndex
        atomicStore(counts.element(lid), uint(0))
        workgroupBarrier()
        const { real, digit } = digitOf(keys, shift)
        If(real, () => { atomicAdd(counts.element(digit), uint(1)) })
        workgroupBarrier()
        table.element(lid.mul(uint(blocks)).add(workgroupId.x)).assign(atomicLoad(counts.element(lid)))
      })().compute(blocks * BLOCK, [BLOCK]).setName(`RadixHistogram${p}`))

      // 2. prefix over (digit, block): each group's total, those totals scanned, then each entry's first slot
      const walk = (write: boolean) => Fn(() => {
        const first = workgroupId.x.mul(uint(SCAN * per)).add(invocationLocalIndex.mul(uint(per))).toVar()
        const own = uint(0).toVar()
        Loop({ start: uint(0), end: uint(per), type: 'uint', condition: '<' }, ({ i }: { i: N }) => {
          const k = first.add(i)
          If(k.lessThan(uint(entries)), () => { own.addAssign(table.element(k)) })
        })
        const s = scanGroup(own)
        if (!write) {
          If(invocationLocalIndex.equal(uint(0)), () => { sums.element(workgroupId.x).assign(s.total) })
          return
        }
        const at = s.before.add(sums.element(workgroupId.x)).toVar()
        Loop({ start: uint(0), end: uint(per), type: 'uint', condition: '<' }, ({ i }: { i: N }) => {
          const k = first.add(i)
          If(k.lessThan(uint(entries)), () => {
            const c = table.element(k).toVar()
            table.element(k).assign(at)
            at.addAssign(c)
          })
        })
      })().compute(groups * SCAN, [SCAN])
      this.nodes.push(walk(false).setName(`RadixTotals${p}`))
      this.nodes.push(Fn(() => {
        const lid = invocationLocalIndex
        const own = select(lid.lessThan(uint(groups)), sums.element(lid), uint(0)).toVar()
        const s = scanGroup(own)
        sums.element(lid).assign(s.before)
      })().compute(SCAN, [SCAN]).setName(`RadixGroups${p}`))
      this.nodes.push(walk(true).setName(`RadixPrefix${p}`))

      // 3. scatter. Each blob counts the blobs before it in its block with the same digit (its rank), so its slot is
      // that digit's first slot for the block plus the rank, and no thread's slot depends on which thread ran first.
      this.nodes.push(Fn(() => {
        const lid = invocationLocalIndex
        const digits = workgroupArray('uint', BLOCK)
        const { real, key, digit } = digitOf(keys, shift)
        // past the end: a digit no real blob has, so it is never counted
        digits.element(lid).assign(select(real, digit, uint(DIGITS)))
        workgroupBarrier()
        If(real, () => {
          const rank = uint(0).toVar()
          Loop({ start: uint(0), end: lid, type: 'uint', condition: '<' }, ({ i }: { i: N }) => {
            rank.addAssign(select(digits.element(i).equal(digit), uint(1), uint(0)))
          })
          const slot = table.element(digit.mul(uint(blocks)).add(workgroupId.x)).add(rank).toVar()
          if (outK) outK.element(slot).assign(key)
          outV.element(slot).assign(vals ? vals.element(instanceIndex) : instanceIndex)
        })
      })().compute(blocks * BLOCK, [BLOCK]).setName(`RadixScatter${p}`))
    }
  }

  /** Sorts by the keys the project pass wrote: farthest first, equal keys in index order. */
  order(renderer: { compute: (n: never) => void }) {
    for (const node of this.nodes) renderer.compute(node as never)
  }

  /** The same sort on the CPU (`radixOrder`), from keys already in `keysAttr`. */
  sortCPU(keys: Uint32Array = this.keysAttr.array as Uint32Array) {
    radixOrder(keys, this.count, this.orderAttr.array as Uint32Array, this.scratch)
    this.orderAttr.needsUpdate = true
    const pbo = (this.orderAttr as unknown as { pbo?: { needsUpdate: boolean } }).pbo
    if (pbo) pbo.needsUpdate = true
  }

  /** The WebGL backend reads storage through textures, uploaded from the CPU. */
  enableWebGL() {
    if (this.webgl) return
    this.orderAttr.setUsage(DynamicDrawUsage)
    this.orderRead.setPBO(true)
    this.webgl = true
  }

  dispose() {
    for (const a of this.attrs) a.dispose()
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

export interface RadixScratch { kA: Uint32Array; vA: Uint32Array; kB: Uint32Array; vB: Uint32Array; counts: Uint32Array }
export const radixScratch = (n: number): RadixScratch => ({ kA: new Uint32Array(n), vA: new Uint32Array(n), kB: new Uint32Array(n), vB: new Uint32Array(n), counts: new Uint32Array(DIGITS) })

/**
 * The GPU sort's CPU twin: the first `n` indices into `out`, by key ascending (farthest first, as the project pass
 * writes them), equal keys in index order. Three passes of eight bits, each a stable counting sort.
 */
export function radixOrder(keys: Uint32Array, n: number, out: Uint32Array, s = radixScratch(n)) {
  const from: [Uint32Array, Uint32Array | null][] = [[keys, null], [s.kA, s.vA], [s.kB, s.vB]]
  const to: [Uint32Array | null, Uint32Array][] = [[s.kA, s.vA], [s.kB, s.vB], [null, out]]
  for (let p = 0; p < PASSES; p++) {
    const shift = p * DIGIT, [srcK, srcV] = from[p], [dstK, dstV] = to[p], c = s.counts
    c.fill(0)
    for (let i = 0; i < n; i++) c[(srcK[i] >>> shift) & (DIGITS - 1)]++
    let sum = 0
    for (let d = 0; d < DIGITS; d++) { const k = c[d]; c[d] = sum; sum += k }
    for (let i = 0; i < n; i++) {
      const k = srcK[i], slot = c[(k >>> shift) & (DIGITS - 1)]++
      dstV[slot] = srcV ? srcV[i] : i
      if (dstK) dstK[slot] = k
    }
  }
  return out
}
