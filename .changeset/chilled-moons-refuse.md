---
"@cosyte/cli": patch
---

Make the outside-the-repo tarball install a step the release pipeline runs, instead of a checklist
step a human has to remember. `.github/workflows/release.yml` gains an `install-gate` job that the
publishing job `needs:`, so a red gate stops the publish: it packs this tree, installs the packed
tarball from a directory outside the repository working tree, executes both declared bins from that
installed copy, and refuses a dependency specifier naming a local path in a field a consumer's
install resolves. It fails closed, with a distinct reason for an install that exited non-zero, a bin
missing from the package, a bin that ran and failed, and a run that reached no verdict at all.
