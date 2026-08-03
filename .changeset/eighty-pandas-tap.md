---
"@cosyte/cli": patch
---

Make the `attw` publish gate report its own failure (ATTW-FALSE-GREEN-PORT).

The `attw` script was the bare CLI, and `@arethetypeswrong/cli@0.18.4`'s `getExitCode.js` opens
with `if (!analysis.types) return 0`. A tarball carrying no declarations printed "This package does
not contain types." and exited 0, so `verify.sh` propagated a pass. Reproduced here with zero
concurrency under the real `--profile node16` invocation, both with `dist/` removed and with the
declarations deleted from a completed build.

`scripts/attw.mjs` now wraps the binary with a preflight (every relative path `package.json`
promises, including every `bin` target, must exist and be non-empty) and a post-check that promotes
the untyped sentence to a failure. Arguments are forwarded unchanged, so `--profile node16` keeps
its meaning; the options that would hide the sentence are refused by name, with the short-option
forms they do not cover disclosed in the script header rather than papered over.
`test/scripts/attw-gate.test.ts` pins both nets, the upstream exit 0, and a negative control against
the real binary.
