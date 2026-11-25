// The @blobscape/engine API reference, read with TypeDoc from the package's own type declarations and boiled down to
// what the docs page (/engine/docs/) shows: each export's name, its doc comment, and its shape (a function's
// signatures, an interface's properties, a class's constructor, properties and methods, a type or a value's type),
// grouped by the module that declares it, and the modules into the parts of `GROUPS`. The page draws it in the
// site's own markup, under the site's CSP, which TypeDoc's own HTML theme would not pass (it has inline scripts).
//
// TypeDoc needs TypeScript 6's compiler API, which the site's TypeScript 7 no longer ships, so this lives in its own
// small package: `npm run docs` at the repo root installs it and writes src/blobscape/engineApi.json;
// scripts/engine-api.test.mjs fails when that file is behind the code.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Application, ReflectionKind } from 'typedoc'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
/** Where the declarations are written for TypeDoc to read (git-ignored; inside the repo so three.js's types resolve). */
const TYPES = join(here, '.types')
export const API_FILE = join(root, 'src/blobscape/engineApi.json')

/** Each module's heading on the page, in the words the site uses. */
export const TITLES = {
  'splat-engine/stage': 'Stage: a creature or scene on a canvas',
  'splat-engine/engine': 'SplatWorld: every blob in one three.js object',
  'splat-core/orbit': 'Orbit: where the camera looks from',
  'splat-core/blobs': 'Blobs',
  'splat-engine/rig': 'Bones and skins',
  'splat-engine/stretch': 'Skin that stretches',
  'splat-engine/posing': 'Posing by hand',
  'splat-engine/mix': 'Mixing poses',
  'splat-engine/ik': 'Reaching and feet on the ground',
  'splat-engine/steps': 'Footsteps',
  'splat-engine/swing': 'Loose parts that swing',
  'splat-engine/xpbd': 'Cloth solver',
  'splat-engine/morph': 'Morphs',
  'splat-engine/pick': 'Picking',
  'splat-engine/voxel': 'Shapes on a grid',
  'splat-engine/sculpt': 'Sculpting creatures',
  'splat-engine/body': 'Bodies from tubes and balls',
  'splat-engine/fur': 'Fur',
  'splat-engine/built': 'Built things: walls, steps, fences, arcades',
  'splat-engine/forms': 'Formations: crystals, columns, drips',
  'splat-engine/life': 'Living forms: trees, cacti, shells',
  'splat-engine/erode': 'Worn land',
  'splat-engine/grow': 'Growers',
  'splat-engine/weather': 'Weather that lands',
  'splat-engine/daylight': 'The sky through a day',
  'splat-engine/skyRecipes': 'Weather, clouds and wind as recipes',
  'splat-engine/heavens': 'The shared sky: moon, sun, stars and clouds',
  'splat-engine/snowCover': 'Snow that lies',
  'splat-engine/sceneWeather': 'Weather over a scene',
  'splat-engine/timeOfDay': 'Times of day',
  'splat-engine/tags': 'Tags on props and lands',
  'splat-engine/project': 'Scenes made of a land and props',
  'splat-engine/compose': 'A project as one scene',
  'splat-engine/sceneDoc': 'Scenes written as data',
  'splat-engine/mpm': 'Sand, snow and goo',
  'splat-engine/solids': 'Solids for sand, snow and goo',
  'splat-engine/water': 'Water that ripples',
  'splat-engine/sceneWater': 'Water in a scene written as data',
  'splat-engine/lava': 'Lava that flows',
  'splat-engine/potion': 'A potion that brews',
  'splat-engine/fire': 'Fire that burns',
  'splat-engine/sceneFire': 'Fire in a scene written as data',
  'splat-engine/pixelPass': 'Pixel mode',
  'splat-core/pixel': 'Pixel art',
  'splat-core/marks': 'Brush and ink marks',
  'splat-engine/inkLines': 'Drawn outlines',
  'splat-core/glyphs': 'Characters',
  'splat-engine/glyphPass': 'The picture as characters',
  'splat-core/cel': 'Cel shading: the arithmetic',
  'splat-engine/celPass': 'Cel shading',
  'splat-core/neon': 'Neon: the arithmetic',
  'splat-engine/neonPass': 'Neon',
  'splat-core/glass': 'Stained glass: the arithmetic',
  'splat-core/glitch': 'Tech glitch',
  'splat-engine/glassPass': 'Stained glass',
  'splat-engine/blocks': 'Blocks: the arithmetic',
  'splat-engine/blockView': 'Blocks',
  'splat-core/wash': 'Watercolor: the arithmetic',
  'splat-core/halftone': 'Halftone print: the arithmetic',
  'splat-core/filters': 'Six filter looks: the arithmetic',
  'splat-engine/knitPass': 'Knitting',
  'splat-core/knit': 'Knitting: the arithmetic',
  'splat-engine/anaglyphPass': '3D glasses',
  'splat-core/anaglyph': '3D glasses: the arithmetic',
  'splat-engine/washPass': 'Watercolor',
  'splat-engine/halftonePass': 'Halftone print',
  'splat-engine/filterPass': 'Claymation, blueprint, thermal, paper cutout, mosaic and CRT',
  'splat-engine/styles/styles': 'The styles',
  'splat-engine/styles/catalog': 'The catalog: every style\'s settings',
  'splat-engine/styles/detail': 'Detail levels',
  'splat-engine/styles/brushLooks': 'Brush and ink, as settings',
  'splat-engine/styles/celLooks': 'Cel shading, as settings',
  'splat-engine/styles/blockLooks': 'Blocks, as settings',
  'splat-engine/styles/neonLooks': 'Neon, as settings',
  'splat-engine/styles/glassLooks': 'Stained glass, as settings',
  'splat-engine/styles/washLooks': 'Watercolor, as settings',
  'splat-engine/styles/halftoneLooks': 'Halftone print, as settings',
  'splat-engine/styles/filterLooks': 'The six filter looks, as settings',
  'splat-engine/styles/knitLooks': 'Knitting, as settings',
  'splat-engine/styles/anaglyphLooks': '3D glasses, as settings',
  'splat-engine/styles/glitchLooks': 'Tech glitch, as settings',
  'splat-engine/colliders': 'Colliders',
  'splat-engine/lod': 'Level of detail',
  'splat-engine/merge': 'Merged blobs for far ground',
  'splat-engine/edit': 'Cuts and paint',
  'splat-engine/depth': 'Depth for post effects',
  'splat-engine/reflect': 'Mirrors: the arithmetic',
  'splat-engine/mirror': 'Mirrors: what a flat mirror shows',
  'splat-engine/lens': 'A lens: glow and focus blur',
  'splat-engine/peel': 'See-through blobs that cross',
  'splat-core/optics': 'A lens: the arithmetic',
  'splat-engine/glb': 'Rigged .glb files',
  'splat-engine/skinnedModel': 'Rigged models to splats',
  'splat-engine/bakeSheet': 'Baking sprite sheets',
  'splat-engine/spriteSheet': 'Sprite sheet layout',
  'splat-engine/zoo/index': 'The zoo',
  'splat-engine/zoo/fox': 'Fox',
  'splat-engine/zoo/frog': 'Frog',
  'splat-engine/zoo/elf': 'Elf',
  'splat-engine/zoo/dragon': 'Dragon',
  'splat-engine/zoo/monster': 'Monsters from a seed',
}

/**
 * The parts of the reference, in page order: what most people need first, then the specialist pieces. Every module
 * is in exactly one, in the order given here.
 */
export const GROUPS = [
  { id: 'core', title: 'Core', doc: 'What every page needs: a stage on a canvas, the world of blobs it draws, the camera, and the bones that move them. Start here.', modules: ['splat-engine/stage', 'splat-engine/engine', 'splat-core/orbit', 'splat-core/blobs', 'splat-engine/rig', 'splat-engine/stretch'] },
  { id: 'movement', title: 'Movement', doc: 'Moves written by hand, poses mixed together, feet that find the ground, loose parts that swing after the body, and morphs.', modules: ['splat-engine/posing', 'splat-engine/mix', 'splat-engine/ik', 'splat-engine/steps', 'splat-engine/swing', 'splat-engine/morph'] },
  { id: 'creatures', title: 'Creatures', doc: 'Cutting a creature out of shapes, hanging it on bones and growing its fur, and the creatures that come ready made.', modules: ['splat-engine/sculpt', 'splat-engine/body', 'splat-engine/fur', 'splat-engine/zoo/index', 'splat-engine/zoo/fox', 'splat-engine/zoo/frog', 'splat-engine/zoo/elf', 'splat-engine/zoo/dragon', 'splat-engine/zoo/monster'] },
  { id: 'scenes', title: 'Shapes and scenes', doc: 'Scenes written as data and the shapes they are cut from: buildings, rock, plants, worn land and weather, scenes put together from a land and props, the weather, clouds and wind every scene shares, and the sun, moon and sky that light them through a day.', modules: ['splat-engine/sceneDoc', 'splat-engine/project', 'splat-engine/compose', 'splat-engine/tags', 'splat-engine/sceneWater', 'splat-engine/sceneFire', 'splat-engine/skyRecipes', 'splat-engine/sceneWeather', 'splat-engine/timeOfDay', 'splat-engine/heavens', 'splat-engine/snowCover', 'splat-engine/voxel', 'splat-engine/built', 'splat-engine/forms', 'splat-engine/life', 'splat-engine/erode', 'splat-engine/grow', 'splat-engine/weather', 'splat-engine/daylight'] },
  { id: 'pixels', title: 'Pixels and sprites', doc: 'Drawing a stage as pixel art, as brush and ink marks, as characters, cel shaded, in neon, as stained glass, in watercolor, as a halftone print, knitted, for 3D glasses, as clay, a blueprint, a thermal camera, cut paper, a mosaic or an old television, as blocks or glitching, and baking a creature into a sprite sheet.', modules: ['splat-engine/pixelPass', 'splat-core/pixel', 'splat-core/marks', 'splat-engine/inkLines', 'splat-core/glyphs', 'splat-engine/glyphPass', 'splat-engine/celPass', 'splat-core/cel', 'splat-engine/neonPass', 'splat-core/neon', 'splat-engine/glassPass', 'splat-core/glass', 'splat-engine/blockView', 'splat-engine/blocks', 'splat-core/glitch', 'splat-engine/washPass', 'splat-core/wash', 'splat-engine/halftonePass', 'splat-core/halftone', 'splat-engine/filterPass', 'splat-core/filters', 'splat-engine/knitPass', 'splat-core/knit', 'splat-engine/anaglyphPass', 'splat-core/anaglyph', 'splat-engine/bakeSheet', 'splat-engine/spriteSheet'] },
  { id: 'styles', title: 'Styles', doc: 'The looks as one catalog: each style\'s settings with their limits, names and where they start, the value a page holds for them, and the look each makes for the stage. The same definitions every page of this site draws from.', modules: ['splat-engine/styles/styles', 'splat-engine/styles/catalog', 'splat-engine/styles/detail', 'splat-engine/styles/brushLooks', 'splat-engine/styles/celLooks', 'splat-engine/styles/blockLooks', 'splat-engine/styles/neonLooks', 'splat-engine/styles/glassLooks', 'splat-engine/styles/washLooks', 'splat-engine/styles/halftoneLooks', 'splat-engine/styles/filterLooks', 'splat-engine/styles/knitLooks', 'splat-engine/styles/anaglyphLooks', 'splat-engine/styles/glitchLooks'] },
  { id: 'simulation', title: 'Simulation', doc: 'The solvers under cloth, under sand, snow and goo, under the ripples of a pond, under lava, under a bubbling potion and under a fire, for when you want to step them yourself.', modules: ['splat-engine/xpbd', 'splat-engine/mpm', 'splat-engine/solids', 'splat-engine/water', 'splat-engine/lava', 'splat-engine/potion', 'splat-engine/fire'] },
  { id: 'extras', title: 'Picking, detail and edits', doc: 'Finding what a tap hit, drawing fewer blobs far away, cutting and painting live, depth for effects after the draw, what a mirror shows, a lens with glow and focus blur, see-through blobs put in order where they cross, and solid shapes to stand on.', modules: ['splat-engine/pick', 'splat-engine/lod', 'splat-engine/merge', 'splat-engine/edit', 'splat-engine/depth', 'splat-engine/reflect', 'splat-engine/mirror', 'splat-engine/lens', 'splat-core/optics', 'splat-engine/peel', 'splat-engine/colliders'] },
  { id: 'files', title: 'Files and models', doc: 'Writing and reading rigged .glb files, and turning an ordinary rigged model into splats.', modules: ['splat-engine/glb', 'splat-engine/skinnedModel'] },
]
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.modules.map((m, i) => [m, { id: g.id, at: GROUPS.indexOf(g) * 1000 + i }])))

/** A doc comment as text: `code` kept in its backticks, {@link name} as `name`, without the issue numbers it was built under. */
const text = (comment) => (comment?.summary ?? [])
  .map((p) => (p.kind === 'inline-tag' ? `\`${p.target?.name ?? p.text.trim()}\`` : p.text))
  .join('').replace(/ \(issues? #\d+[^)]*\)/g, '').trim()
const tag = (comment, name) => (comment?.getTag(name)?.content ?? []).map((p) => p.text).join('').trim()
const type = (t) => (t ? t.toString() : 'unknown')
/** TypeDoc's name for a parameter taken apart where it is declared (`{ a, b }`): `options` reads better. */
const named = (name) => (name === '__namedParameters' ? 'options' : name)
const generics = (ps) => (ps?.length ? `<${ps.map((p) => p.name + (p.type ? ` extends ${type(p.type)}` : '')).join(', ')}>` : '')

/** One way to call a function, method or constructor, as code, with any parameter or return docs it has. */
function signature(sig, name) {
  const params = sig.parameters ?? []
  const s = { code: `${name}${generics(sig.typeParameters)}(${params.map((p) => `${p.flags.isRest ? '...' : ''}${named(p.name)}${p.flags.isOptional ? '?' : ''}: ${type(p.type)}`).join(', ')})${sig.kindOf(ReflectionKind.ConstructorSignature) ? '' : `: ${type(sig.type)}`}` }
  const documented = params.filter((p) => text(p.comment)).map((p) => ({ name: p.name, type: type(p.type), doc: text(p.comment) }))
  if (documented.length) s.params = documented
  const returns = tag(sig.comment, '@returns')
  if (returns) s.returns = { type: type(sig.type), doc: returns }
  return s
}

/** The properties and methods of an interface or class, in the order they are declared. */
function members(ref) {
  const props = [], methods = []
  for (const c of ref.children ?? []) {
    if (c.inheritedFrom || c.flags.isPrivate || c.flags.isProtected) continue
    const flags = { ...(c.flags.isStatic && { static: true }), ...(c.flags.isReadonly && { readonly: true }), ...(c.flags.isOptional && { optional: true }) }
    if (c.kindOf(ReflectionKind.Method)) methods.push({ name: c.name, ...flags, doc: text(c.signatures[0].comment ?? c.comment), signatures: c.signatures.map((s) => signature(s, c.name)) })
    else if (c.kindOf(ReflectionKind.Accessor)) props.push({ name: c.name, ...flags, ...(!c.setSignature && { readonly: true }), type: type(c.getSignature?.type ?? c.setSignature?.parameters?.[0]?.type), doc: text(c.getSignature?.comment ?? c.setSignature?.comment ?? c.comment) })
    else if (c.kindOf(ReflectionKind.Property)) props.push({ name: c.name, ...flags, type: type(c.type), doc: text(c.comment) })
  }
  return { ...(props.length && { props }), ...(methods.length && { methods }) }
}

/** One export, as the page shows it. */
function entry(ref, name) {
  const base = { name }
  if (ref.kindOf(ReflectionKind.Function)) return { ...base, kind: 'function', doc: text(ref.signatures[0].comment ?? ref.comment), signatures: ref.signatures.map((s) => signature(s, name)) }
  const typed = { ...(ref.typeParameters?.length && { generics: generics(ref.typeParameters) }), ...(ref.extendedTypes?.length && { extends: ref.extendedTypes.map(type) }) }
  if (ref.kindOf(ReflectionKind.Class)) {
    const ctor = ref.children?.find((c) => c.kindOf(ReflectionKind.Constructor) && !c.flags.isPrivate)
    return { ...base, kind: 'class', doc: text(ref.comment), ...typed, ...(ctor && { ctor: ctor.signatures.map((s) => signature(s, `new ${name}`)) }), ...members(ref) }
  }
  if (ref.kindOf(ReflectionKind.Interface)) return { ...base, kind: 'interface', doc: text(ref.comment), ...typed, ...members(ref) }
  if (ref.kindOf(ReflectionKind.TypeAlias)) return { ...base, kind: 'type', doc: text(ref.comment), ...typed, type: type(ref.type) }
  if (ref.kindOf(ReflectionKind.Enum)) return { ...base, kind: 'enum', doc: text(ref.comment), props: (ref.children ?? []).map((c) => ({ name: c.name, type: type(c.type), doc: text(c.comment) })) }
  return { ...base, kind: 'const', doc: text(ref.comment), type: type(ref.type) }
}

const squash = (s) => s.replace(/\s+/g, ' ')

/** The module's own comment, from its source: the first doc comment followed by a blank line. */
function moduleDoc(src) {
  const body = src.replace(/^(?:\s*import\s[\s\S]*?from\s+['"][^'"]+['"];?[^\n]*\n|\s*import\s+['"][^'"]+['"];?\n|\s*\/\/[^\n]*\n|\s*\n)*/, '')
  const m = body.match(/^(\/\*\*[\s\S]*?\*\/)\n\s*\n/)
  if (!m) return ''
  return m[1].replace(/^\s*\/\*\*\s?/, '').replace(/\s*\*\/\s*$/, '').split('\n').map((l) => l.replace(/^\s*\* ?/, '')).join('\n').replace(/ \(issues? #\d+[^)]*\)/g, '').trim()
}

/** Writes the package's declarations where TypeDoc reads them, and reads the reference from them. */
export async function buildApi() {
  rmSync(TYPES, { recursive: true, force: true })
  try {
    execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(root, 'tsconfig.engine.json'), '--declarationDir', TYPES], { stdio: 'inherit' })
    const app = await Application.bootstrap({
      entryPoints: [join(TYPES, 'splat-engine/index.d.ts')],
      tsconfig: join(here, 'tsconfig.json'),
      readme: 'none',
      excludePrivate: true,
      excludeInternal: true,
      sort: ['source-order'],
      // three.js's own doc comments trip TypeDoc's warnings; only errors matter here
      logLevel: 'Error',
    })
    const project = await app.convert()
    if (!project || app.logger.hasErrors()) throw new Error('TypeDoc could not read the engine package')

    // modules in the order the entry exports from them
    const order = [...readFileSync(join(TYPES, 'splat-engine/index.d.ts'), 'utf8').matchAll(/from\s+'([^']+)'/g)]
      .map((m) => join('splat-engine', m[1]).replace(/\\/g, '/').replace(/\.(js|ts)$/, ''))
    const modules = new Map(order.map((from) => [from, null]))
    // a file the entry doesn't name itself belongs to the module that passes its exports on (the zoo's species)
    const home = new Map()
    const passes = (mod, to) => {
      for (const m of readFileSync(join(TYPES, `${mod}.d.ts`), 'utf8').matchAll(/^export\s[^;]*?from\s+'([^']+)'/gm)) {
        const from = join(dirname(mod), m[1]).replace(/\\/g, '/').replace(/\.(js|ts)$/, '')
        if (modules.has(from) || home.has(from)) continue
        home.set(from, to)
        passes(from, to)
      }
    }
    for (const from of order) passes(from, from)
    for (const child of project.children ?? []) {
      const ref = child.kindOf(ReflectionKind.Reference) ? child.getTargetReflectionDeep() : child
      const src = ref.sources?.[0]
      if (!src) throw new Error(`engine docs: ${child.name} has no source`)
      const file = src.fullFileName.slice(TYPES.length + 1).replace(/\\/g, '/').replace(/\.d\.ts$/, '')
      const from = home.get(file) ?? file
      if (!TITLES[from]) throw new Error(`engine docs: ${child.name} comes from ${from}, which has no title in TITLES`)
      if (!GROUP_OF.has(from)) throw new Error(`engine docs: ${from} is in no part of GROUPS`)
      if (!modules.get(from)) modules.set(from, { id: from.replace(/^splat-(engine|core)\//, '').replace(/\//g, '-'), title: TITLES[from], group: GROUP_OF.get(from).id, from, doc: moduleDoc(readFileSync(join(root, 'src', `${from}.ts`), 'utf8')), entries: [] })
      const mod = modules.get(from)
      // a second name for an export is listed as that, not written out twice
      const e = child.kindOf(ReflectionKind.Reference) && project.children.includes(ref) ? { name: child.name, kind: 'alias', doc: text(child.comment), of: ref.name } : entry(ref, child.name)
      // the module's own comment sits on its first declaration in a .d.ts: keep it once, on the module
      if (e.doc && squash(e.doc) === squash(mod.doc)) e.doc = ''
      mod.entries.push({ ...e, at: [file === from ? 0 : 1, file, src.line] })
    }
    return {
      groups: GROUPS.map(({ id, title, doc }) => ({ id, title, doc })),
      modules: [...modules.values()].filter((m) => m?.entries.length).sort((a, b) => GROUP_OF.get(a.from).at - GROUP_OF.get(b.from).at).map(({ from, ...m }) => ({ ...m, entries: m.entries.sort((a, b) => a.at[0] - b.at[0] || a.at[1].localeCompare(b.at[1]) || a.at[2] - b.at[2]).map(({ at, ...e }) => e) })),
    }
  } finally { rmSync(TYPES, { recursive: true, force: true }) }
}

export const apiJson = (api) => JSON.stringify(api, null, 1) + '\n'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const api = await buildApi()
  writeFileSync(API_FILE, apiJson(api))
  const n = api.modules.reduce((s, m) => s + m.entries.length, 0)
  console.log(`engine docs: ${n} names in ${api.modules.length} sections → ${API_FILE.slice(root.length + 1)}`)
}
