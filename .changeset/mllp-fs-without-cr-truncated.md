---
"@cosyte/cli": patch
---

An MLLP stream that ends on a frame's FS byte, before the CR that closes it, is now refused as a truncated stream (`CLI_PARSE_FAILED`, exit `65`) by `parse`, `inspect` and `deframeMllp`. Before, that last frame was dropped without a word: `parse` printed the records before it and `inspect` counted the frames before it, both with exit `0`.
