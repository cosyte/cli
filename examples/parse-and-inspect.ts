/**
 * Parse an HL7 v2 message to typed JSON, then print a value-free summary of it.
 *
 * `cosyte parse` detects the format from the content and prints the parsed model on stdout.
 * `cosyte inspect` prints only structure (type, version, segment counts), never a value from the
 * message, so it is safe to paste into a ticket. The input is this repository's synthetic
 * `test/__fixtures__/adt-a01.hl7`.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/parse-and-inspect.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cosyte, fixture } from "./_cosyte.js";

const message = fixture("adt-a01.hl7");

const parsed = cosyte(["parse", "--json", message]);
const envelope = JSON.parse(parsed.stdout) as {
  format: string;
  model: { segments: { name: string }[] };
};
const segments = envelope.model.segments.map((segment) => segment.name);
console.log(
  `parse: exit ${String(parsed.status)}, format ${envelope.format}, segments ${segments.join(" ")}`,
);

const summary = cosyte(["inspect", message]);
console.log(summary.stdout.trimEnd());

// The same message through a pipe, as in `cat adt-a01.hl7 | cosyte inspect -`.
const piped = cosyte(["inspect", "-"], readFileSync(message, "utf8"));

assert.equal(parsed.status, 0);
assert.equal(envelope.format, "hl7");
assert.deepEqual(segments, ["MSH", "EVN", "PID", "PV1"]);
assert.equal(summary.status, 0);
assert.match(summary.stdout, /message type: ADT\^A01/);
// The summary carries no value from the message: not the patient's name, record number or birth date.
const pid =
  readFileSync(message, "utf8")
    .split("\r")
    .find((line) => line.startsWith("PID|")) ?? "";
const fields = pid.split("|");
for (const value of [fields[3], fields[5], fields[7]].map((f) => f?.split("^")[0])) {
  assert.ok(value !== undefined && value !== "" && !summary.stdout.includes(value));
}
assert.equal(piped.status, 0);
assert.equal(piped.stdout, summary.stdout);
console.log("parse-and-inspect: ok");
