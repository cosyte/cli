# @cosyte/cli: packaging and runtime dependencies

`CLAUDE.md` is always read, so it is held to a byte budget. The two sections below live here in full,
under their own headings, and `CLAUDE.md` keeps each heading above a pointer at the copy here.
**Every rule below binds exactly as it binds there.**

Read both sections together. The manifest, the absent FHIR dependency, the vendored tarballs and the
hard-dependency cap are one subject, and **every rule below was paid for by a published version that
cannot be installed.**

The narrative behind each rule is in [`agent-notes.md`](agent-notes.md), and the pointers below reach
it from this directory rather than from the repository root.

### The published package, and the FHIR hole (live, unresolved)

Why: [agent-notes § The vendor to npm dependency swap](agent-notes.md#the-vendor-to-npm-dependency-swap).

- **`@cosyte/fhir` is deliberately NOT in the manifest, in any form, and you must not add it**: it cannot
  publish, and declaring it alongside `@cosyte/transform` fails the whole install with `ERESOLVE`. **This
  is not a manifest bug to fix**, and **do not explain that `ERESOLVE` with a missing
  `peerDependenciesMeta.optional` flag**: measured, that flag does not decide the outcome. **An installed
  copy therefore has NO FHIR support**, stated on every consumer surface rather than discovered: those
  commands degrade to a value-free `CLI_PARSER_UNAVAILABLE` (`69`), and `@cosyte/fhir` survives only as a
  **`devDependency`** on the vendored tarball.
- **Never quote the published version in this file** (derive it: `npm view @cosyte/cli version`), and
  **never move a published version backwards**: `0.0.1` and `0.0.2` are permanently broken on npm and
  both printed `VERSION = "0.0.0"`. **Fix the ASSERTION, not just the value**: `test/sanity.test.ts`
  pins the `: string` declaration shape `scripts/sync-version.mjs` keys on.
- **Never write "any new call site" of the `absent-sibling` static guard: a refuter falsified that
  wording.** It reds only on a NEW **single-line, unwrapped** dynamic `import()`, so **never drop the
  word `type` from `src/core/parsers.ts`'s `import type` of `@cosyte/fhir`**: it loads eagerly and
  breaks every command in an installed copy, unseen.
- **The two unavailable-parser diagnostics deliberately do NOT say "install it"**, and so do not use
  `loadOptional()`'s stock wording: that install fails `E404` on its own `fhir` peer. **Verify a release
  by INSTALLING the packed tarball outside the repo, never by `--dry-run`**, and **never make the
  `install-gate` job skippable**; its limits are in `RELEASING.md`, and the version-string check stays
  checklist step 6, a human one.
- **`npx @cosyte/cli …` fails**; use `npx --package @cosyte/cli cosyte …`. **A `cli` bin alias would fix
  it and is deliberately not added**: founder call. **Flipping a repo's visibility is never waived**, the
  public-flip stop is already behind this package, and the `npm publish` half is a founder directive.

### Hard runtime deps

- **Two hard `dependencies`, `@cosyte/hl7` + `@cosyte/terminology`**, real registry ranges, lazy-loaded
  per command: **2** against a cap of **4**, under it and not at it. Third-party runtime deps: **zero**.
- **`@cosyte/deid` is an `optionalDependency`, outside the cap**, reached only by `redact`; an absent
  copy degrades to `CLI_PARSER_UNAVAILABLE`/`69` before any input is read. **Never promote it to
  `dependencies`**: a hard dep a registry cannot resolve makes the whole CLI uninstallable.
- **Do not "restore" `@cosyte/transform` to `dependencies` or declare `@cosyte/fhir`** without reading
  the swap note first. **`vendor/` survives only to supply `@cosyte/fhir` as a devDependency**; the other
  nine tarballs are wired to nothing, and removing them is a separate cleanup. Detail:
  [agent-notes § Hard runtime deps](agent-notes.md#hard-runtime-deps).
