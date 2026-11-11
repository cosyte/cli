---
"@cosyte/cli": patch
---

`cosyte parse` now writes its output as it goes and waits for a slow reader, so a large run no longer holds its whole output in memory. The JSON for one message is written in pieces of about 64 KiB as it is produced, where it was built as one string first, and the bytes on stdout are the same as before. When the process reading stdout falls behind, `parse` waits for it before it writes, parses or reads anything more, where before the output it had not delivered yet queued in memory. An `--ndjson` line that spans many read chunks is now joined once, when it ends, instead of being copied again for every chunk.

The wrapped parsers are asked for at their current releases: `@cosyte/hl7` `^0.1.10`, `@cosyte/fhir` `^0.1.11`, `@cosyte/x12` `^0.1.12`, `@cosyte/astm` `^0.1.7`, `@cosyte/ncpdp` `^0.1.7`, `@cosyte/ccda` `^0.1.6`, `@cosyte/dicom` `^0.1.13`, `@cosyte/mllp` `^0.1.9` and `@cosyte/terminology` `^0.1.6`, where each asked for `^0.1.0`. With `@cosyte/fhir` 0.1.11, `parse` holds far less memory on a FHIR resource with a large base64 attachment.

For the programmatic API: `RunDeps.writeStdout` may now return a promise, and the command waits for it before it writes again. A sink that returns nothing works as before; a sink given to `parse` now also receives a single message's output, in pieces, and the result's `stdout` is then empty. New exports: `createOutputSink`, which wraps a writable stream with this waiting, and `jsonChunks`, which writes a value as `JSON.stringify` would, a piece at a time.
