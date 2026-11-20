/**
 * @blobscape/engine: animated Gaussian splats on three.js's WebGPU renderer
 * (with its WebGL 2 fallback). Splats that move and are made, not captured:
 * creatures on bones, scenes written as data, and pixel art drawn from them.
 *
 * Start with `Stage` (one creature or scene on a canvas). Under it, `SplatWorld`
 * is a three.js object holding every blob of every actor; `Skeleton` and the
 * posing helpers move them; `sculpt` and `compileScene` make them; the .glb
 * readers and writers carry them to Blender, game engines and three.js.
 */

// the front door
export * from './stage.ts'
export type { Actor as StageActor } from './stage.ts'
export type { Actor } from './engine.ts'
export * from './engine.ts'
export * from '../splat-core/orbit.ts'
export { Blobs, type Vec3 } from '../splat-core/blobs.ts'

// bones and moves
export * from './rig.ts'
export * from './stretch.ts'
export * from './posing.ts'
export * from './mix.ts'
export * from './ik.ts'
export * from './steps.ts'
export * from './swing.ts'
export * from './xpbd.ts'
export * from './morph.ts'
export * from './pick.ts'

// making blobs
export type { Shape } from './voxel.ts'
export * from './voxel.ts'
export * from './sculpt.ts'
export * from './body.ts'
export * from './fur.ts'
export * from './built.ts'
export * from './forms.ts'
export * from './life.ts'
export * from './erode.ts'
export * from './grow.ts'
export * from './weather.ts'
export * from './daylight.ts'
export * from './sceneDoc.ts'
export * from './mpm.ts'
export * from './solids.ts'
export * from './water.ts'
export * from './sceneWater.ts'

// what's drawn
export * from './pixelPass.ts'
export type { PixelLook, Frame, Rgb } from '../splat-core/pixel.ts'
export { pixelArt } from '../splat-core/pixel.ts'
export type { MarkKind, MarkLook, MarkSample, OutlinePen } from '../splat-core/marks.ts'
export { MARK_KINDS, markAt, lineWeight } from '../splat-core/marks.ts'
export { InkLines } from './inkLines.ts'
export * from '../splat-core/cel.ts'
export { CelPass } from './celPass.ts'
export * from '../splat-core/neon.ts'
export { NeonPass } from './neonPass.ts'
export * from '../splat-core/glass.ts'
export * from '../splat-core/glitch.ts'
export { GlassPass } from './glassPass.ts'
export * from './blocks.ts'
export { BlockView, BLOCK_LIGHTS, EDGE_WIDTH, LAMP_WRAP, type BlockActor } from './blockView.ts'
export * from '../splat-core/wash.ts'
export { WashPass } from './washPass.ts'
export type { GlyphCell, GlyphLook, GlyphSet, Probe } from '../splat-core/glyphs.ts'
export { GLYPHS, QUADS, RAMP, RAMP_INK, SHADES, STROKES, blockFor, brailleFor, charOf, glyphAtlas, glyphBit, glyphCell, glyphScale, glyphText, rampFor, setBit, shapeCell, strokeFor, toneOf } from '../splat-core/glyphs.ts'
export { GlyphPass } from './glyphPass.ts'
export * from './lod.ts'
export * from './edit.ts'
export * from './depth.ts'
export * from './reflect.ts'
export * from './mirror.ts'
export * from './lens.ts'
export * from '../splat-core/optics.ts'

// files and sheets
export * from './glb.ts'
export * from './bakeSheet.ts'
export * from './spriteSheet.ts'
// a rigged model (triangles on bones) as splats on the same bones
export { readSkinnedGlb, splatModel, MODEL_FPS, type SkinnedModel, type SplatOptions } from './skinnedModel.ts'

// creatures to start from
export { ZOO, type Move, type Species } from './zoo/index.ts'
export { makeFox, FOX } from './zoo/fox.ts'
export { makeFrog, FROG } from './zoo/frog.ts'
export { makeElf, ELF } from './zoo/elf.ts'
export { makeDragon, DRAGON } from './zoo/dragon.ts'
export { makeMonster, monsterSpecies, MAX_SEED } from './zoo/monster.ts'
export * from './colliders.ts'
