---
"@cosyte/cli": patch
---

Read NCPDP Telecom as well as SCRIPT. A Telecom vD.0 request, such as a B1 billing claim, is now detected as `ncpdp` instead of exiting `65` with `CLI_FORMAT_UNDETECTED`, and `parse`, `inspect`, `fmt`, and `validate` route a non-XML `ncpdp` input to the Telecom parser in `@cosyte/ncpdp`, with or without `--format ncpdp`. `inspect` on Telecom reports the transaction code, version, and counts of transactions and segments, never a field value. Every other format detects and behaves as before.
