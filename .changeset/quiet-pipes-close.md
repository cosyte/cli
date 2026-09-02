---
"@cosyte/cli": patch
---

Terminate cleanly when a downstream consumer closes the CLI's stdout, and publish the code that
says so. `cosyte parse big.ndjson | head -3`, a pager you quit, or any early-exiting reader now ends
the run quietly under a new documented exit code, `74` (`IOERR`, the value `sysexits.h` assigns
`EX_IOERR`), with the stable value-free `CLI_OUTPUT_WRITE_FAILED` diagnostic on stderr.

The contract is additive: no existing code is renamed, repurposed or removed, and no existing code's
meaning changes. `74` was chosen over the internal-error code on a measurement rather than a guess:
a write to a closed stdout is a Node `EPIPE` on the stream, a handled condition the consumer owns,
and reporting it as `70` told an operator their pipeline had hit a bug in the CLI. The one condition
that moves onto the new code is the closed-consumer write failure itself, which previously reported
`70` on the record-stream path.

- **Neither write path reports a success over output that reached nobody.** The whole-result write
  in the `cosyte` bin bypassed the guarded output sink altogether, and the record stream's sink only
  consulted a flag the platform sets asynchronously, so a short enough run could have every line
  enqueued before the closed consumer was reported: `cosyte parse msg.hl7 | head -1` and
  `cosyte parse bulk.ndjson --ndjson | head -1` could each print a summary and exit `0` over output
  that was never delivered. Every chunk bound for stdout now waits for the platform's
  acknowledgement before the run may resolve, so an undelivered result resolves to `74` whatever the
  command had computed, and the summary describing that computed outcome is withdrawn with it.
- **`cosyte-mcp` terminates quietly when its client goes away.** A closed stdout used to reach the
  process as an unhandled stream error, printing a Node stack trace that named this machine's
  install paths. It is now a value-free diagnostic and the same exit code, and the server ends
  rather than serving a channel nobody is reading.
- **A closed stderr cannot turn either termination into an unhandled error.** Both bins hear the
  diagnostic channel's own error and fall back to the exit code as the whole signal.
- **The value-free posture is unchanged and now tested against real processes.** No diagnostic on
  this path carries a byte of the input, an `EPIPE` string, a Node error name or a stack frame.
