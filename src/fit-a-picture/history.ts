/**
 * The loss after every step, kept at bounded size: up to 32k points, and once
 * full, neighbors are averaged so each point covers twice as many steps.
 */

export const HISTORY_CAP = 1 << 15

/** Point i is the mean loss over steps i·stride + 1 … (i + 1)·stride. `sum`/`n` hold a part-filled point. */
export type History = { data: Float32Array; length: number; stride: number; steps: number; sum: number; n: number }
export const newHistory = (): History => ({ data: new Float32Array(HISTORY_CAP), length: 0, stride: 1, steps: 0, sum: 0, n: 0 })

export function record(h: History, loss: number) {
  h.steps++
  h.sum += loss
  if (++h.n < h.stride) return
  h.data[h.length++] = h.sum / h.n
  h.sum = 0
  h.n = 0
  if (h.length === HISTORY_CAP) {
    for (let i = 0; i < HISTORY_CAP / 2; i++) h.data[i] = (h.data[2 * i] + h.data[2 * i + 1]) / 2
    h.length = HISTORY_CAP / 2
    h.stride *= 2
  }
}
