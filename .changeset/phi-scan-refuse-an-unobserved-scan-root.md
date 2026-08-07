---
"@cosyte/cli": patch
---

The PHI scanner refuses (exit 2) when a declared scan root was never observed, instead of printing
`OK, no hits` and exiting 0 over a corpus it never opened.

In all-mode (`pnpm phi-scan` with no arguments, which is what CI runs) each root's walk is now
reconciled against `git ls-files`, and two independent conditions refuse: the root contributed
nothing, or git tracks an in-scope file under the root that the walk did not open. Six states
previously reported clean, all measured on this repository: the root missing, the root emptied, the
root a dangling symbolic link, the root a live symbolic link to an outside directory, one tracked
fixture removed from the working tree, and the source root moved away. The dangling case is the one
no kind check could reach, because `existsSync` follows the link and answers false before anything
about the entry is inspected.

Also fixed: a present-but-unreadable `phi-scan-overrides.md` threw past every handler and exited 1,
which is this scanner's code for "hits found". It now exits 2 with a diagnostic, matching the
allow-list reader beside it.

Scoped to the all-mode sweep. `--staged` is a diff rather than a corpus and is unchanged, and so is
the behaviour of naming paths explicitly.
