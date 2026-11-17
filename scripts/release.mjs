// Prepares a release PR: `npm run release -- 0.2.0` moves the CHANGELOG's [Unreleased] entries under a dated
// 0.2.0 heading, adds its link, and sets the version in package.json and package-lock.json. Merging that PR to
// main makes .github/workflows/release.yml tag the merge commit and make the GitHub release. (seedkin's, adapted.)
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = 'https://github.com/mtblck/blobscape'
const SEMVER = /^\d+\.\d+\.\d+$/

/** The changelog with its [Unreleased] entries moved under `## [version] - date`. */
export function cutRelease(markdown, version, date) {
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
  const entries = markdown.slice(bodyStart, stop).trim()
  if (!entries) throw new Error('[Unreleased] is empty: there is nothing to release.')
  const section = `${heading}\n## [${version}] - ${date}\n\n${entries}\n\n`
  let out = markdown.slice(0, start) + section + markdown.slice(stop)
  const link = /^\[Unreleased\]: .*\/compare\/(v\d+\.\d+\.\d+)\.\.\.HEAD$/m
  const previous = out.match(link)?.[1]
  const mine = previous ? `${REPO}/compare/${previous}...v${version}` : `${REPO}/releases/tag/v${version}`
  const foot = `[Unreleased]: ${REPO}/compare/v${version}...HEAD\n[${version}]: ${mine}`
  out = /^\[Unreleased\]: .*$/m.test(out) ? out.replace(/^\[Unreleased\]: .*$/m, foot) : `${out.trimEnd()}\n\n${foot}\n`
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2] ?? ''
  const file = new URL('../CHANGELOG.md', import.meta.url)
  const today = new Date().toISOString().slice(0, 10)
  let markdown
  try {
    markdown = cutRelease(readFileSync(file, 'utf8'), version, today)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
  execFileSync('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { stdio: 'inherit' })
  writeFileSync(file, markdown)
  console.log(`CHANGELOG.md and package.json are at ${version}. Open the release PR; merging it makes the release.`)
}
