---
"@cosyte/cli": patch
---

Close the pre-commit PHI gate's rename blind spot: `phi-scan --staged` never saw a `git mv` into a scan root.

`scripts/phi-scan.ts` listed the index with `git diff --cached --name-only --diff-filter=AM`.
Rename detection is on by default, so `git mv <path> test/__fixtures__/<name>` stages as a
**two-path `R100` record**, and `R` and `C` are in neither `AM` nor `AMT`: the status filter deleted
the record outright and the destination was never enumerated. Measured on this repo, both shapes
walking through the `pnpm phi-scan --staged` pre-commit hook at **exit 0**: a regular file carrying a
value this scanner's own floor catches (`:100644 100644 <sha> <sha> R100`), and a symbolic link
(`:120000 120000 <sha> <sha> R100`, index mode `120000` under the scan root). `git mv` is an ordinary
developer action, not crafted input.

`--no-renames` is the remedy and it costs the record stride nothing: the destination arrives as a
single-path `A` and the source as a `D` the filter drops, so the enumeration is a strict **superset**
of the previous one. Verified under `diff.renames` set to `true`, `copies`, `false` and `1`, and
under `diff.renameLimit=1`: no `R` or `C` record survives in any of them, which makes the two-field
record stride structural rather than conditional. `copies` is not hypothetical, it produces a live
`C100` here.

Three further shapes in the same route, each measured at exit 0 on the base tree and each closed:

- **The mode was never read at all.** The route enumerated with `--name-only` and read content with
  `git show :<path>`, and git stores a symbolic link as its **target path** under mode `120000`, so
  the scan was handed the path text and never the target's bytes. It now lists with `--raw -z` and
  **refuses** (exit `2`) any in-scope entry whose destination mode is not a regular blob. A refusal
  names the entry's own repo-relative path and an engine-owned token for its kind, and **never the
  link target**, which is working-tree text that can itself carry PHI.
- **`T` (typechange) is now in the filter.** Replacing a *tracked* regular fixture with a link is
  neither an add nor a modify, so `--diff-filter=AM` deleted the record before any mode could be read.
- **Each scan root's own path is in scope**, not just its contents. Git records no index entry for a
  directory, so an entry at exactly `test/__fixtures__` or `src` is the root replaced by a blob or a
  link, and a prefix test requiring the trailing slash let it through while the whole corpus went
  unscanned.

The all-mode walk gets the same refusal, because a scanner whose pre-commit half refuses a link while
its CI half silently drops one is not one a developer can reason about.

Two pre-existing exit-code defects fixed with it: a missing or unreadable allow-list, and an
unreadable scan root, both threw past every handler and exited **1** with a stack trace. `1` is this
contract's code for *hits found*, so a caller branching on the exit code read a broken invocation as
a PHI finding. Both are now exit `2` with a diagnostic.

Stated rather than left to be inferred, all pre-existing and none closed:

- The staged route still does not enumerate `D` (a deletion has no staged blob) or `U` (an unmerged
  path has no single one). The `U` half costs nothing that can reach a commit, and that was measured
  rather than assumed: `git commit` refuses an unmerged index outright.
- Under `src/` the staged route still covers only `.ts` files while the all-mode walk covers every
  non-`.md` file, so the CI sweep is what covers the difference.
- **The refusal rule is scoped to an _enumerated_ entry**: one the walk reached beneath a root it had
  already opened, or a staged record at or under a scan root. Three shapes escape it. A scan root
  that is itself a **live** link is followed by the all-mode walk (`existsSync` and `readdirSync`
  both resolve), so the walk reads files no commit contains and reports their values under a
  fabricated in-repo path that holds no such file; the **dangling** direction is the mirror image,
  reporting clean over a corpus it never opened. An **ancestor** of a scan root is in neither route's
  scope. And paths mode follows an explicitly named link, because `statSync` resolves. The
  `--staged` half of the first shape **is** closed here.

No change to the CLI's runtime surface: no command, flag, exit code, diagnostic code or export moves.
