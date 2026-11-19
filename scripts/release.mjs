// Prepares a release PR: `npm run release -- 0.2.0` joins the entry files in changes/ (one per pull request, so
// two of them never edit the same lines) with anything still under the CHANGELOG's [Unreleased], newest first,
// under a dated 0.2.0 heading, removes the files, adds the version's link, and sets the version in package.json, package-lock.json and the engine package's
// manifest (the site and @blobscape/engine share one version). Merging that PR to main makes
// .github/workflows/release.yml tag the merge commit, make the GitHub release and, once the engine package isn't
// private, publish it to npm. (seedkin's, adapted.)
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = 'https://github.com/mtblck/blobscape'
const SEMVER = /^\d+\.\d+\.\d+$/

/** The name of an entry file in changes/: lower-case words joined by hyphens. The folder's README is not one. */
export const ENTRY_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/

/**
 * One entry file's text as changelog bullets. A file is usually one line; text with no bullet of its own
 * becomes one, its lines joined, and a file that already has bullets is kept as written.
 */
export function entryOf(text) {
  const body = text.trim()
  if (!body) return ''
  if (/^- /m.test(body)) {
    if (!body.startsWith('- ')) throw new Error('starts with text and then has bullets: make every entry a "- " line.')
    return body
  }
  if (/^#/m.test(body)) throw new Error('has a heading: an entry is a line or two of plain text.')
  return `- ${body.split(/\s*\n\s*/).join(' ')}`
}

/** Entry files (`name`, `text`, and `time`, when each was added) as one list of bullets, the newest first. */
export function joinChanges(files) {
  const sorted = [...files].sort((a, b) => b.time - a.time || a.name.localeCompare(b.name))
  const out = []
  for (const f of sorted) {
    let entry
    try {
      entry = entryOf(f.text)
    } catch (error) {
      throw new Error(`changes/${f.name} ${error.message}`)
    }
    if (!entry) throw new Error(`changes/${f.name} is empty.`)
    out.push(entry)
  }
  return out.join('\n')
}

/**
 * The changelog with `added` (the joined entry files) and its own [Unreleased] entries moved under
 * `## [version] - date`.
 */
export function cutRelease(markdown, version, date, added = '') {
  if (!SEMVER.test(version)) throw new Error(`"${version}" isn't a version like 0.2.0.`)
  if (markdown.includes(`## [${version}]`)) throw new Error(`CHANGELOG.md already has ${version}.`)
  const heading = '## [Unreleased]\n'
  const start = markdown.indexOf(heading)
  if (start < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading.')
  const bodyStart = start + heading.length
  const next = markdown.indexOf('\n## [', bodyStart)
  const end = next < 0 ? markdown.length : next + 1
  // the entries stop at the next version, or at the links at the foot
  const links = markdown.search(/^\[[^\]]+\]: /m)
  const stop = next < 0 && links > bodyStart ? links : end
  const entries = [added.trim(), markdown.slice(bodyStart, stop).trim()].filter(Boolean).join('\n')
  if (!entries) throw new Error('changes/ has no entries and [Unreleased] is empty: there is nothing to release.')
  const section = `${heading}\n## [${version}] - ${date}\n\n${entries}\n\n`
  let out = markdown.slice(0, start) + section + markdown.slice(stop)
  const link = /^\[Unreleased\]: .*\/compare\/(v\d+\.\d+\.\d+)\.\.\.HEAD$/m
  const previous = out.match(link)?.[1]
  const mine = previous ? `${REPO}/compare/${previous}...v${version}` : `${REPO}/releases/tag/v${version}`
  const foot = `[Unreleased]: ${REPO}/compare/v${version}...HEAD\n[${version}]: ${mine}`
  out = /^\[Unreleased\]: .*$/m.test(out) ? out.replace(/^\[Unreleased\]: .*$/m, foot) : `${out.trimEnd()}\n\n${foot}\n`
  return out
}

/** The engine package's manifest at this version, everything else as written. */
export function withVersion(manifest, version) {
  if (!SEMVER.test(version)) throw new Error(`"${version}" isn't a version like 0.2.0.`)
  const out = manifest.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`)
  if (out === manifest && !manifest.includes(`"version": "${version}"`)) throw new Error('The engine manifest has no "version".')
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2] ?? ''
  const file = new URL('../CHANGELOG.md', import.meta.url)
  const today = new Date().toISOString().slice(0, 10)
  const folder = new URL('../changes/', import.meta.url)
  const names = readdirSync(folder).filter((name) => ENTRY_NAME.test(name))
  // when a file was added to the repository; one not committed yet is the newest
  const addedAt = (name) => {
    try {
      const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%ct', '-1', '--', `changes/${name}`], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' })
      return Number(out.trim()) || Infinity
    } catch {
      return Infinity
    }
  }
  let markdown
  try {
    const files = names.map((name) => ({ name, text: readFileSync(new URL(name, folder), 'utf8'), time: addedAt(name) }))
    markdown = cutRelease(readFileSync(file, 'utf8'), version, today, joinChanges(files))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
  execFileSync('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { stdio: 'inherit' })
  writeFileSync(file, markdown)
  for (const name of names) unlinkSync(new URL(name, folder))
  const engine = new URL('../packages/engine/package.json', import.meta.url)
  writeFileSync(engine, withVersion(readFileSync(engine, 'utf8'), version))
  console.log(`Entries from changes/ joined into CHANGELOG.md and removed: ${names.length}. CHANGELOG.md, package.json and packages/engine/package.json are at ${version}. Open the release PR; merging it makes the release.`)
}
