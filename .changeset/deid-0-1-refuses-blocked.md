---
"@cosyte/cli": patch
---

`redact` now delegates to the 0.1 releases of `@cosyte/deid`, and refuses an HL7 message that
carries a visit number or an order number.

The optional `@cosyte/deid` moves from `^0.0.9` to `^0.1.0`, and `redact` applies that library's
default policy unmodified. Under it an HL7 visit number (`PV1-19`) and a placer or filler order
number are blocked (`DEID_LOCUS_BLOCKED`), so such a message is refused with the existing
`CLI_DEID_INCOMPLETE`, exit `1` and nothing on stdout, and stderr names each blocked locus. Medical
record, account and member numbers are removed (`DEID_CATEGORY_REMOVED`) rather than replaced by a
surrogate, and HL7 `MSH-7` / `EVN-2` timestamps are now generalized. No exit code, diagnostic code
or flag changed.
