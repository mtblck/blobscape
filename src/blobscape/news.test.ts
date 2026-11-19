import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { POSTS, neighbors, postById, postText } from './news.ts'
import { href, parsePath } from './routes.ts'
import { mdToHtml } from './markdown.ts'
import { pageMeta } from './meta.ts'

const inPublic = (path: string) => existsSync(new URL(`../../public${path}`, import.meta.url))

test('posts are written newest first, each with its own address and a real day', () => {
  assert.ok(POSTS.length > 0)
  assert.equal(new Set(POSTS.map((p) => p.id)).size, POSTS.length)
  for (const [i, p] of POSTS.entries()) {
    assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.id)
    assert.equal(new Date(`${p.date}T00:00:00Z`).toISOString().slice(0, 10), p.date, `${p.id}: ${p.date}`)
    if (i) assert.ok(POSTS[i - 1].date >= p.date, `${p.id} is newer than the post above it`)
    assert.deepEqual(parsePath(href({ page: 'post', id: p.id })), { page: 'post', id: p.id })
    assert.equal(postById(p.id), p)
  }
  assert.equal(parsePath('/whats-new/no-such-post/'), null)
  assert.deepEqual(parsePath('/whats-new/'), { page: 'news' })
  assert.equal(neighbors(POSTS[0].id).newer, undefined)
  assert.equal(neighbors(POSTS[0].id).older, POSTS[1])
})

test('every post has a picture that exists, a summary a link preview can hold, and words', () => {
  for (const p of POSTS) {
    assert.ok(inPublic(p.image.src), `${p.id}: no picture at ${p.image.src}`)
    assert.ok(p.image.alt.length > 20, `${p.id}: say what the picture shows`)
    assert.ok(p.summary.length > 80 && p.summary.length < 320, `${p.id}: summary is ${p.summary.length} characters`)
    assert.ok(p.body.length >= 3, p.id)
    if (p.version) assert.match(p.version, /^\d+\.\d+\.\d+$/)
    const meta = pageMeta({ page: 'post', id: p.id })
    assert.ok(meta.image && inPublic(meta.image.src), `${p.id}: no share picture`)
    assert.ok(meta.title.startsWith(p.title))
    // a link preview's tags say 1200 × 630, so a post's own picture is shared as its cut of that shape
    assert.ok(meta.image.src.startsWith('/share/'), `${p.id}: no 1200 × 630 share picture: run scripts/share-images.mjs`)
  }
})

test("a post's links lead somewhere: a page of ours, a file of ours, or another site over https", () => {
  for (const p of POSTS) {
    const html = mdToHtml(postText(p))
    // nothing left that the reader would see as raw Markdown
    assert.doesNotMatch(html.replace(/<pre[\s\S]*?<\/pre>/g, ''), /\*\*|\]\(|^#+ /m, p.id)
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    for (const to of links) {
      if (to.startsWith('https://')) continue
      const path = to.split(/[?#]/)[0]
      const tool = ['/experiments/fit-a-picture/', '/experiments/splat-to-sprite/'].includes(path)
      assert.ok(tool || parsePath(path) || inPublic(path), `${p.id}: ${to} is not a page`)
      assert.ok(path.endsWith('/') || inPublic(path), `${p.id}: ${to} needs its closing slash`)
    }
  }
})
