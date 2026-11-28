import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FULL_LEVELS, STEADY, rampPalette } from '../splat-core/pixel.ts'
import { readFileSync } from 'node:fs'
import { cutAsk, detailStart, pixelSizeAt, pixelZoomAsked, pixelCelLook, pixelFlags, pixelFor, pixelFrom, pixelLookOf, pixelStart, styleStart, type Finish } from './styleSettings.ts'

const FINISH: Finish = { dither: 0.5, glow: 1.5, outline: true, edges: true, sky: true, steps: false, bands: 1, heat: 2 }
const own: [number, number, number][] = [[10, 20, 30], [200, 210, 220]]
const sky: [[number, number, number], [number, number, number]] = [[0, 0, 40], [90, 90, 120]]

test('a scene’s finish starts pixel art, and the address overrides it', () => {
  const s = pixelStart(FINISH)
  assert.equal(s.palette, 'none')
  assert.equal(s.dither, 0.5)
  assert.equal(s.glow, 1.5)
  assert.equal(s.outline, true)
  assert.equal(s.heat, 2)
  assert.equal(s.bands, 1)
  assert.equal(s.texel, 0)
  assert.equal(s.shade, false)
  const q = pixelStart(FINISH, new URLSearchParams('px=4&glow=9&texel=3&shade=1&steps=1&heat=7&own=0&parts=0&sort=radix&rock=0'))
  assert.deepEqual([q.size, q.glow, q.texel, q.shade, q.steps, q.heat, q.own, q.lines, q.exact, q.rock], [4, 4, 3, true, true, 3, false, false, true, false])
  // a pixel size the page doesn't offer is the smallest
  assert.equal(pixelStart(FINISH, new URLSearchParams('px=5')).size, 2)
  assert.equal(styleStart(FINISH).style, 'blocks')
})

test('a new scene brings its own finish and keeps the visitor’s other choices', () => {
  const was = { ...pixelStart(FINISH), palette: 'gameboy', size: 4, own: false, shade: true }
  const next = pixelFor(was, { ...FINISH, dither: 0.2, outline: false, heat: undefined })
  assert.deepEqual([next.palette, next.dither, next.outline, next.heat], ['none', 0.2, false, 0])
  assert.deepEqual([next.size, next.own, next.shade], [4, false, true])
})

test('settings kept by an older page are read back over a start', () => {
  const start = pixelStart(FINISH)
  const read = pixelFrom(start, { size: 6, dither: 'lots', edges: false, parts: true })
  assert.equal(read.size, 6)
  assert.equal(read.dither, 0.5)
  assert.equal(read.lines, true)
  assert.equal(pixelFrom(start, { edges: false, parts: false }).lines, false)
  assert.deepEqual(pixelFrom(start, null), start)
})

test('the pixel look follows the settings and the scene', () => {
  const s = { ...pixelStart(FINISH), palette: 'own' }
  const look = pixelLookOf(s, { colors: own, sky, finish: FINISH, loop: 12 })
  // the scene's own palette with its ramp (a step darker and lighter of each color), and only its own
  assert.deepEqual(look.palette, rampPalette(own))
  assert.deepEqual(look.palette.slice(0, own.length), own)
  assert.deepEqual(pixelLookOf(s, { colors: own, finish: FINISH, loop: 12 }, pixelFlags(new URLSearchParams('ramps=0'))).palette, own)
  assert.deepEqual(pixelLookOf({ ...s, palette: 'gameboy' }, { colors: own, finish: FINISH, loop: 12 }).palette, own)
  assert.deepEqual(look.outline, [10, 20, 30])
  // full color rounds to even steps; a palette has none
  assert.equal(look.levels, undefined)
  assert.equal(pixelLookOf({ ...s, palette: 'none' }, { colors: [], finish: FINISH, loop: 12 }).levels, FULL_LEVELS)
  assert.deepEqual(look.sky, sky)
  assert.equal(look.edges, 1)
  assert.equal(look.parts, true)
  assert.equal(look.steady, STEADY)
  assert.equal(look.heat?.pixels, 2)
  // no lines: no edges nor parts; no sky unless something forces it
  const plain = pixelLookOf({ ...s, lines: false, sky: false, heat: 0 }, { colors: [], sky, finish: FINISH, loop: 12 })
  assert.deepEqual([plain.edges, plain.parts, plain.sky, plain.heat], [0, false, undefined, undefined])
  assert.deepEqual(plain.outline, [11, 16, 38])
  assert.deepEqual(pixelLookOf({ ...s, sky: false }, { colors: own, sky, skyForced: true, finish: FINISH, loop: 12 }).sky, sky)
  // a scene that has no color lines of its own gets lines only between parts
  assert.equal(pixelLookOf(s, { colors: own, finish: { ...FINISH, edges: false }, loop: 12 }).edges, 0)
  // the address's switches
  const off = pixelLookOf(s, { colors: own, finish: FINISH, loop: 12 }, pixelFlags(new URLSearchParams('steady=0&calm=0')))
  assert.deepEqual([off.steady, off.calm, off.tidy], [0, false, true])
  // the rim needs a sun and a starting view
  assert.equal(look.rim, undefined)
  assert.ok(pixelLookOf(s, { colors: own, finish: FINISH, loop: 12, sun: [0.4, 0.8, 0.4], start: { target: [0, 0, 0], distance: 3, azimuth: 20, elevation: 25 } }).rim)
})

test('only a style that lights the scene itself, or shading each pixel, cuts it unlit', () => {
  const s = { ...styleStart(FINISH), style: 'pixel' as const }
  assert.deepEqual(cutAsk(s, own), { plain: false, steps: [], texel: 0 })
  assert.equal(cutAsk(styleStart(FINISH), own).plain, true)
  assert.equal(cutAsk({ ...s, style: 'cel' }, own).plain, true)
  assert.equal(cutAsk({ ...s, style: 'oil' }, own).plain, false)
  assert.equal(cutAsk({ ...s, pixel: { ...s.pixel, shade: true } }, own).plain, true)
  // painted steps and banded light stay whatever the style, so a change of style cuts nothing again for them
  const stepped = { ...s, pixel: { ...s.pixel, steps: true, texel: 3 } }
  assert.deepEqual(cutAsk(stepped, own).steps, own)
  assert.equal(cutAsk({ ...stepped, style: 'oil' }, own).texel, 3)
})

test('shading each pixel lights by the scene’s sun in two tones', () => {
  const c = pixelCelLook([0, 1, 0], 0.4)
  assert.equal(c.tones, 2)
  assert.deepEqual(c.from, [0, 1, 0])
  assert.ok(c.shade![2] > c.shade![0])
  assert.equal(pixelCelLook(undefined).from, undefined)
})

test('every page starts a style at the same detail and grows pixels the same way on zooming in', () => {
  // Finest, but a phone starts pixel art at Fine and the whole-screen styles at Chunky; blobs stay at Finest
  assert.equal(detailStart('pixel', false), 3)
  assert.equal(detailStart('cel', false), 3)
  assert.equal(detailStart('pixel', true), 2)
  assert.equal(detailStart('glitch', true), 2)
  assert.equal(detailStart('cel', true), 0)
  assert.equal(detailStart('blobs', true), 3)
  assert.equal(detailStart('blobs', false), 3)
  const s = pixelStart(FINISH)
  assert.equal(pixelSizeAt(s, 6, 6), 2)
  assert.equal(pixelSizeAt(s, 6, 3), 4)
  assert.equal(pixelSizeAt(s, 6, 12), 2)
  assert.equal(pixelSizeAt(s, 6, 3, false), 2)
  assert.equal(pixelZoomAsked(new URLSearchParams('pixelzoom=0')), false)
  assert.equal(pixelZoomAsked(), true)
})

test('Diorama and Scene Creator put a style on the stage only through the shared hook', () => {
  // Matt, 2026-11-22: a style is drawn the same wherever it is used. A page that sets these on its stage itself
  // has a copy of the wiring that can fall behind, which is how Scene Creator missed Diorama's pixel updates
  for (const page of ['PixelDiorama.tsx', 'SceneCreator.tsx']) {
    const text = readFileSync(new URL(`./${page}`, import.meta.url), 'utf8')
    assert.ok(text.includes('useStyleOnStage('), `${page} uses the hook`)
    for (const call of ['.setPixels(', '.setGlitch(', '.setSharpness(', '.setSort(']) if (text.includes(call)) assert.fail(`${page} calls ${call} itself`)
    for (const own of ['zoomStep(', 'DETAIL[2].id', 'DETAIL[3].id']) if (text.includes(own)) assert.fail(`${page} has its own ${own}`)
  }
  // the other pages that draw pixel art: none sets a pixel look on its stage by a wiring of its own, and the two that
  // show a scene as Diorama would (Biome Islands, the engine page) take the look from the one definition
  for (const page of ['Islands.tsx', 'FourWays.tsx', 'lessons/PixelArt.tsx']) {
    const text = readFileSync(new URL(`./${page}`, import.meta.url), 'utf8')
    assert.ok(text.includes('useStyleOnStage('), `${page} uses the hook`)
    if (text.includes('.setPixels(')) assert.fail(`${page} calls .setPixels( itself`)
  }
  for (const page of ['Islands.tsx', 'Engine.tsx']) {
    const text = readFileSync(new URL(`./${page}`, import.meta.url), 'utf8')
    assert.ok(text.includes('pixelLookOf('), `${page} takes its pixel look from styleSettings.ts`)
    if (text.includes('STEADY')) assert.fail(`${page} builds a pixel look of its own`)
  }
})
