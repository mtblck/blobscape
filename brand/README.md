# Blobscape brand

The source of Blobscape's brand kit, made with the `logo` skill of the
[brand-kit](https://github.com/mtblck/brand-kit) plugin (1.8.0). The logo
itself was locked in November 2026 and is not redrawn here: the SVGs in this
folder are its source, and `src/shared/logoPaths.ts` holds the same shapes for
the site.

| File | What it is |
| --- | --- |
| `brand.json` | Everything the export reads: colors, type, logos, icon tile, portfolio art, legal |
| `*.svg` | The mark, horizontal, stacked and wordmark logos (light and `-dark`), the favicon on its tile and the mark's construction lines |
| `portfolio/draw.mjs` | Draws `cover.svg` (2400 × 800) and `cover-mobile.svg` (1000 × 800), the case-study and Ko-fi covers |
| `LICENSE`, `TRADEMARKS.md` | The brand's own license (all rights reserved, not MIT) and what anyone may do with the name and logo |

## Making the kit

With the brand-kit plugin checked out somewhere (`BRAND_KIT` below is its `skills/logo` folder), from the repo root:

```sh
node brand/portfolio/draw.mjs
node "$BRAND_KIT/scripts/export.mjs" brand/brand.json
```

That writes `brand/dist/` (git-ignored, like every `dist`): SVG, PNG and PDF
logos, one-color versions, icons, `check.png`, the brand guidelines PDF, the
website palette, social images, the email signature, business card, slide
template, social post templates, the portfolio covers, and
`blobscape-brand-kit.zip` with all of it. Rendering needs Playwright's
Chromium; fonts come from Google Fonts.
