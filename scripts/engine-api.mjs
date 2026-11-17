// The @blobscape/engine API reference, read from the package's own type declarations. The repo's TypeScript is the
// native one, which has no JavaScript API for TypeDoc to use, so this reads the .d.ts files tsc writes: they are
// regular enough (one declaration per statement, doc comments kept) to take apart by line.
// `node scripts/engine-api.mjs` writes src/blobscape/engineApi.json, which the reference page (/engine/api/) shows;
// scripts/engine-api.test.mjs fails when that file is behind the code.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
export const API_FILE = join(root, 'src/blobscape/engineApi.json')

/** Each module's heading on the page, in the words the site uses. */
const TITLES = {
  'splat-engine/stage': 'Stage: a creature or scene on a canvas',
  'splat-engine/engine': 'SplatWorld: every blob in one three.js object',
  'splat-core/orbit': 'Orbit: where the camera looks from',
  'splat-core/blobs': 'Blobs',
  'splat-engine/rig': 'Bones and skins',
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
  'splat-engine/sceneDoc': 'Scenes written as data',
  'splat-engine/mpm': 'Sand, snow and goo',
  'splat-engine/pixelPass': 'Pixel mode',
  'splat-core/pixel': 'Pixel art',
  'splat-engine/lod': 'Level of detail',
  'splat-engine/edit': 'Cuts and paint',
  'splat-engine/depth': 'Depth for post effects',
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

const lines = (s) => s.split('\n')
/** A doc comment as text, without its stars or the issue numbers it was built under. */
const doc = (block) => block
  .replace(/^\s*\/\*\*\s?/, '').replace(/\s*\*\/\s*$/, '')
  .split('\n').map((l) => l.replace(/^\s*\* ?/, '')).join('\n').replace(/ \(issues? #\d+[^)]*\)/g, '').trim()

/** The module's own comment, from its source: the first doc comment followed by a blank line. */
function moduleDoc(src) {
  const body = src.replace(/^(?:\s*import\s[\s\S]*?from\s+['"][^'"]+['"];?[^\n]*\n|\s*import\s+['"][^'"]+['"];?\n|\s*\/\/[^\n]*\n|\s*\n)*/, '')
  const m = body.match(/^(\/\*\*[\s\S]*?\*\/)\n\s*\n/)
  return m ? doc(m[1]) : ''
}

const NAME = /^export\s+(?:declare\s+)?(?:abstract\s+)?(function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/

/** A class or interface body without its private members (and their comments). */
function publicOnly(text) {
  const out = []
  let pending = []
  let inComment = false
  for (const l of lines(text)) {
    const t = l.trim()
    if (inComment || t.startsWith('/**')) {
      pending.push(l)
      inComment = !t.endsWith('*/')
      continue
    }
    if (/^(private|#)/.test(t)) { pending = []; continue }
    out.push(...pending, l)
    pending = []
  }
  return out.join('\n')
}

/** Every exported declaration in one .d.ts, in order, with its doc comment; overloads of a function join. */
function declarations(dts) {
  const out = []
  const ls = lines(dts)
  let comment = ''
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]
    if (l.startsWith('/**')) {
      let block = l
      while (!ls[i].trimEnd().endsWith('*/')) block += '\n' + ls[++i]
      comment = block
      continue
    }
    const m = l.match(NAME)
    if (!m) { if (l.trim()) comment = ''; continue }
    // the statement runs until its braces close and it ends
    let text = l, depth = 0
    const count = (s) => { for (const c of s.replace(/'[^']*'|"[^"]*"/g, '')) depth += c === '{' ? 1 : c === '}' ? -1 : 0 }
    count(l)
    while (depth > 0 || !/[;}]\s*$/.test(text)) { const n = ls[++i]; if (n === undefined) break; text += '\n' + n; count(n) }
    const kind = m[1] === 'let' ? 'const' : m[1]
    const code = (kind === 'class' || kind === 'interface' ? publicOnly(text) : text).replace(/^export\s+(declare\s+)?/, '')
    const last = out[out.length - 1]
    if (kind === 'function' && last?.name === m[2] && last.kind === 'function') last.code += '\n' + code
    else out.push({ name: m[2], kind, doc: comment ? doc(comment) : '', code })
    comment = ''
  }
  return out
}

/** What the entry exports, module by module in its order: `export *` and named exports, with aliases. */
function exportsOf(text, dir = 'splat-engine') {
  const named = []
  for (const m of text.matchAll(/^export\s+(type\s+)?(\*|\{([^}]*)\})\s+from\s+'([^']+)';/gm)) {
    const from = posix.normalize(posix.join(dir, m[4])).replace(/\.(js|ts)$/, '')
    if (m[2] === '*') named.push({ from, all: true })
    else named.push({ from, names: m[3].split(',').map((s) => s.trim().replace(/^type\s+/, '')).filter(Boolean).map((s) => { const [name, as] = s.split(/\s+as\s+/); return { name, as: as ?? name } }) })
  }
  return named
}

/** The reference: each module the entry exports from, with its title, its comment and its exported declarations. */
export function apiFrom(dtsDir, srcDir = join(root, 'src')) {
  // a module's declarations, and what it passes on from others
  const read = (mod) => {
    const text = readFileSync(join(dtsDir, `${mod}.d.ts`), 'utf8')
    const own = declarations(text)
    for (const e of exportsOf(text, posix.dirname(mod))) {
      const theirs = read(e.from)
      if (e.all) own.push(...theirs)
      else for (const n of e.names) { const d = theirs.find((x) => x.name === n.name); if (d) own.push({ ...d, name: n.as }) }
    }
    return own
  }
  const exports = exportsOf(readFileSync(join(dtsDir, 'splat-engine/index.d.ts'), 'utf8'))
  // names exported by name win; names two `export *` modules share are exported by neither (TypeScript's rule)
  const explicit = new Set(exports.flatMap((e) => e.names?.map((n) => n.as) ?? []))
  const starCount = new Map()
  for (const e of exports.filter((e) => e.all)) for (const d of read(e.from)) starCount.set(d.name, (starCount.get(d.name) ?? 0) + 1)
  const modules = new Map()
  const seen = new Set()
  for (const e of exports) {
    const decls = read(e.from)
    if (!modules.has(e.from)) {
      const src = readFileSync(join(srcDir, `${e.from}.ts`), 'utf8')
      modules.set(e.from, { id: e.from.replace(/^splat-(engine|core)\//, '').replace(/\//g, '-'), title: TITLES[e.from] ?? e.from, doc: moduleDoc(src), entries: [] })
    }
    const mod = modules.get(e.from)
    const add = (d, as = d.name) => {
      if (seen.has(as)) return
      seen.add(as)
      // the module's own comment sits on its first declaration in a .d.ts: keep it once, on the module
      const own = d.doc && d.doc === mod.doc ? '' : d.doc
      mod.entries.push(as === d.name ? { ...d, doc: own } : { ...d, name: as, doc: `${own}${own ? '\n\n' : ''}Exported as \`${as}\`; \`${d.name}\` in the code below.` })
    }
    if (e.all) { for (const d of decls) if (!explicit.has(d.name) && starCount.get(d.name) === 1) add(d) }
    else for (const n of e.names) { const d = decls.find((x) => x.name === n.name); if (!d) throw new Error(`engine-api: ${e.from} has no ${n.name}`); add(d, n.as) }
  }
  return { modules: [...modules.values()].filter((m) => m.entries.length) }
}

/** Writes the package's declarations to a scratch folder and reads the reference from them. */
export function buildApi() {
  const dir = mkdtempSync(join(tmpdir(), 'engine-api-'))
  try {
    execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(root, 'tsconfig.engine.json'), '--declarationDir', dir], { stdio: 'inherit' })
    return apiFrom(dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

export const apiJson = (api) => JSON.stringify(api, null, 1) + '\n'

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const api = buildApi()
  writeFileSync(API_FILE, apiJson(api))
  const n = api.modules.reduce((s, m) => s + m.entries.length, 0)
  console.log(`engine-api: ${n} names in ${api.modules.length} sections → ${API_FILE.slice(root.length + 1)}`)
}
