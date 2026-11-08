---
"@cosyte/cli": patch
---

Built with tsup 9. The JavaScript is unchanged. In the published `.d.ts` files, type-only exports now sit in their own `export type {}` statement, and `mcp.d.ts` takes `CliCode` and `RunDeps` from the root entry instead of a shared chunk. The exported names and types are the same.
