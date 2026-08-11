# `@cosyte/cli`'s phi-scan parameters, derived

> **STATUS: ADOPTION IS BLOCKED AND THIS BRANCH DOES NOT MERGE.** The shared engine
> (`@cosyte/script-utils/phi-scan`, `0.0.2`) cannot yet express three things this repository's
> hand-maintained scanner did, and each one is measured below with a before/after exit code. The
> branch carries a working thin caller so the parameter set is a real artifact rather than a
> proposal, but `test/scripts/phi-scan.test.ts` is RED against it and is deliberately left that way:
> the failures are the evidence. Adoption resumes on a version of the engine that takes the
> parameters below.

Everything here was measured against two scanners, on a throwaway git repository per case: this
repository's scanner at `origin/main` (1,243 lines, counted with `rg -c ''` and `wc -l` and
`grep -c ''`, all three agreeing) and the thin caller on this branch (300 lines, same three tools).
Nothing in this file is inferred from reading either one.

## 1. The parameters, as data

| axis                  | value                                                           | required by the engine? |
| --------------------- | --------------------------------------------------------------- | ----------------------- |
| exit codes            | `{ clean: 0, hits: 1, refuse: 2 }`                              | yes, no default         |
| scan roots            | `["src", "test", "scripts"]`                                    | yes, no default         |
| excluded paths        | `{"test/scripts/phi-scan.test.ts"}`                             | no, defaults to empty   |
| `--staged` read scope | `test/__fixtures__`, `test/__fixtures__/**`, `src`, `src/**.ts` | yes, no default         |
| walk read filter      | the shared Markdown exemption (not overridden)                  | no, defaults to it      |
| regular blob modes    | git's two (not overridden)                                      | no, defaults to them    |
| field detectors       | none implemented; the five kinds are declared empty             | no                      |

### Where each value comes from

**Exit codes.** Stated in this repository's own scanner and in `CLAUDE.md`, and CI plus the
pre-commit hook branch on them. `1` is reserved for "hits found" so that a broken invocation can
never be read as a PHI finding. Not portable in or out of a sibling.

**Scan roots.** `src`, `test` and `scripts` are where this package writes messages. Four things are
deliberately NOT roots and each was re-measured rather than quoted: `vendor/` (ten `pnpm pack`
tarballs, whose DEFLATE bytes this gate can say nothing true about), `docs-content/` +
`documentation/` + `.changeset/` (declaring all three would open exactly two non-Markdown files,
`docs-content/sidebars.json` and `.changeset/config.json`, and neither is where messages are
written), `.github/` (measured clean under the floor), and the repository root, which is NOT clean:
`pnpm phi-scan package.json` exits 1 today because the `author` field carries the brand's own
contact address at a domain the allow-list does not declare.

The roots used to be declared as `{ abs, rel }` pairs. **That pair was never a parameter.** `abs`
existed to feed `readdirSync` and `rel` to feed `git ls-files` and the refusal text, both of which
are process rather than configuration, and the engine derives each from the repository root. The
declarative form of this repository's roots is three repo-relative names.

**Excluded paths.** One entry: the scanner's own unit test, which must carry violator-shaped values
to prove the floor catches them. Allow-listing those values instead was refused, and the reason is
the email half: the allowed-domain declaration is GLOBAL, so declaring the domain to green this one
file would switch the email detector off for the whole corpus, while that file's own positive case
asserts the address IS reported. It is a literal path, never a class.

**`--staged` read scope.** Narrower than the sweep, and the asymmetry is the decision: widening the
sweep changes what CI reads, widening this changes what a COMMIT is BLOCKED on. The two bare root
names are in it because git records no index entry for a directory, so an index entry at exactly
`src` or `test/__fixtures__` is that root replaced by something else.

**Field detectors.** None. This is not a parser: there is no single standard to parse, so the
structured half of the gate is still the unimplemented obligation it has always been here, and a
green `pnpm phi-scan` means "no SSN or email shapes found", never "no PHI".

## 2. Which of these look universal

Offered as a judgement about the sibling scanners, not a survey of them.

- **Universal, and the engine already treats them so:** exit codes, scan roots, the `--staged` read
  scope, excluded paths, the walk read filter, the regular blob modes. Every one of them is a value
  this repository sets and every one is a value a sibling would set differently.
- **Universal but empty here:** the five detector kinds (names, DOB, MRN or member id, address,
  phone). This repository declares all five empty, which is the useful data point: **the detector
  layer has to be empty-able without that reading as an unfinished port.** The engine's `detect` is
  optional, so this already holds.
- **Not a parameter at all:** the `{ abs, rel }` root pair, and every function this repository used
  to own for walking, reconciling, reporting and exiting.

## 3. What the engine cannot express, each measured

### 3.1 An unreadable path takes node's exit 1, which this contract reserves for HITS FOUND

Three cases, same class, all reproduced on a throwaway repository:

| case                                      | `origin/main`                                    | engine `0.0.2`                                  |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| a directory under a scan root at mode 000 | exit 2, `could not read src/sub: EACCES`         | **exit 1**, uncaught `readdirSync` stack trace  |
| the allow-list present but at mode 000    | exit 2, `could not read the allow-list at ...`   | **exit 1**, uncaught `readFileSync` stack trace |
| the override log present but at mode 000  | exit 2, `could not read the override log at ...` | **exit 1**, uncaught `readFileSync` stack trace |

The engine discloses the second and third rather than claiming to have closed them, and declines to
close them on the grounds that enumerating error spellings buys one more evasion per round. **This
repository's remedy was not a spelling list.** It is a bare `try`/`catch` around the read that
rethrows as the engine's own refusal type, which cannot be evaded because it names no spelling. The
first case is not disclosed anywhere: `lstatOrNull` catches at the ROOT, so an unreadable root is
reported the way a missing one is, but a `readdirSync` one level below a root has no handler at all.

**Minimal API:** none. This is an engine fix rather than a parameter. Wrap the three reads
(`readdirSync` in the walk, and both `readFileSync` calls) so the failure becomes the engine's
`InvocationError` and lands on `exitCodes.refuse`. A repo cannot express this as configuration and
must not: a scanner whose broken invocation is indistinguishable from a PHI finding is the exact
confusion the reserved code exists to prevent.

### 3.2 There is no way to say "read this file, but do not run detectors over it"

| case                                   | `origin/main`                | engine `0.0.2`       |
| -------------------------------------- | ---------------------------- | -------------------- |
| sweep over the exempt path             | exit 0                       | exit 0               |
| paths mode naming the exempt path      | exit 1, hit reported         | exit 1, hit reported |
| sweep with the exempt path at mode 000 | exit 2, `could not read ...` | **exit 0**           |

`excludedPaths` withdraws a path before any route reads it, which is its documented meaning. This
repository applied the same exemption AT THE SCAN instead, deliberately: the file stayed walked,
stayed READ, and therefore stayed part of what the completeness accounting covers, so an unreadable
copy still refused. The third row is that difference. The two rows above it are preserved, including
the load-bearing one: paths mode still reports every hit, so the exemption does not DELETE a
detection.

**Minimal API:** a second, narrower key beside `excludedPaths`, defaulting to none.

```
/** Paths the SWEEPING routes read and account for, but run no detector over. */
detectorExemptPaths?: ReadonlySet<string>;   // default: new Set()
```

It cannot be folded into `excludedPaths`, because the two answer different questions: `excludedPaths`
says "this scan has no verdict here", and this says "this scan read it and is choosing not to judge
it". Only the second keeps the file inside the completeness accounting.

### 3.3 A starved working tree no longer says so

| case                                             | `origin/main` | engine `0.0.2`                                 |
| ------------------------------------------------ | ------------- | ---------------------------------------------- |
| a scan root missing, its corpus still tracked    | exit 2        | exit 0                                         |
| a scan root emptied, its corpus still tracked    | exit 2        | exit 0                                         |
| a tracked VIOLATOR deleted from the working tree | exit 2        | **exit 1**, hit reported `(as git carries it)` |

**This is listed as a delta and NOT as a gap, and the third row is why.** The old refusal was a proxy
for "the walk did not read the corpus"; the union half reads the bytes git carries directly, so the
corpus IS scanned and a violator in it is still found. What is lost is a signal about the working
tree, which is not what a PHI scan is a claim about. **No parameter is wanted here.** It is recorded
because the exit code a caller sees changes from 2 to 0 or 1 for the first two rows, and this
repository's own CLAUDE.md and test suite both assert the old code.

## 4. What adoption already buys, measured

- **A scan root that is itself a LIVE symbolic link is refused** (exit 2, naming the entry and its
  kind, never the target path). This repository disclosed that as an open escape, narrowed rather
  than closed, with a measured case in which a link target mirroring the tracked NAMES was followed
  at exit 0, decoy contents and all. The engine `lstat`s at the root, so kind is decided before
  anything is opened.
- **A staged unmerged path under a scan root is refused** (exit 2). It was out of scope here and
  exited 0.
- **The completeness rule arrives.** Called directly against each version's scanner, the shared
  probe grades `origin/main`'s scanner `drift` (it reports only its HITS code over a run that
  withdrew an enumerated target) and this branch's `ok` (it REFUSES that run).
- **`--allow-fixture` can no longer select the mode.** A lone `--allow-fixture <path>` used to send
  the run down paths mode over exactly that path, withdraw it, open nothing and report clean.

## 5. Two pre-checks the engine now enforces, both run here

**No scan root is `./`-prefixed.** The three roots at `origin/main` carry the repo-relative
spellings `src`, `test` and `scripts`. A `./`-prefixed root walks correctly while matching no index
path, which empties the union and both index refusals in silence.

**The `--staged` read scope admits nothing outside the scan roots.** Staged as an ordinary blob under
the shipped roots, all four shapes this predicate admits (`test/__fixtures__/<file>`, `src/<file>.ts`,
and the bare names `src` and `test/__fixtures__`) reach exit 0 with no containment refusal. Negative
control on the same predicate with the roots narrowed to `["src"]`: exit 2, naming
`test/__fixtures__/new.txt` as readable but outside every scan root. So the check is live and the
shipped configuration passes it.

## 6. Where a parser's assumptions do not hold here

Recorded because this is the first non-parser repository to take this gate.

- **There is no one wire format.** The corpus is TypeScript carrying inline message literals plus six
  small fixtures, one each of HL7 v2, X12, ASTM, NCPDP SCRIPT XML, FHIR JSON and DICOM. A detector
  here dispatches on the fixture's format before it parses anything, so "the per-standard field
  detectors" is per-FIXTURE-FORMAT here. Nothing in the engine's surface obstructs that: `detect`
  receives text and bytes and raises through `ctx.hit`, and the format choice is the caller's.
- **`src/` is a command tree, not a parser.** It changes what the roots mean and nothing about how
  they are declared.
- **The scan roots are narrow, and the reason is a real value in a tracked file** rather than a
  preference: the repository root cannot be a scan root while `package.json` carries the brand's
  contact address. A repo without a fixture corpus of its own is likelier to hit this, so the
  engine's support for narrow roots is load-bearing for the non-parser class rather than incidental.

Nothing in the engine's parameterization was found to assume "I am a parser".
