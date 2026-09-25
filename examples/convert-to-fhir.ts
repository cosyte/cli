/**
 * Convert an HL7 v2 message to a FHIR R4 Bundle from the command line.
 *
 * `cosyte convert --to fhir` runs `@cosyte/transform`: the Bundle goes to stdout, and each
 * conversion issue goes to stderr as a code and a location, never a value. The input is this
 * repository's synthetic `test/__fixtures__/adt-a01.hl7`.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/convert-to-fhir.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cosyte, fixture } from "./_cosyte.js";

const message = fixture("adt-a01.hl7");
const converted = cosyte(["convert", "--to", "fhir", message]);

const bundle = JSON.parse(converted.stdout) as {
  resourceType: string;
  type: string;
  entry: { resource: { resourceType: string } }[];
};
const types = bundle.entry.map((entry) => entry.resource.resourceType);
console.log(`convert: exit ${String(converted.status)}, ${bundle.resourceType} (${bundle.type})`);
console.log("entries:", types.join(", "));
console.log(converted.stderr.trimEnd());

assert.equal(converted.status, 0);
assert.equal(bundle.resourceType, "Bundle");
assert.equal(bundle.type, "message");
assert.deepEqual(types, ["MessageHeader", "Patient", "Encounter"]);
// The issues on stderr carry codes and locations, and none of the message's patient values.
const pid =
  readFileSync(message, "utf8")
    .split("\r")
    .find((line) => line.startsWith("PID|")) ?? "";
const fields = pid.split("|");
for (const value of [fields[3], fields[5], fields[7]].map((f) => f?.split("^")[0])) {
  assert.ok(value !== undefined && value !== "" && !converted.stderr.includes(value));
}
assert.match(converted.stderr, /TRANSFORM_[A-Z_]+ at /);
console.log("convert-to-fhir: ok");
