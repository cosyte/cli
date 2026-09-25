/**
 * Branch on the exit code: the verdict of `cosyte validate`, and the codes for input it could not
 * handle.
 *
 * `0` valid, `1` invalid, `2` a usage error, `65` input that could not be parsed, `66` no input. A
 * diagnostic on stderr names a code and a location, never a value from the input. The inputs are
 * this repository's synthetic fixtures and inline synthetic documents.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/exit-codes.ts
 */

import assert from "node:assert/strict";

import { cosyte, fixture } from "./_cosyte.js";

const valid = cosyte(["validate", fixture("adt-a01.hl7")]);
// Parseable, but `masculine` is not a code in the administrative-gender value set R4 requires.
const invalid = cosyte(
  ["validate", "--format", "fhir", "-"],
  '{"resourceType":"Patient","gender":"masculine"}',
);
const usage = cosyte(["validate", "--no-such-flag", fixture("adt-a01.hl7")]);
const garbled = "SYNTHETIC-NOT-A-MESSAGE-0001";
const unparseable = cosyte(["parse", "-"], garbled);
const missing = cosyte(["parse", "no-such-file.hl7"]);

const results = { valid, invalid, usage, unparseable, missing };
for (const [name, run] of Object.entries(results)) {
  console.log(`${name}: exit ${String(run.status)} | ${run.stderr.trim().split("\n").join(" | ")}`);
}

assert.equal(valid.status, 0);
assert.equal(invalid.status, 1);
assert.match(invalid.stderr, /CODE_INVALID at Patient\.gender/);
assert.equal(usage.status, 2);
assert.equal(unparseable.status, 65);
assert.match(unparseable.stderr, /CLI_FORMAT_UNDETECTED/);
assert.equal(missing.status, 66);
// The input that could not be parsed is never echoed back.
assert.ok(!unparseable.stderr.includes(garbled));
assert.ok(!invalid.stderr.includes("masculine"));
console.log("exit-codes: ok");
