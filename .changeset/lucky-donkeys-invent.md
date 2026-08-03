---
"@cosyte/cli": patch
---

Make the published package installable, and stop `VERSION` lying about the release
(CLI-UNINSTALLABLE-MANIFEST, CLI-VERSION-DRIFT).

`0.0.1` and `0.0.2` both published with all ten `@cosyte/*` siblings declared as `file:vendor/*.tgz`
local paths. `vendor/` is not in `files`, so the tarball shipped none of them and every install route
died with `ENOENT` on `node_modules/@cosyte/cli/vendor/cosyte-fhir-0.0.0.tgz`. The siblings are now
real registry ranges: `@cosyte/hl7` and `@cosyte/terminology` as hard `dependencies`, the six breadth
parsers plus `@cosyte/transform` as `optionalDependencies`. Proven by packing the tarball and
installing it in a clean directory outside the repo, then running both bins and importing the `.`
subpath under ESM and CJS: the check a `npm publish --dry-run` cannot perform.

`src/core/version.ts` exported `"0.0.0"` while `package.json` said `0.0.2`, so `cosyte --version` and
the MCP server's advertised `serverInfo.version` both lied; confirmed in the published tarball.
`scripts/sync-version.mjs` now runs inside the `version` script, and the test suite compares the
export against `package.json`. The two assertions that let the same defect through five sibling
releases are fixed too, not just the value: the docs smoke test asserted `typeof VERSION` and now
asserts the exact version, and the declaration's `: string` annotation that the sync script keys on is
pinned by its own test.

One dependency could not be made real. `@cosyte/fhir` is not on the npm registry, and declaring it
alongside `@cosyte/transform` (which requires it) fails the whole install with `ERESOLVE`, so it is
not declared at all and `@cosyte/transform` is skipped by npm. FHIR `parse`/`inspect`/`fmt`/`validate`
and `convert` therefore degrade to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`) instead of
crashing on a bare `await import()`, with a diagnostic that says the package is not on the registry
rather than "install it". HL7 v2, `map-codes` and the six breadth formats work from a plain install.

The docs also stop telling people to run `npx @cosyte/cli …`, which never worked and is not fixed by
any of the above: `npx` picks the executable matching the package name's last segment (`cli`), and
this package ships `cosyte` and `cosyte-mcp`.
