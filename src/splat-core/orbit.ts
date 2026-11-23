import * as THREE from 'three'
import type { Lens } from './blobs.ts'

/** Where the orbit camera is: it circles `target` at `distance`, looking at it. */
export interface Orbit {
  /** The point it looks at. */
  target: [number, number, number]
  /** How far from the target it is. */
  distance: number
  /** Degrees around the vertical axis; 0 looks from +Z. */
  azimuth: number
  /** Degrees above the horizon. */
  elevation: number
}

/** The camera's vertical field of view, in degrees. */
export const FOV = 35

/** The vertical field of view of the engine's `Stage` camera, in degrees. */
export const STAGE_FOV = 40

/** Places a three.js camera for an orbit and a canvas aspect. */
export function placeCamera(cam: THREE.PerspectiveCamera, o: Orbit, aspect: number) {
  const { target, distance, azimuth, elevation } = o
  const az = THREE.MathUtils.degToRad(azimuth)
  const el = THREE.MathUtils.degToRad(Math.max(-89, Math.min(89, elevation)))
  cam.position.set(
    target[0] + distance * Math.sin(az) * Math.cos(el),
    target[1] + distance * Math.sin(el),
    target[2] + distance * Math.cos(az) * Math.cos(el),
  )
  cam.up.set(0, 1, 0)
  cam.lookAt(target[0], target[1], target[2])
  cam.aspect = aspect
  cam.near = Math.max(0.005, distance / 200)
  cam.far = distance * 50 + 10
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
}

/** The projection of a placed camera as a `Lens`, in CSS pixels. */
export function lensOf(cam: THREE.PerspectiveCamera, width: number, height: number): Lens {
  const P = cam.projectionMatrix.elements
  return { view: cam.matrixWorldInverse.elements, width, height, fx: (P[0] * width) / 2, fy: (P[5] * height) / 2, ortho: false }
}

/** A lens for an orbit without any renderer: for the software views and tests. */
export function orbitLens(o: Orbit, width: number, height: number): Lens {
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200)
  placeCamera(cam, o, height > 0 ? width / height : 1)
  return lensOf(cam, width, height)
}


/** The world point pixel art is held on the art's grid at, and the turn, height and distance of the view it was set for. */
export interface SnapAnchor {
  /** The world point held on the grid. */
  at: [number, number, number]
  /** The view's turn, height and distance when it was set, as one key. */
  view: string
}

/**
 * Where pixel art's `snap` holds the picture on the art's grid, for the view `o`, given where it was last (`kept`).
 * While the view turns or zooms about its target, the target is the one point that stays put on the screen, so the
 * anchor is the target and the picture never jumps: a point off it (the world's origin, at first) crosses half an art
 * pixel now and then, and the whole scene jumped a pixel at once as a Diorama scene rocked (Matt saw it, 2026-11-23).
 * While only the target moves (a pan, a camera that follows) the anchor stays where it was in the world, so the scene
 * still moves by whole pixels.
 */
export function snapAnchor(kept: SnapAnchor | undefined, o: Orbit): SnapAnchor {
  const view = `${o.azimuth}|${o.elevation}|${o.distance}`
  return kept && kept.view === view ? kept : { at: [o.target[0], o.target[1], o.target[2]], view }
}
