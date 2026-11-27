# Ink Studio looks for the side-by-side page

Each `.json` here is a chip on `/dev/ink-compare/` (dev server only; see `scripts/ink-studio-dev.ts`). These are our
own settings files, written from Ink Studio's docs; none of its code is in this repo. Drop any other look on the page
to try it without adding it here. Shapes read (`src/blobscape/inkCompare/translate.ts` `readInkLooks`):

- our file: `{ "inkLook": 1, "label", "look", "frame", "world", "colorMode", "palette", "pixelSize" }`. `look` goes on
  the world's `look` (Ink's `finish.look`: `tone`, `paletteRemap`, `colorCurves`, `colorLut`, …), `frame` into every
  `renderer.render` call (`outline`, `dither`, `raw`, `tone`, …), `world` onto the world itself;
- an Ink diorama or scene with `finish.look`;
- an Ink asset pack (`"type": "ink-studio/asset-pack"`): one chip per look in it;
- a bare `finish.look` object.
