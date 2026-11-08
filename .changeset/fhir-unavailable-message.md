---
"@cosyte/cli": patch
---

The `CLI_PARSER_UNAVAILABLE` message for a missing `@cosyte/fhir` no longer says the package is not on the npm registry: it is. The message now says FHIR support is unavailable in this install, that `@cosyte/fhir` arrives as the peer dependency of `@cosyte/transform` (which an install without peer dependencies, such as npm's `--legacy-peer-deps`, leaves out), and to install `@cosyte/fhir` alongside `@cosyte/cli`. The matching `convert` message no longer makes the same registry claim or says `@cosyte/transform` is missing when only its `@cosyte/fhir` peer is: it names both packages and says to install both alongside `@cosyte/cli`. The code (`CLI_PARSER_UNAVAILABLE`) and exit code (`69`) are unchanged, and both messages stay value-free.
