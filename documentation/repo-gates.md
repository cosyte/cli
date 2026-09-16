# @cosyte/cli: the repo gate rules

`CLAUDE.md` is always read, so it is held to a byte budget and carries the cursor, the rules and the
traps in their shortest form. The sections below live here in full, under their own headings, and
`CLAUDE.md` keeps each heading above a pointer at the copy here. **Every rule below binds exactly as
it binds there, and "I did not read the reason" is not a licence to discount it.**

What lives here is the rules for this repository's own gates and for the configuration around them:
the docs sidebar, the PHI scanner, the em-dash gate, branch protection and the `attw` wrapper. The
rules about what the software DOES stay in `CLAUDE.md`.

The narrative behind each rule is in [`agent-notes.md`](agent-notes.md), and the pointers below reach
it from this directory rather than from the repository root.

### The docs sidebar is bound by an IA spine nothing here checks

Why: [agent-notes § The docs sidebar and the IA spine](agent-notes.md#the-docs-sidebar-and-the-ia-spine).

- **An off-spine top-level label in `docs-content/sidebars.json` stops the WHOLE docs site deploying**.
  Categories are **optional**; the rule is that
  whatever you have is labelled and ordered canonically, so `{"docs":["intro"]}` is compliant.
- **🔴 NEVER AUTHOR AN `API Reference` CATEGORY**: the docs site injects it, and a hand-authored one is a
  distinct, **harder** error. **Never claim where the injected category lands.** **"Verified against
  the linter" is not evidence about placement.**
- **Verify a sidebar edit against the site's own linter**, `docs/scripts/check-ia-conformance.ts`
  (`NODE_ENV=test` is required to call `lintSidebar`). **Nothing in `verify.sh` or this repo's CI can
  catch this**, so **use the previously shipped sidebar as a negative control.** Keep `limitations` under
  `Troubleshooting` and `mcp`/`reference-commands` under `Guides`, and **do not copy `synth`**, the lone
  counter-example. **Only a NEW RELEASE clears the gate**, and archived versions never gate, so **do not
  try to fix history.**

### The pre-commit PHI scanner

Why: [agent-notes § The pre-commit PHI gate and git mv](agent-notes.md#the-pre-commit-phi-gate-and-git-mv).

- **Never re-introduce rename detection into `scripts/phi-scan.ts --staged`**: `--no-renames` is the
  whole remedy and a strict **SUPERSET**. **Do NOT re-derive this as "needs the two-path record shape, a
  scope decision"**: that framing is false, measured twice.
- **Keep the `--raw -z` two-field stride, the `T` status, the destination-mode read, and the exit 2
  refusal of a non-blob mode**, and **keep each scan root's own path in scope.**
- **Keep the two routes' refusals identical**, **the `.md` exemption deliberately does not reach a
  link**, **a refusal NEVER prints the link target** while naming every offender's own path, and **that
  guarantee is about a REFUSAL and does not extend to a hit.**
- **Exit `1` means "hits found", so a broken invocation must never exit `1`**: an unreadable allow-list,
  **override log** or scan root is **exit 2**.
- **A declared scan root the all-mode walk never OBSERVED refuses at exit 2**, on two `git ls-files`
  reconciliation conditions neither of which subsumes the other. **Never add a denominator instead**,
  **never let a failing `git ls-files` answer the empty set**, and keep it **one-directional** and
  **all-mode only**: widening `--staged` changes what a COMMIT is blocked on.
- **A target the run ENUMERATED and never read refuses at exit 2, and the HITS ARE REPORTED FIRST** so a
  refusal cannot swallow a finding. **It is a SET DIFFERENCE, never a count.** Withdrawing a file with
  `--allow-fixture` buys a no-answer: **declare its identifiers in the allow-list instead.**
- **Never state a refusal rule unqualified**, and **three escapes remain, NARROWED not closed**: a scan
  root that is itself a live link, an **ancestor** of a root, and a link named in paths mode. **Never
  describe one as closed**, and **do not "fix" them inside an unrelated slice.**
- **Walk roots are `src`, `test`, `scripts`, re-derived, and must stay DISJOINT.** **`scripts/` IS SWEPT:
  name a PHI shape, never SPELL a literal**, and an `ID` in dashed shape reds `phi-allow-list.txt`:
  respell `MRN-`. **`test/scripts/phi-scan.test.ts` is the ONE exempt path**, at the **scan**,
  **all-mode only**, **per path**; `EMAILDOMAIN` is global, so never allow-list a file green.
- **🛑 THE WIDENING BOUGHT THE SSN/EMAIL FLOOR OVER 38 MORE FILES AND NOTHING ELSE**, **the recogniser
  was NOT widened, on measurement**, and **a tripwire reds if that changes**: widen **in addition to**
  the raw pass, never instead of it. **Other residuals:** `D` and `U` are unenumerated. **Give every
  `test/scripts/*.test.ts` case an explicit timeout**, and **assert the premise, not only the remedy**:
  two vacuity traps already sprang in this suite.

### The em-dash brand gate

Why: [agent-notes § The em-dash brand gate](agent-notes.md#the-em-dash-brand-gate).

- **The `U+2014` ban is absolute** (founder directive). `scripts/check-no-emdash.sh` +
  `.github/workflows/no-emdash.yml` gate **both** halves: every tracked file, **and** the PR title, body
  and commit messages. **▶ READ THIS BEFORE PORTING THE GATE OR SWEEPING ANY REPO: AN EM DASH IS
  SOMETIMES A VALUE, NOT PUNCTUATION.** **Grep for a cell or list-marker em dash first**
  (`\|\s*\x{2014}\s*[\|\(]`) and convert
  each to a **WORD**, by hand, before any bulk transform.
- **CUT, do not rewrite**, and **revert a rewrite verbatim rather than repair it**. **Nothing in this
  repo's CI could have caught that**, because the doc tests execute only runnable blocks and prettier's
  glob does **not** cover `docs-content/`.
- **Never drop the NUL exclusion and never add `grep -I` instead**: both have measured failure modes
  with no remediation. **The disclosed cost is a miss, not a pass** (a tracked **text** file holding a
  NUL is silently exempt), **the tell is the excluded count on the OK line, and if it moves, revisit
  the partition, never the ban.** **`test/__fixtures__/adt-a01.hl7` and `minimal.astm` stay in scope**.
- **Fix the script's shared known limits in the shared copies, not here**, and **re-derive every number
  before writing it down; never quote one from a sibling's copy.**
- **What lands on `main` here differs from `mllp`: all three merge methods are enabled**, so the **branch
  commit messages** are the one text that lands under every method and **the PR body lands under none**
  (scanned anyway, deliberate over-strictness). **Do not repeat `ncpdp`'s copy** claiming the title and
  body are what lands. **Not retroactive:** history is not rewritten.

## Branch protection (and the limits of this claim)

Full ruleset, the required-context table and the per-check reasoning:
[agent-notes § Branch protection](agent-notes.md#branch-protection-and-the-limits-of-this-claim).

- `main` is protected by the repository ruleset **`ci-required-checks`** (id `19907924`), every required
  context pinned to **`integration_id: 15368`**. **Never quote the context count without re-deriving
  it**, and **read a required context off a REAL check run, never off a workflow's `name:` field**:
  requiring a context nothing emits leaves a PR **pending and unmergeable forever**.
- **▶ A `ci / *` CONTEXT CAN APPEAR HERE WITH NO COMMIT IN THIS REPO, AND IT ARRIVES NOT REQUIRED**, so
  an upstream job shows **a red X that does not block a merge**. **Census `ci / *` against a real check
  run whenever `.github` moves**, then require it or write down why not.
- **`no-internal-refs` and `no-emdash` are bare JOB IDS**, not `<workflow> / <job>`: **rename the job and
  the ruleset together, or neither.** **A required job gates all of its steps**, so splitting a step out
  of `ci / verify` into its own job silently un-requires it, and **never add a `paths:` filter** to
  `ci.yml`, `codeql.yml`, `no-internal-refs.yml` or `no-emdash.yml`.
- **Confirm a ruleset write with the `PUT` itself, never a `GET`**: an Organization-sourced ruleset
  answers `200` to a `GET` and `404` to an identical-payload `PUT`.
- **Never require `scorecard / analysis`, `fuzz`, or `release / release`** (none runs on `pull_request`,
  so each strands every PR pending forever), and **never require the Advanced Security `CodeQL` check**:
  it reports **alert state**, not whether the analysis ran.
- **▶ Scope of the claim: a ruleset makes a red check BLOCK a merge. It does not make the check correct,
  and nothing inside this repository can observe its own ruleset.** Verify it the only way that works:
  `gh api repos/cosyte/cli/rulesets`. Recorded **unproven** rather than fine.

### The `attw` gate

Why, with every measurement: [agent-notes § The attw wrapper](agent-notes.md#the-attw-wrapper).

- **▶ `attw` SAYS "does not contain types" AND EXITS 0, so `pnpm attw` is `node scripts/attw.mjs
--profile node16` and NEVER the bare CLI**, because no flag or config setting reaches its early return.
- **The race only supplies the condition; the answer is NOT a lock, a lease or a build queue**, and
  **do not quote the measured interval as a constant**; the ordering does not move. **Keep the preflight
  walking `bin` as well as `exports`**: `attw` never reads `bin`. **`--profile node16` is load-bearing
  and is forwarded, never reinterpreted**, or `@cosyte/cli/mcp` fails `node10` resolution.
- **Only a TOTAL loss of declarations is the false green; a PARTIAL one `attw` catches itself**, so the
  preflight must report both outcomes and **must not assert the exit 0**. **Re-measure before shortening.**
- **The post-check reads a string, so what would hide that string is refused**: `--quiet`, `-q`,
  `--format`, `-f`, `--config-path`, and a `.attw.json` setting `quiet` or `format`. **Say "exact argv
  token" of the ARGV refusal, never "wholesale"**; the `.attw.json` refusal **is** wholesale.
- **Two holes are disclosed and deliberately left open**: clustered short forms `-fjson` / `-Pf json`,
  and a declared path not starting with `.`. `test/scripts/attw-gate.test.ts` pins both nets, the
  upstream exit 0 and a negative control.
