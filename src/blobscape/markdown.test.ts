import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mdToHtml, mdTitle, slug } from './markdown.ts'
import { specHtml, specLink, specTitle } from './specCopy.ts'

test('reads the blocks our documents use', () => {
  const html = mdToHtml('# Title\n\nOne\ntwo.\n\n## Why *this*\n\n- a `b`\n- **c**\n\n> x<sub>j</sub>\n\n```json\n{ "a": "<b>" }\n```\n')
  assert.equal(html, '<h1 id="title">Title</h1>\n<p>One two.</p>\n<h2 id="why-this">Why <em>this</em></h2>\n<ul><li>a <code>b</code></li><li><strong>c</strong></li></ul>\n<blockquote><p>x<sub>j</sub></p></blockquote>\n<pre tabindex="0"><code>{ &quot;a&quot;: &quot;&lt;b&gt;&quot; }</code></pre>')
  assert.equal(mdToHtml('# Title\n\nBody', { title: false }), '<p>Body</p>')
  assert.equal(mdTitle('# Title\n\nBody'), 'Title')
  assert.equal(slug('The `rule`, and why'), 'the-rule-and-why')
})

test('escapes markup and drops links that are not addresses', () => {
  assert.equal(mdToHtml('<img src=x onerror=1> & <script>'), '<p>&lt;img src=x onerror=1&gt; &amp; &lt;script&gt;</p>')
  assert.equal(mdToHtml('[go](javascript:alert(1))'), '<p>go)</p>')
  assert.equal(mdToHtml('[a `b`](https://example.com/x)'), '<p><a href="https://example.com/x">a <code>b</code></a></p>')
  assert.equal(mdToHtml('`*not* **bold**`'), '<p><code>*not* **bold**</code></p>')
})

test('the spec turns into a page: a title, sections, sample files on the site', () => {
  const md = readFileSync(new URL('../../docs/rigged-splats.md', import.meta.url), 'utf8')
  const html = specHtml(md)
  assert.equal(specTitle(md), 'Rigged Gaussian splats in glTF')
  assert.ok(!html.includes('<h1'))
  for (const id of ['why-this-exists', 'example', 'the-rule', 'growing-bones', 'sample-files', 'open-questions']) assert.ok(html.includes(`id="${id}"`), id)
  assert.ok(html.includes('<a href="/rigged-splats/fox.glb" download><code>fox.glb</code></a>'))
  assert.ok(html.includes('<a href="/experiments/creature/">Splat Creatures</a>'))
  // nothing of the Markdown is left showing, and nothing was escaped twice
  assert.ok(!/\*\*|\]\(|&amp;lt;|\u0000/.test(html.replace(/<pre[\s\S]*?<\/pre>/g, '')), 'Markdown left in the page')
  assert.equal(specLink('../public/rigged-splats/frog.glb'), '/rigged-splats/frog.glb')
  for (const f of ['fox', 'frog', 'puffer']) assert.ok(readFileSync(new URL(`../../public/rigged-splats/${f}.glb`, import.meta.url)).length > 1000)
})
