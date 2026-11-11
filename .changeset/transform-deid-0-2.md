---
"@cosyte/cli": patch
---

`cosyte convert` now reports the PID fields it does not carry into `Patient`. The command asks for `@cosyte/transform` `^0.2.1`, where it asked for `^0.1.0`, and that release reports each valued PID-10 race, PID-15 primary language, PID-19 SSN, PID-22 ethnic group, PID-29 death date and time and PID-30 death indicator as an `information` `TRANSFORM_ELEMENT_DROPPED` at its own location, on stderr and in the `--json` findings. Before, these fields were dropped with no finding, so a `Patient` from a PID that records a death came out with no `deceased[x]` and nothing said so. The exit code does not change for these findings. The same release also reports a PID-7, PV1-44, PV1-45 or MSH-7 date it could not read, as a `warning` `TRANSFORM_TIMESTAMP_DROPPED_BY_PARSER`.

`cosyte redact` asks for `@cosyte/deid` `^0.2.4`, where it asked for `^0.1.0`. The X12 pass in that release decides every element it outputs, so it removes more and refuses more under its default policy: an 834 whose HD-04 plan coverage description carries a value now has that locus blocked, and `redact` refuses the run with `CLI_DEID_INCOMPLETE` and exit `1`, where before it wrote a copy. Nothing to change in a script that already branches on the exit code.
