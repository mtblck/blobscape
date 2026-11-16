import { DynamicDrawUsage, StorageBufferAttribute } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Break, Fn, If, Loop, atomicAdd, atomicLoad, atomicStore, instanceIndex, invocationLocalIndex, select, storage, uint, workgroupArray, workgroupBarrier } = TSL

const SCAN = 256
/** Bins holding up to this many blobs are put in index order after the scatter (see `settleNode`). */
const SETTLE = 48

/**
 * A counting sort over depth keys, in three passes that the engine drives:
 *
 * 1. keys: the engine's project pass writes each blob's key and adds it to
 *    `histogram` (so the key is worked out once, next to the projection that
 *    already knows the depth);
 * 2. prefix: one workgroup of 256 threads turns the histogram into each bin's
 *    first slot, and clears the histogram for next frame;
 * 3. scatter: each blob takes the next slot in its bin;
 * 4. settle: threads race for those slots, so blobs that share a bin would
 *    come out in a different order every frame, and where two colors meet at
 *    one depth (a window in its frame) the edge flickers. This pass puts each
 *    bin of up to `SETTLE` blobs in index order, as the CPU sort does. Bigger
 *    bins (a wall seen dead on) are left as they fell.
 *
 * three.js's `CountingSort` does the prefix in a single thread looping over
 * every bin, and works the key out twice; on a phone the serial loop is a
 * fixed cost of thousands of dependent memory round trips a frame.
 */
export class DepthSort {
  readonly count: number
  readonly bins: number
  readonly keysAttr: StorageBufferAttribute
  readonly orderAttr: StorageBufferAttribute
  private readonly attrs: StorageBufferAttribute[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly keysW: any; readonly histogram: any; readonly orderRead: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly prefixNode: any; readonly scatterNode: any; readonly settleNode: any
  private readonly cpuCounts: Uint32Array
  private webgl = false

  constructor(count: number, bins: number, workgroup = 256) {
    if (bins % SCAN) throw new Error(`bins must be a multiple of ${SCAN}`)
    const n = Math.max(1, count)
    this.count = n
    this.bins = bins
    const order = new Uint32Array(n)
    for (let i = 0; i < n; i++) order[i] = i
    this.keysAttr = new StorageBufferAttribute(new Uint32Array(n), 1)
    this.orderAttr = new StorageBufferAttribute(order, 1)
    const histAttr = new StorageBufferAttribute(new Uint32Array(bins), 1)
    const offsetAttr = new StorageBufferAttribute(new Uint32Array(bins), 1)
    // where the scatter drops each blob, before the settle pass writes the final order
    const scatterAttr = new StorageBufferAttribute(new Uint32Array(n), 1)
    this.attrs = [this.keysAttr, this.orderAttr, histAttr, offsetAttr, scatterAttr]
    this.cpuCounts = new Uint32Array(bins)

    this.keysW = storage(this.keysAttr, 'uint', n)
    const keysR = storage(this.keysAttr, 'uint', n).toReadOnly()
    this.histogram = storage(histAttr, 'uint', bins).toAtomic()
    const offsets = storage(offsetAttr, 'uint', bins).toAtomic()
    const orderW = storage(this.orderAttr, 'uint', n)
    const fellW = storage(scatterAttr, 'uint', n)
    const fellR = storage(scatterAttr, 'uint', n).toReadOnly()
    this.orderRead = storage(this.orderAttr, 'uint', n).toReadOnly()

    const per = bins / SCAN
    const hist = this.histogram
    this.prefixNode = Fn(() => {
      const lid = invocationLocalIndex
      const first = lid.mul(per).toVar()
      const shared = workgroupArray('uint', SCAN)
      const own = uint(0).toVar()
      Loop({ start: uint(0), end: uint(per), type: 'uint', condition: '<' }, ({ i }: { i: unknown }) => {
        own.addAssign(atomicLoad(hist.element(first.add(i))))
      })
      shared.element(lid).assign(own)
      workgroupBarrier()
      // inclusive scan across the workgroup (Hillis–Steele)
      for (let step = 1; step < SCAN; step *= 2) {
        const add = select(lid.greaterThanEqual(uint(step)), shared.element(lid.sub(uint(step)).min(uint(SCAN - 1))), uint(0)).toVar()
        workgroupBarrier()
        shared.element(lid).addAssign(add)
        workgroupBarrier()
      }
      const at = shared.element(lid).sub(own).toVar()
      Loop({ start: uint(0), end: uint(per), type: 'uint', condition: '<' }, ({ i }: { i: unknown }) => {
        const k = first.add(i)
        const c = atomicLoad(hist.element(k)).toVar()
        atomicStore(offsets.element(k), at)
        atomicStore(hist.element(k), uint(0))
        at.addAssign(c)
      })
    })().compute(SCAN, [SCAN]).setName('DepthSortPrefix')

    this.scatterNode = Fn(() => {
      const slot = atomicAdd(offsets.element(keysR.element(instanceIndex)), uint(1))
      fellW.element(slot).assign(instanceIndex)
    })().compute(n, [workgroup]).setName('DepthSortScatter')

    this.settleNode = Fn(() => {
      const j = instanceIndex
      const id = fellR.element(j).toVar()
      const key = keysR.element(id).toVar()
      // how many of this bin lie before and after this slot (a bin is a run of equal keys)
      const before = uint(0).toVar(), after = uint(0).toVar()
      Loop({ start: uint(1), end: uint(SETTLE + 1), type: 'uint', condition: '<' }, ({ i }: { i: unknown }) => {
        If(j.lessThan(i), () => { Break() })
        If(keysR.element(fellR.element(j.sub(i))).notEqual(key), () => { Break() })
        before.addAssign(1)
      })
      Loop({ start: uint(1), end: uint(SETTLE + 1), type: 'uint', condition: '<' }, ({ i }: { i: unknown }) => {
        If(j.add(i).greaterThanEqual(uint(n)), () => { Break() })
        If(keysR.element(fellR.element(j.add(i))).notEqual(key), () => { Break() })
        after.addAssign(1)
      })
      const size = before.add(after).add(1).toVar()
      const slot = j.toVar()
      // every blob of a small bin sees the whole bin, so they agree on its size and each takes a different slot
      If(size.lessThanEqual(uint(SETTLE)), () => {
        const first = j.sub(before).toVar()
        const rank = uint(0).toVar()
        Loop({ start: uint(0), end: size, type: 'uint', condition: '<' }, ({ i }: { i: unknown }) => {
          If(fellR.element(first.add(i)).lessThan(id), () => { rank.addAssign(1) })
        })
        slot.assign(first.add(rank))
      })
      orderW.element(slot).assign(id)
    })().compute(n, [workgroup]).setName('DepthSortSettle')
  }

  /** Runs the prefix, scatter and settle passes (the keys and histogram must already be written). */
  order(renderer: { compute: (n: never) => void }) {
    renderer.compute(this.prefixNode as never)
    renderer.compute(this.scatterNode as never)
    renderer.compute(this.settleNode as never)
  }

  /** The same sort on the CPU, from keys already in `keysAttr`. Stable: equal keys keep index order. */
  sortCPU(keys: Uint32Array = this.keysAttr.array as Uint32Array) {
    const counts = this.cpuCounts
    counts.fill(0)
    const n = this.count
    for (let i = 0; i < n; i++) counts[keys[i]]++
    let sum = 0
    for (let b = 0; b < this.bins; b++) { const c = counts[b]; counts[b] = sum; sum += c }
    const order = this.orderAttr.array as Uint32Array
    for (let i = 0; i < n; i++) order[counts[keys[i]]++] = i
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

  /** Frees the sort's GPU buffers. */
  dispose() {
    for (const a of this.attrs) a.dispose()
  }
}
