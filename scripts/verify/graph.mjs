/**
 * Which source files each check depends on: a small import graph of src/
 * (static imports, dynamic import(), `new URL('./x', import.meta.url)` workers
 * and `?raw` imports), so `verify --changed` can run only the checks a change
 * can reach. Pure Node, no TypeScript needed.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new\s+URL\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g
const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']

export function makeGraph(root) {
  const deps = new Map()
  const resolveSpec = (from, spec) => {
    const base = resolve(dirname(join(root, from)), spec.replace(/\?.*$/, ''))
    for (const e of EXTS) {
      const p = base + e
      if (existsSync(p) && statSync(p).isFile()) return relative(root, p)
    }
    return null
  }
  const depsOf = (file) => {
    if (!deps.has(file)) {
      const out = []
      if (/\.(ts|tsx|js|mjs)$/.test(file) && existsSync(join(root, file))) {
        const text = readFileSync(join(root, file), 'utf8')
        for (const m of text.matchAll(SPEC)) {
          const r = resolveSpec(file, m[1])
          if (r) out.push(r)
        }
      }
      deps.set(file, out)
    }
    return deps.get(file)
  }
  /** Every file `entries` reach, not walking into (or counting) files that `stop` matches unless they are entries. */
  const closure = (entries, stop = () => false) => {
    const seen = new Set()
    const todo = [...entries]
    while (todo.length) {
      const f = todo.pop()
      if (seen.has(f)) continue
      seen.add(f)
      for (const d of depsOf(f)) if (!seen.has(d) && !stop(d)) todo.push(d)
    }
    return seen
  }
  return { closure, depsOf }
}
