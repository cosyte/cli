---
"@cosyte/cli": patch
---

`cosyte convert` now reports the PID fields it does not carry into `Patient`. The command asks for `@cosyte/transform` `^0.2.2`, where it asked for `^0.1.0`, and that release reports each valued PID-10 race, PID-15 primary language, PID-19 SSN, PID-22 ethnic group, PID-29 death date and time and PID-30 death indicator as an `information` `TRANSFORM_ELEMENT_DROPPED` at its own location, on stderr and in the `--json` findings. Before, these fields were dropped with no finding, so a `Patient` from a PID that records a death came out with no `deceased[x]` and nothing said so. The exit code does not change for these findings. The same release also reports a PID-7, PV1-44, PV1-45 or MSH-7 date it could not read, as a `warning` `TRANSFORM_TIMESTAMP_DROPPED_BY_PARSER`.

`cosyte redact` asks for `@cosyte/deid` `^0.2.4`, where it asked for `^0.1.0`, and refuses more input under that library's default policy. A refusal is what it was before: `CLI_DEID_INCOMPLETE`, exit `1`, nothing on stdout, and stderr naming each blocked locus with no value from the input. X12 input is where most of the new refusals are, because the X12 pass now decides every element it outputs and blocks a value it cannot place instead of passing it through:

- a code it does not recognise at a code position such as `NM1-01`, `N1-01`, `NM1-08`, `N1-03`, `REF-01`, `N4-02` or `N4-04` (the codes are checked against the 005010 code lists, so `NM1*il*` is refused where `NM1*IL*` is not);
- a value of the wrong shape at a code, qualifier, date, amount or count position, and the values after a required position left empty, as a missing or extra separator leaves them;
- any value at a position no rule names: `REF-03` and later, `NM1-10` and later, `N1-05` and later, and any element past the last one a segment uses;
- free text inside a composite, and a free-text value such as the `HD-04` plan coverage description of an 834;
- a segment the pass has no shape for (such as `PLB`), a segment outside every transaction set, and bytes after the `IEA`.

Outside X12, a FHIR resource with a plain string where an Identifier, an Address or a HumanName belongs is now refused, and so is HL7 v2 input that holds more than one MSH segment (with `DEID_FORMAT_UNSUPPORTED`). The full list is in the `@cosyte/deid` changelog for 0.2.0 to 0.2.4. If a document you redacted before is now refused, read the blocked loci on stderr: correct the value when the sender meant something else there (a lower-case code, a shifted separator), remove the value or segment before you redact when you do not need it, or split HL7 v2 input into one message per run. To keep a value the default policy blocks, call `@cosyte/deid` from code with a policy of your own; `redact` takes none. A script that branches on the exit code needs no change.
