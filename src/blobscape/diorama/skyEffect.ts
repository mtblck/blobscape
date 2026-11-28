import type { Actor } from '../../splat-engine/engine.ts'
import { compileScene, type CompiledScene } from '../../splat-engine/sceneDoc.ts'
import { auroraLight, effectSpacing, skyEffectDoc, type SkyEffectId } from '../../splat-engine/skyEffects.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import type { Diorama } from './scenes.ts'

/**
 * A sky effect laid behind a Diorama scene (splat-engine/skyEffects.ts has the recipes): an actor of its own beside the
 * scene's, made once a scene and effect, and shown by how much a night the sky is and how clear. The scene itself is
 * never cut again for it.
 */
export class SceneSkyEffect {
  readonly actor: Actor
  private readonly c: CompiledScene
  private readonly view: Diorama['views'][number]['orbit']

  constructor(d: Diorama, readonly id: SkyEffectId) {
    this.view = d.views[0].orbit
    this.c = compileScene(skyEffectDoc(id, this.view, d.loop), { puffs: false })
    this.actor = buildVoxels(this.c.spec(effectSpacing(this.view))) as Actor
    // drawn as blocks, it stays soft blobs among the cubes, as falling weather does by default
    this.actor.weather = true
  }

  /** Poses it for `t` seconds with `out` of it showing (`effectOut`). */
  pose(t: number, out: number) {
    const sk = this.actor.skeleton
    this.c.pose(sk, t)
    if (out < 1) for (let b = 0; b < sk.size.length; b++) sk.size[b] *= out
    sk.update()
  }

  /** The light it throws onto the scene, if any. */
  lights(out: number): PointLight[] {
    const l = this.id === 'aurora' ? auroraLight(this.view, out) : undefined
    return l ? [l] : []
  }
}
