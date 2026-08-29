---
"@cosyte/cli": patch
---

Publish an output schema for every MCP tool, and make every tool result conform to it.

An agent calling a cosyte tool previously received `structuredContent: { exit, ok }` with no schema to
check it against, and a text content block holding the command's stdout, which was a different value
from the structured one. Deciding whether a result held data or a diagnostic meant pattern-matching a
text blob.

Each of the four tools now advertises an `outputSchema` (and a `title`) on `tools/list`, and every
dispatch path returns structured content conforming to the schema its own tool declared. The result
carries `ok`, a `status` of `success` / `verdict` / `failed`, the `exit` code from the documented
exit-code contract, a stable `code` on a failed call, and the tool's own payload under `data`: the
parsed model and warnings, the validation verdict and findings, the structural summary, or the
converted Bundle. `status` is the property that separates a negative verdict about the message (the
tool ran; the payload is present) from a call that produced nothing, which no text blob could
distinguish reliably.

The text content block is now the serialized JSON of that same structured result, so a client that
reads only text sees exactly the value a schema-aware client validates.

On a failed call the structured result is value-free by construction: every property is drawn from a
fixed set (the outcome vocabulary, the exit-code contract, the diagnostic-code registry), so no part
of the caller's input can appear in it. The tool name of an unknown tool is no longer echoed back, for
the same reason. Tool names, tool count, input schemas, the exit-code contract and the rule that a
parsed-but-invalid `validate` is a successful call are all unchanged, and no dependency was added.
