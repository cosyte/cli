# @cosyte/cli

The `cosyte` command and the `cosyte-mcp` stdio server, published to npm as `@cosyte/cli`: developer
tooling that wraps the `@cosyte/*` parsers and parses no wire format itself. A message goes in on a
file or stdin, typed JSON comes out on stdout, and stderr carries diagnostic codes and positions. The
exit codes and `CLI_*` codes are the stable surface scripts branch on.

## Gate

From the repo root, in the order CI runs them (`.github/workflows/ci.yml` calls the shared
`cosyte/.github` `ci.yml` and adds the examples job; `no-emdash.yml` and `no-internal-refs.yml` run
the last two):

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm phi-scan
pnpm test
pnpm test:coverage
pnpm build
pnpm attw
pnpm smoke
pnpm typecheck:examples && pnpm lint:examples && pnpm examples && pnpm phi-scan:examples
pnpm check:no-emdash
pnpm check:no-internal-refs
```

`pnpm smoke` covers locally what CI's inline ESM/CJS import check does on `dist/`. Only CI runs
`ci / prepublish` (the shared `prepublish-check.mjs`: every dependency specifier resolves from a
registry, and the packed tarball installs into a clean directory), actionlint and CodeQL, and
`no-emdash` there also reads the PR title, body and commit messages.

## Hazard

It holds no patient data at rest. A defect lands on the machine and working tree of whoever runs it,
and in the scripts and CI logs that consume its output: a wrong exit `0` passes a bad message
downstream, and an input value on stderr copies it into a log nobody meant to keep it in.

## Rules that bind here

- **Node:** **>= 22, < 26** (CI matrix 22 + 24). `test/node-support.test.ts` reds when this line, `engines.node` and the `ci.yml` matrix disagree; each matrix value is a required check, so a new Node line waits for the owner to require it (#54, #35).
- Every `dependencies` and `optionalDependencies` specifier resolves from the npm registry, never `file:` or `link:`: 0.0.1 and 0.0.2 shipped `file:vendor/*.tgz` and stay uninstallable (#27).
- `@cosyte/fhir` stays a devDependency only: declared beside `@cosyte/transform`, whose peer it is, it failed the install with `ERESOLVE` (#27).
- Load an optional `@cosyte/*` package only through the lazy loaders in `src/core/parsers.ts`, and keep its `import type` of `@cosyte/fhir` type-only: an absent package must degrade to `CLI_PARSER_UNAVAILABLE` (69), and `test/absent-sibling.test.ts` only catches a bare one-line `import()` of fhir or transform (#27).
- Diagnostics and MCP error results carry codes and positions, never caller-supplied text (`--unsafe-show-values` is the one opt-in): an unknown MCP tool name was echoed back until #49.
- A change to a command, flag, exit code or `CLI_*` code updates `README.md` and `docs-content/` in the same PR: the docs stated a FHIR exit `69` that 0.1.0 no longer gives (#66).
- Run `pnpm attw`, never the bare `attw` CLI: it prints "does not contain types" and exits 0 over a pack with no declarations, and `scripts/attw.mjs` is the wrapper that reds it (#25).
- `scripts/phi-scan.ts` exits `1` for hits only and `2` for anything it could not read, and `--staged` keeps `--no-renames`: a `git mv` into a scan root passed the pre-commit hook (#30), and the sweep printed `OK, no hits` over a root it never opened (#38).
- A `test/scripts/` test that builds a git fixture asserts the fixture took before asserting the fix: a `git merge` with no git identity on CI left assertions passing over an empty index (#30).
- Top-level entries in `docs-content/sidebars.json` stay on the docs.cosyte.com spine (`intro`, Installation, Quickstart, Core Concepts, Guides, Troubleshooting), with no hand-written `API Reference`: two off-spine labels here held up the site's deploy, and no check in this repo sees it (#32).
- Keep item ids, phase or wave words, ADR numbers and roadmap paths out of `README.md`, `docs-content/`, `src/` JSDoc and string literals: two diagnostics and the published `.d.ts` carried them (#13, #19). `pnpm check:no-internal-refs` catches identifiers, not sentences about our process.
- When trimming docs, cut a claim rather than soften it, and write a "not supported" cell as words: a dash sweep turned three support-matrix cells in `docs-content/limitations.md` into stray colons (#20).
- Docs say `npx --package @cosyte/cli cosyte ...`: `npx @cosyte/cli` fails because no bin is named `cli`, and adding one is the owner's call (#27).
- Required checks are context names (`gh api repos/cosyte/cli/rulesets` shows the ruleset): never rename a workflow job, drop a matrix value, split a step out of `ci / verify` or add a `paths:` filter. A context the ruleset does not name blocks nothing: `ci / prepublish` arrived from the shared workflow unrequired (#35).
