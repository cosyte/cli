# @cosyte/cli

The `cosyte` command and the `cosyte-mcp` stdio server, published to npm as `@cosyte/cli`:
developer tooling that wraps the `@cosyte/*` parsers and parses no wire format itself. A message
goes in on a file or stdin, typed JSON comes out on stdout, and stderr carries diagnostic codes and
positions. The exit codes and `CLI_*` codes are the stable surface scripts branch on.

@AGENTS.md

## Gate

From the repo root, in the order CI runs them (`ci.yml` calls the shared `ci.yml` and adds the
examples job; `no-emdash.yml` and `no-internal-refs.yml` run the last two):

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm phi-scan
pnpm test && pnpm test:coverage && pnpm build && pnpm attw && pnpm smoke
pnpm typecheck:examples && pnpm lint:examples && pnpm examples && pnpm phi-scan:examples
pnpm check:no-emdash && pnpm check:no-internal-refs
```

`pnpm smoke` covers locally what CI's inline ESM/CJS check does on `dist/`. Only CI runs
`ci / prepublish` (specifiers resolve from a registry, and the packed tarball installs clean),
actionlint and CodeQL; `no-emdash` there also reads the PR title, body and commit messages.

## Hazard

It holds no patient data at rest. A defect lands on the machine and working tree of whoever runs
it, and in the scripts and CI logs that consume its output: a wrong exit `0` passes a bad message
downstream, and an input value on stderr copies it into a log nobody meant to keep it in.

## Rules that bind here

Each in full, with the failure behind it: documentation/agent-notes.md#rules-in-full.

- **Node:** **>= 22** (CI matrix 22 + 24 + 26). `test/node-support.test.ts` reds when this line,
  `engines.node`, the matrix and the support lines disagree; 26 awaits the ruleset (#54, ST15).
- Every `dependencies` and `optionalDependencies` specifier resolves from npm, never `file:` or
  `link:`, and `@cosyte/fhir` stays a devDependency, or the install fails `ERESOLVE` (#27).
- Load an optional `@cosyte/*` package only through the lazy loaders in `src/core/parsers.ts`, so
  an absent one degrades to `CLI_PARSER_UNAVAILABLE` (69) (#27).
- Diagnostics and MCP error results carry codes and positions, never caller-supplied text;
  `--unsafe-show-values` is the one opt-in (#49).
- A change to a command, flag, exit code or `CLI_*` code updates `README.md` and `docs-content/`
  in the same PR (#66).
- The changeset summary is the changelog entry: never hand-edit `CHANGELOG.md` or bring back
  `[Unreleased]`, and keep the history under its generated-file heading as it is (#73).
- Run `pnpm attw`, never bare `attw`, which exits 0 over a pack with no declarations (#25).
- `scripts/phi-scan.ts` exits 1 for hits only and 2 for anything it could not read, and `--staged`
  keeps `--no-renames` (#30, #38).
- A `test/scripts/` test that builds a git fixture asserts the fixture took before the fix (#30).
- `docs-content/sidebars.json` stays on the docs.cosyte.com spine, with no hand-written
  `API Reference` (#32).
- Keep item ids, phase words, ADR numbers and roadmap paths out of the README, `docs-content/`,
  JSDoc and string literals (#13, #19), and cut a claim rather than soften it (#20).
- Docs say `npx --package @cosyte/cli cosyte ...`: no bin is named `cli`, so `npx @cosyte/cli`
  fails (#27).
- Required checks are context names: never rename a job, drop a matrix value, split a step out of
  `ci / verify`, or add a `paths:` filter (#35).
