# Examples

Small runnable programs, one per job the CLI does. Each one runs the built `cosyte` executable,
found through `@cosyte/cli/package.json` resolved by this package's own `exports` (the file a
consumer's `node_modules/.bin/cosyte` points at), on this repository's synthetic test fixtures, and
checks the exit code and the output: a mismatch exits non-zero.

Build once, then run them all:

```bash
pnpm install
pnpm build
pnpm examples
```

| File                                           | What it shows                                                                                                                                       | Run                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [`parse-and-inspect.ts`](parse-and-inspect.ts) | `cosyte parse` detects HL7 v2 from the content and prints typed JSON; `cosyte inspect` prints a summary that carries no value from the message.     | `pnpm tsx examples/parse-and-inspect.ts` |
| [`exit-codes.ts`](exit-codes.ts)               | The exit-code contract: `0` valid, `1` invalid, `2` usage, `65` unparseable, `66` no input, with stderr that never echoes the input.                | `pnpm tsx examples/exit-codes.ts`        |
| [`convert-to-fhir.ts`](convert-to-fhir.ts)     | `cosyte convert --to fhir` turns an ADT^A01 into a FHIR message Bundle on stdout, with value-free conversion issues on stderr.                      | `pnpm tsx examples/convert-to-fhir.ts`   |
| [`map-codes.ts`](map-codes.ts)                 | `cosyte map-codes` translates a code through a ConceptMap you supply: a match exits `0`, an unmapped code exits `1` with `TERM_TRANSLATE_UNMAPPED`. | `pnpm tsx examples/map-codes.ts`         |

`_cosyte.ts` is the helper they share. CI runs `pnpm typecheck:examples`, `pnpm lint:examples`,
`pnpm examples` and `pnpm phi-scan:examples` after `pnpm build` on every pull request, so an example
that drifts from the CLI fails the build.
