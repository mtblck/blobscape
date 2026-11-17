import * as THREE from 'three'
import type { Lens } from './blobs.ts'

/** Where the orbit camera is: it circles `target` at `distance`, looking at it. */
export interface Orbit {
  target: [number, number, number]
  distance: number
  /** Degrees around the vertical axis; 0 looks from +Z. */
  azimuth: number
  /** Degrees above the horizon. */
  elevation: number
}

export const FOV = 35

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

