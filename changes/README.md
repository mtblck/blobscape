# Changes waiting for a release

Every pull request that changes something a visitor would notice adds one small file here, in place of a line in
`CHANGELOG.md`. Each pull request has its own file, so two of them never edit the same lines and merging one
doesn't put the others in conflict.

- Name it for the change, in lower-case words joined by hyphens: `changes/bouquet-glass-vase-stems.md`.
- Write what a visitor would notice, as plain text, the way the changelog reads:

  ```
  Seasonal Bouquets: stems no longer poke out through the sides of a glass vase near its foot.
  ```

  One file is one line of the changelog. For two lines (say one for the site and one that starts `Engine:`),
  start each with `- `. No headings.
- Changing your mind later in the same pull request? Edit your own file.

`npm run release -- x.y.z` joins every file here into `CHANGELOG.md` under the new version, newest first, and
removes them (see `docs/releasing.md`). A unit test checks that each file here can be joined.
