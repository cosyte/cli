---
"@cosyte/cli": patch
---

Correct the `sysexits.h` attribution in the exit-code contract.

Exit `2` was documented as `EX_USAGE`, but `sysexits.h` assigns `EX_USAGE` the value `64`. The label
sat in two places in `src/core/exit-codes.ts` (the module's contract table and the `USAGE` member's
JSDoc), so it compiled into the published type declarations and rendered on a consumer's hover;
`README.md` and the concepts page grounded their whole table in that header while listing `1` and
`2`, which it does not define. Exit `2` now carries no sysexits constant, and `1` and `2` are both
stated as this CLI's own values. The four labels that were already correct (`EX_DATAERR` 65,
`EX_NOINPUT` 66, `EX_UNAVAILABLE` 69, `EX_SOFTWARE` 70) are unchanged.

No published exit value moved, and no member of the exported `EXIT` map was added, removed or
renamed. Every command still exits with the status it exited with before, and a consumer who
hard-coded `EX_USAGE = 2` against this CLI keeps working. A new test reads every source file, the
README and every published docs page and reds if a sysexits constant is ever again attached to a
number that header does not assign it.
