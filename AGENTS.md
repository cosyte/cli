# AGENTS.md

`@cosyte/cli` is the `cosyte` command and the `cosyte-mcp` stdio server, published to npm under MIT:
developer tooling over the `@cosyte/*` healthcare libraries that parses no wire format itself. A
message goes in on a file or stdin, typed JSON comes out on stdout, and stderr carries value-free
diagnostic codes. It supports Node.js 22 or later, tested on 22, 24, and 26.

## Build and test

Use Node.js 22.22.2 or later to build and test (the floor of the tools `@cosyte/process` runs; the
published package itself runs on any Node.js 22) and the pnpm version that `packageManager` in
`package.json` pins: run `corepack enable pnpm --install-directory <dir>` and put `<dir>` first on
`PATH`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## The gate

A pull request is ready when these pass, in this order. CI runs the first nine on Node 22, 24, and 26.

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
pnpm check:readme && pnpm check:claude-card && pnpm check:catalog && pnpm check:process
pnpm check:docs-content
```

A change that reaches the published package adds a changeset (`pnpm changeset`).

## Data

Synthetic data only. Healthcare messages carry patient data: never put a real patient's data in a
test, a fixture, an example, an issue, or a log. `pnpm phi-scan` checks the tree, and it is a floor,
not proof.

## Contributing

See [CONTRIBUTING.md](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md).
