---
'@cosyte/cli': patch
---

Caller workflow and branch protection only, with no runtime impact: the pre-publish check now blocks a merge here instead of merely showing a red X.

The shared pipeline grew a `prepublish` job on 2026-08-05, so this repo started emitting a
`ci / prepublish` context on every pull request without a commit landing here. The branch ruleset
did not name it, which meant a red pre-publish result reported a failure and merged anyway. That
job is the offline manifest lint plus the pack-and-install probe, and this package is the reason
both exist: two published versions carry local-path dependency specifiers and are permanently
uninstallable. The context was read off a real check run first and then added to the ruleset, in
that order, because requiring a context nothing emits strands every pull request instead of
failing it.

The banner on the caller now records the hazard it did not previously cover: a context can arrive
in this repo with no commit in this repo, because the `uses:` reference is unpinned, and it always
arrives unrequired.
