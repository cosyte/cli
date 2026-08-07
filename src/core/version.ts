/**
 * The CLI version string, synced with `package.json#version` on release by `scripts/sync-version.mjs`,
 * which the `version` script runs immediately after `changeset version`. Kept in its own module so
 * both the programmatic entry point and the dispatcher share one source of truth.
 *
 * The declaration below is rewritten by that script and is matched at column 0, annotation included.
 * Renaming it or reflowing it makes the script exit non-zero rather than silently no-op; the shape is
 * pinned by `test/sanity.test.ts`, and the value is compared against `package.json` there too.
 *
 * @packageDocumentation
 */

/**
 * The `@cosyte/cli` version. On the uniform `v0.0.x-until-first-alpha` ladder.
 *
 * Read by `cosyte --version` and by the MCP server's advertised `SERVER_INFO`, so it is a
 * user-visible surface on both front doors, not merely an export.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/cli";
 *
 * console.log(`cosyte ${VERSION}`);
 * ```
 */
export const VERSION: string = "0.0.5";
