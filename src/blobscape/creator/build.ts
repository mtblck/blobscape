import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/orbit.ts'
import { composeScene } from '../../splat-engine/compose.ts'
import { checkProject, type Placed, type ProjectLight, type SceneProject } from '../../splat-engine/project.ts'
import { compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { LIBRARY, isCreature, libraryProp } from './library.ts'

/**
 * Building a scene in code the way Scene Creator builds one by hand (docs/scenes-from-props.md): pick a land, set
 * library props down on it, light it. What comes out is a `SceneProject`, the very thing the page saves and opens
 * (Open a file takes it as a `.blobscape.json`), and the description it makes (`composeScene`), which Diorama draws
 * and `npm run scene` reviews. Nothing is copied: the scene names each prop, so a later change to a prop reaches it.
 *
 *   const s = new SceneBuilder('Lantern garden', 'plain-turf')
 *   s.put('tall-stone-lantern', -0.5, 0.2)            // stood on the ground there, as a drop in Props mode stands it
 *   s.put('bamboo', 0.6, -0.3, { turn: 40, size: 1.1, phase: 0.3 })
 *   s.at('lily-pad', [0.1, -0.045, 0.5])              // exactly there (on water, say)
 *   s.light({ live: { hour: 21 } })
 *   const project = s.project(), doc = s.doc()
 */

/** How a prop is set down: turned degrees about the upright, sized, lifted off the ground, its moves later by a share of the loop, its lamps always lit, or held still. */
export interface PutOptions { turn?: number; size?: number; lift?: number; phase?: number; lit?: 'dark' | 'always'; still?: boolean }

export class SceneBuilder {
  private readonly placed: Placed[] = []
  private readonly landDoc: SceneDoc
  private ground?: (x: number, z: number, top: number, bottom: number) => number
  private view?: Orbit
  private lighting?: ProjectLight
  readonly name: string
  readonly land: string
  readonly loop: number

  constructor(name: string, land: string, { loop }: { loop?: number } = {}) {
    const entry = LIBRARY.find((e) => e.id === land)
    if (!entry || entry.kind !== 'land') throw new Error(`No land called "${land}": one of ${LIBRARY.filter((e) => e.kind === 'land').map((e) => e.id).join(', ')}`)
    this.name = name
    this.land = land
    this.landDoc = libraryProp(land)!.doc
    this.loop = loop ?? this.landDoc.loop
  }

  /** Every prop and land the library has, by id, with what it is: what `put` and the constructor take. */
  static library(): { id: string; kind: string; name: string; about: string }[] {
    return LIBRARY.map((e) => ({ id: e.id, kind: e.kind, name: e.name, about: e.about }))
  }

  /** The height of the land's ground under (x, z), as a prop dropped there would stand. */
  groundAt(x: number, z: number): number {
    this.ground ??= compileScene(this.landDoc, { puffs: false }).ground
    const y = this.ground(x, z, 4, -1)
    return y > -1 ? y : 0
  }

  /** Sets a prop down on the ground under (x, z). Returns its index among the props. */
  put(prop: string, x: number, z: number, o: PutOptions = {}): number {
    return this.at(prop, [x, this.groundAt(x, z) + (o.lift ?? 0), z], o)
  }

  /** Sets a prop down with its foot exactly at `at`. Returns its index among the props. */
  at(prop: string, at: Vec3, { turn = 0, size = 1, phase, lit, still }: PutOptions = {}): number {
    const entry = LIBRARY.find((e) => e.id === prop)
    if (!entry || entry.kind === 'land') throw new Error(`No prop called "${prop}" (SceneBuilder.library() lists them)`)
    this.placed.push({ prop, at: [...at], turn, size, ...(phase !== undefined ? { phase } : {}), ...(lit ? { lit } : {}), ...(still ? { still } : {}) })
    return this.placed.length - 1
  }

  /** Moves, turns or sizes prop `i`, as Arrange mode does. */
  arrange(i: number, change: Partial<Pick<Placed, 'at' | 'turn' | 'size' | 'phase' | 'lit' | 'still'>>): this {
    Object.assign(this.placed[i], change)
    return this
  }

  /** Takes prop `i` away. */
  remove(i: number): this {
    this.placed.splice(i, 1)
    return this
  }

  /** The light, sky and air where they differ from the land's own, as Light mode sets them. */
  light(l: ProjectLight): this {
    this.lighting = l
    return this
  }

  /** Where the view starts. */
  camera(o: Orbit): this {
    this.view = o
    return this
  }

  /** The scene as Scene Creator saves and opens it. Throws with every mistake as `where: what`. */
  project(): SceneProject {
    const p: SceneProject = {
      kind: 'blobscape-project', version: 1, name: this.name, loop: this.loop, land: this.land,
      props: this.placed.map((x) => ({ ...x, at: [...x.at] as Vec3 })),
      ...(this.view ? { camera: this.view } : {}), ...(this.lighting ? { light: this.lighting } : {}),
    }
    const problems = checkProject(p, (id) => LIBRARY.some((e) => e.id === id))
    if (problems.length) throw new Error(`${this.name}: ${problems.join('; ')}`)
    return p
  }

  /** The scene as one description, as Diorama would draw it. Creatures are built their own way, so a scene for Diorama holds none yet. */
  doc(): SceneDoc {
    const creature = this.placed.find((p) => isCreature(p.prop))
    if (creature) throw new Error(`${this.name}: ${String(creature.prop)} is a creature, which only Scene Creator sets down for now`)
    return composeScene(this.project(), libraryProp)
  }
}
