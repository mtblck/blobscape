# Releasing

A release is a tag (`vX.Y.Z`) and a GitHub release whose notes are that version's section of
`CHANGELOG.md`. The site itself deploys from main on Vercel as always; nothing goes to npm.

1. As work lands, add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a visitor would notice.
2. On a branch, run `npm run release -- 0.2.0`. It moves the [Unreleased] entries under `## [0.2.0] - <today>`,
   updates the links at the foot, and sets the version in package.json and package-lock.json.
3. Open that as a PR. Merging it is the approval: `.github/workflows/release.yml` sees the version change on
   main, runs the unit tests, tags the merge commit `v0.2.0` with the run's own token and makes the release.

Why a workflow: sessions that build Blobscape can push branches but not tags, so the tag is made on GitHub's
side. The workflow needs the repository's Actions to be on with read and write permission for workflows
(Settings, Actions, General, Workflow permissions). A tag pushed by hand that matches package.json also makes
its release. Same shape as seedkin's release setup.
