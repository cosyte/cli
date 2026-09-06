---
"@cosyte/cli": patch
---

Bring the dependency overrides, the install hardening and the PHI scanner's completeness rule up to
the shared package baseline, and cut the always-read agent guide to its declared line ceiling without
losing a rule.

- **The `js-yaml` override now covers the advisory's extended range.** The pin moves from `4.2.0` on
  `>=4.0.0 <4.2.0` to `4.3.0` on `>=4.0.0 <4.3.0`, so a transitive resolution inside the newly
  covered window is remediated rather than silently admitted. The `esbuild` override is untouched,
  and the lockfile records the new pin.
- **`pnpm-workspace.yaml` declares the install hardening this package relies on**: a
  `minimumReleaseAge` of 1440 minutes, the cooling-off window that blunts a compromised release, and
  a `trustPolicy` of `no-downgrade`. **The `packageManager` pin moves to a pnpm release that honours
  both keys**, because the previous pin predates them and would have ignored the file entirely, which
  is a settings file that decorates rather than defends.
- **The PHI scanner refuses a run that enumerated a target and never read it.** A logged
  `--allow-fixture` bypass withdraws a file after the scan has already named it, and the run used to
  report on whatever was left as though the corpus were whole: over a corpus whose only violator was
  withdrawn, that reads as clean. It now reports every hit FIRST, so a refusal can never discard a
  finding, then refuses by name with a status distinct from both the clean status and the hits status.
  The question is answered as a set difference and never as a count, because a count counts the
  targets that did get read, so the refusal can name the paths that went unread. An honest run, with
  nothing withdrawn, keeps exactly the exit codes it had, and so do the pre-commit hook and the
  whole-tree sweep.
- **The always-read agent guide is inside its line budget, and nothing it said was lost.** Every rule
  and every trap stays there as a one-line imperative with a resolving pointer, and the sentences that
  explained each one moved into the narrative document verbatim, where the two-file contract gate
  checks on every run that each pointer still lands on a section with a body.
