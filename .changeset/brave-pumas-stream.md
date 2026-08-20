---
"@cosyte/cli": patch
---

Give `cosyte parse` a documented input-size limit and incremental multi-record output.

An input past 67108864 bytes (64 MiB) is now refused with a value-free `CLI_INPUT_TOO_LARGE`
diagnostic naming the limit and the data-error exit code (`65`), never the internal-error code a
platform allocation failure used to produce. The check runs against the running byte count as the
input arrives, so the refusal lands before anything allocates memory proportional to the oversized
input. The limit is rendered from one constant into `cosyte --help` and the command reference, and a
test reds if those two ever disagree.

Multi-record output (`--ndjson` and MLLP frames) is emitted record by record as each record is
parsed, rather than accumulated and written once at the end. Per-record isolation and the exit-code
contract are unchanged. A fatal condition part way through keeps the lines already written and still
resolves to that failure's own non-zero exit code, so a partial record stream is never presented as a
complete one; a truncated MLLP stream is the visible case, where the frames that completed are now
emitted before the truncation is detected. A downstream consumer that closes the pipe is a value-free
`CLI_OUTPUT_WRITE_FAILED` rather than an unhandled write error.
