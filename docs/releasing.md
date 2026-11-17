# Releasing

A release is a tag (`vX.Y.Z`), a GitHub release whose notes are that version's section of
`CHANGELOG.md`, and, once the engine package isn't private, `@blobscape/engine` at the same version on npm.
The site itself deploys from main on Vercel as always.

1. As work lands, add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a visitor would notice.
2. On a branch, run `npm run release -- 0.2.0`. It moves the [Unreleased] entries under `## [0.2.0] - <today>`,
   updates the links at the foot, and sets the version in package.json, package-lock.json and
   `packages/engine/package.json` (the site and the package share one version).
3. Open that as a PR. Merging it is the approval: `.github/workflows/release.yml` sees the version change on
   main, runs the unit tests, tags the merge commit `v0.2.0` with the run's own token and makes the release,
   then builds and publishes `@blobscape/engine` (skipped while its manifest says `private: true`, or when that
   version is already on npm). Merge a release PR only when Matt says go.

Why a workflow: sessions that build Blobscape can push branches but not tags, so the tag is made on GitHub's
side. The workflow needs the repository's Actions to be on with read and write permission for workflows
(Settings, Actions, General, Workflow permissions). A tag pushed by hand that matches package.json also makes
its release. Same shape as seedkin's release setup.

## Publishing @blobscape/engine

The package lives under Matt's npm organization `blobscape`. It stays `private: true` until Matt says publish;
making it public is a line in the release PR he approves.

- **The first version** can't use trusted publishing (npm offers it only for a package that exists), so it goes
  out with a short-lived granular npm token, write access to the `@blobscape` scope only, saved as the
  repository secret `NPM_TOKEN` (Settings, Secrets and variables, Actions).
- **After that**, on npmjs.com: `@blobscape/engine`, Settings, Trusted publishers, GitHub Actions, repository
  `mtblck/blobscape`, workflow `release.yml`. Then delete the `NPM_TOKEN` secret and the token. The workflow
  needs no change: npm tries the run's OIDC token first and the token only if that fails.
- Every version is published with provenance, linking it to the commit that built it.
- If the publish fails, the tag and release are already made: fix the cause and re-run the job, which skips
  what's done.
