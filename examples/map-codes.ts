/**
 * Translate a code through a FHIR ConceptMap you supply, and branch on whether it mapped.
 *
 * `cosyte map-codes` ships no terminology content: it applies the map you give it. A match prints
 * the target coding and exits `0`; a code the map does not cover prints the value-free
 * `TERM_TRANSLATE_UNMAPPED` signal and exits `1`. The map is this repository's synthetic
 * `test/__fixtures__/gender.conceptmap.json`.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/map-codes.ts
 */

import assert from "node:assert/strict";

import { cosyte, fixture } from "./_cosyte.js";

const map = fixture("gender.conceptmap.json");
const system = "http://hl7.org/fhir/administrative-gender";

interface Translation {
  result: { unmapped: boolean; code?: string; matches?: { target: { code: string } }[] };
}

const male = cosyte(["map-codes", map, "--system", system, "--code", "male", "--json"]);
const maleResult = (JSON.parse(male.stdout) as Translation).result;
console.log(
  `male: exit ${String(male.status)}, target ${maleResult.matches?.[0]?.target.code ?? "none"}`,
);

const other = cosyte(["map-codes", map, "--system", system, "--code", "other", "--json"]);
const otherResult = (JSON.parse(other.stdout) as Translation).result;
console.log(`other: exit ${String(other.status)}, ${otherResult.code ?? "mapped"}`);

assert.equal(male.status, 0);
assert.equal(maleResult.unmapped, false);
assert.equal(maleResult.matches?.[0]?.target.code, "M");
assert.equal(other.status, 1);
assert.equal(otherResult.unmapped, true);
assert.equal(otherResult.code, "TERM_TRANSLATE_UNMAPPED");
console.log("map-codes: ok");
