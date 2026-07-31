---
"@cosyte/cli": patch
---

Document that `0.0.1` is published to npm but cannot be installed, and what to do instead. The README and docs now say plainly that `npm install @cosyte/cli` fails with an `ENOENT`, why it fails, and that running from a source checkout is the workaround.

Corrects four false claims on the public surface (ASSETS-P8). The README said "not yet published to npm" and described swapping the vendored sibling dependencies for real npm ranges as a step still to come at first publish; the publish already happened without that swap, which is exactly what makes the release uninstallable. The `redact`/`deid` diagnostic and docs said `@cosyte/deid` was unpublished, which is no longer true: it is published, the CLI simply does not wire it yet. `RELEASING.md` records that the dependency swap was skipped, that a green `npm publish --dry-run` cannot catch this class of defect, and that an install of the published version from outside the repo is the check that would have.

This entry also announced a per-package banner image at the top of the README, and chose a plain markdown image over an `<img>` or a `<picture>` pair on the stated ground that npm's handling of `<picture>` was unverified. That was an accurate account of what was known when it was written. It has since been measured, and the banner was replaced by the shared Cosyte lockup inside this same unreleased window, so no consumer ever saw the intermediate image. The announcement is therefore withdrawn from here rather than published and then immediately contradicted; what did ship is described in the other changeset in this release, which records what the measurement found.
