---
"@cosyte/cli": patch
---

`dispatchTool` no longer hands a caller's `writeStdout` sink to the command it runs. A `parse` of an MLLP stream with injected deps that carried a sink sent its records to that sink and came back as a `failed` call with exit `0` and no data; the records now come back in the tool result, as they do without injected deps.
