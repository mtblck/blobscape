import type { PanelId } from './panels.ts'
import { DOC_BYTES } from './scene.ts'
import campfireSource from '../diorama/scenes/campfire.ts?raw'
import layoutSource from './layout.ts?raw'
import meshSource from './meshes.ts?raw'
import shaderSource from './shader.ts?raw'
import kitSource from './meshKit.ts?raw'
import splatSource from './splats.ts?raw'
import meadowBuild from './meadow/build.ts?raw'
import meadowDoc from './meadow/doc.ts?raw'
import meadowLayout from './meadow/layout.ts?raw'
import meadowMeshes from './meadow/meshes.ts?raw'
import meadowShader from './meadow/shader.ts?raw'

const lines = (source: string) => source.split('\n').length

/** How much was written for each panel of a scene, counted from the source itself: the cards' "Written as" line. */
export function written(scene: string): Record<PanelId, string> {
  if (scene === 'fox') return {
    shader: `${lines(meadowShader) + lines(meadowLayout)} lines, most of them one shader`,
    meshes: `${lines(meadowMeshes) + lines(meadowLayout) + lines(kitSource)} lines of three.js`,
    splats: `${lines(splatSource)} lines, and the blobs made elsewhere`,
    blobscape: `${lines(meadowDoc) + lines(meadowBuild)} lines: a description, the Creature page’s fox by name, and the grass`,
  }
  return {
    shader: `${lines(shaderSource) + lines(layoutSource)} lines, most of them one shader`,
    meshes: `${lines(meshSource) + lines(layoutSource) + lines(kitSource)} lines of three.js`,
    splats: `${lines(splatSource)} lines, and the blobs made elsewhere`,
    blobscape: `${lines(campfireSource)} lines of data (${(DOC_BYTES / 1024).toFixed(1)} KB as JSON)`,
  }
}
