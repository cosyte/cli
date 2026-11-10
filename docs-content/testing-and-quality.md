---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
description: "How we test @cosyte/cli: exit-code and PHI-leak tests, real processes and closed pipes, fuzzing, doc samples run against the build, and what each misses."
---

# Testing and quality

This page describes how we test `@cosyte/cli`, what each technique catches, and what it cannot. The
rules every Cosyte package follows (the coverage and mutation floors, the property-based runners,
what a pull request must prove) are written down in the testing standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

The CLI parses nothing itself, so its tests aim at what it owns: the route to the right library, the
exit code, what reaches stderr, and what happens when a library, the input, or the reader of its
output is not what it expected. Each library it wraps is tested in its own repository.

## What we run, and what each technique catches

| Technique | What it catches | What it cannot catch |
| --- | --- | --- |
| Unit tests | each command's output and exit code on synthetic fixtures for every format, through in-memory input | a defect in a wrapped library's own parsing, which its own tests cover |
| Exit-code matrix | a code that moved: one invocation for each exit code, run through the dispatcher | an input class nobody added to the matrix |
| PHI-leak tests | a value on a secondary channel: fixtures carry planted identifiers, which must appear only on stdout, never on stderr or in an MCP result outside its payload | a value with no planted marker; a channel the tests do not read |
| Real-process tests | what a terminal sees when the reader of stdout or stderr goes away: the built command runs as a child process and its pipe is closed under it | a platform other than the one CI runs on |
| Missing-library tests | a crash or a misleading error when an optional library is absent: each loader is made to fail as a missing package does, and the command must answer `CLI_PARSER_UNAVAILABLE`; the parse path is checked never to load the MCP SDK or `@cosyte/deid` | a package that is present but broken in a way no test imitates |
| Fuzzing | a crash, an unhandled exception, or a stack trace on stderr or in an MCP result, from arbitrary arguments, input bytes, and tool calls (fast-check) | a wrong but plausible answer, unless a property says what right is |
| Documentation checks | a page that disagrees with the code: TypeScript samples compiled against the published types and run against the build; shell samples run against the built command with their shown output compared; links and anchors resolved; the diagnostic-code, format-support, MCP-tool, size-limit, exit-code, and Node.js support pages compared with the source | prose that is wrong next to a sample that is right |
| Coverage gate | code no test runs: lines, branches, functions, and statements, held at a floor overall and for the `core` and `commands` folders | a test that runs code without checking what it returns |
| Mutation testing | a test that runs code but would not notice it changing | not yet run on this package; the numbers below say "not measured" until it is |
| Package checks | a broken published package: the type declarations are checked for each module system, both entry points are loaded as ESM and as CommonJS, the examples run the built command, and the packed tarball is installed in a clean project | a runtime other than Node.js |
| PHI scan | a value shaped like a real identifier in a committed file | anything in Markdown, which it does not read; it finds a value after it is written, it does not prevent one |
| Static analysis | the classes of defect CodeQL looks for in JavaScript and TypeScript | anything outside its rules |

## How each one runs

- **Unit, matrix, PHI-leak, real-process, missing-library, and documentation tests** run in one
  Vitest suite on every pull request and on `main`, on Node.js 22, 24, and 26.
- **Fuzzing** runs at its committed size with the suite, and every night for a time budget per
  target from a seed that changes each night. A failure prints the seed that replays it.
- **The coverage gate** runs with the suite, and a floor that is not met fails the pull request.
- **Package checks** run in CI on every pull request; the release workflow installs the packed
  tarball again before it publishes.
- **The PHI scan** runs before every commit, on the staged files, and in CI, on every tracked file.
  Because it does not read Markdown, the documentation checks also refuse a dashed SSN outside the
  900 series, a phone number outside `555-0100` to `555-0199`, and an email address outside the
  reserved example domains on any of these pages.
- **CodeQL** runs in CI.

## Run them yourself

```bash no-run it runs the repository's own test suite from a clone
pnpm install --frozen-lockfile
pnpm test                                       # the whole suite, fuzzing at base size included
pnpm test:coverage                              # the same suite with the coverage gate
pnpm exec vitest run test/docs-content.test.ts  # the documentation checks alone
pnpm phi-scan                                   # the PHI scan over the repository
pnpm build && pnpm smoke                        # ESM and CommonJS loading of the build

# A longer fuzzing run from a seed you choose:
CLI_FUZZ_SEED=1 CLI_FUZZ_SECONDS=60 pnpm fuzz
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
