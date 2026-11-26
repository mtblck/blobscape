/**
 * One lamp's wax as the page draws it (pure): the simulation and the discs cut from it, a frame at a time. The worker
 * runs one on the wall clock; off screen the page runs one on the stage's clock.
 */
import { VESSEL } from './lamp.ts'
import { makeDiscs, surfaceOf } from './surface.ts'
import { Wax, type WaxKnobs } from './wax.ts'

/** A frame of the wax: its discs (centers in the glass's own frame, standing on its floor) and what it is doing. */
export interface WaxFrame {
  count: number
  center: Float32Array
  normal: Float32Array
  temp: Float32Array
  blobs: number
  events: Wax['events']
  time: number
}

/** The most discs a grid of side `cell` can need: the pool's top and side and blobs all round. */
export const discsFor = (cell: number) => Math.ceil(0.55 / (cell * cell))

export class WaxRun {
  readonly wax: Wax
  readonly cell: number
  private readonly capacity: number

  /** A lamp already `warm` seconds on, so a visitor sees wax moving at once. */
  constructor(cell: number, seed: number, knobs: WaxKnobs, warm: number) {
    this.cell = cell
    this.capacity = discsFor(cell)
    this.wax = new Wax(VESSEL, 0.12, seed)
    this.wax.knobs = { ...knobs }
    this.wax.run(warm)
  }

  advance(seconds: number, _now?: number) { this.wax.advance(seconds) }

  /** The discs as the wax stands; `clock` is the page's seconds, for the skin's slow wobble. */
  frame(clock: number): WaxFrame {
    const d = surfaceOf(this.wax, clock, this.cell, makeDiscs(this.capacity))
    return { count: d.count, center: d.center, normal: d.normal, temp: d.temp, blobs: this.wax.blobs.length, events: { ...this.wax.events }, time: this.wax.time }
  }
}
