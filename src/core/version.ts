/**
 * The CLI version string, synced with `package.json#version` on release by the Changesets `version`
 * script. Kept in its own module so both the programmatic entry point and the dispatcher share one
 * source of truth.
 *
 * @packageDocumentation
 */

/**
 * The `@cosyte/cli` version. On the uniform `v0.0.x-until-first-alpha` ladder.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/cli";
 *
 * typeof VERSION; // => "string"
 * ```
 */
export const VERSION = "0.0.0";
