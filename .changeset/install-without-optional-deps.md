---
"@cosyte/cli": patch
---

Declare `@cosyte/fhir` as an optional dependency beside `@cosyte/transform`, so an install made with `npm install --legacy-peer-deps` now includes it and FHIR `parse` and `convert` work there. An install made with `--omit=optional` no longer crashes at startup on the missing MCP SDK: every command other than the MCP server runs, and `cosyte-mcp` and `cosyte mcp` exit `69` with a value-free `CLI_PARSER_UNAVAILABLE` that names `@modelcontextprotocol/sdk` as the package to install.
