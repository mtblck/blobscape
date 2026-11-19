import type * as THREE from 'three'
import type { SparkRenderer } from '@sparkjsdev/spark'
import { drawsTo, markDrawn } from './drawn.ts'

/**
 * Draws a Spark scene only when something changed, not 60 times a second:
 * kinder to laptops and phones. `invalidate()` asks for a few more frames.
 *
 * It also keeps drawing while Spark is mid-sort: Spark sorts in a worker and
 * only adopts a finished sort (or a newly loaded mesh) on the next render, so
 * stopping on a frame count alone can leave the view blank or stale.
 */
export class RenderLoop {
  private raf = 0
  private framesLeft = 10
  private stopped = false
  /** While above zero, the loop skips frames (someone else is using the GPU). */
  hold = 0

  constructor(
    private renderer: THREE.WebGLRenderer,
    private spark: SparkRenderer,
    private draw: () => void,
  ) {
    drawsTo(renderer.domElement, () => this.invalidate(2))
    const tick = () => {
      if (this.stopped) return
      if (this.resize()) this.invalidate(2)
      const busy = this.spark.dirty || this.spark.sorting || this.spark.sortDirty
      if ((this.framesLeft > 0 || busy) && this.hold === 0) {
        this.framesLeft = Math.max(0, this.framesLeft - 1)
        this.draw()
        markDrawn(this.renderer.domElement)
      }
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  invalidate(frames = 12) {
    this.framesLeft = Math.max(this.framesLeft, frames)
  }

  stop() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
  }

  /** Matches the drawing buffer to the canvas's CSS size. True when it changed. */
  private resize(): boolean {
    const canvas = this.renderer.domElement
    const { clientWidth: w, clientHeight: h } = canvas
    const dpr = this.renderer.getPixelRatio()
    if (w && h && (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr))) {
      this.renderer.setSize(w, h, false)
      return true
    }
    return false
  }
}
