#!/usr/bin/env bash
#
# vendor-refresh.sh — regenerate the vendored @cosyte sibling tarballs @cosyte/cli depends on.
#
# @cosyte/cli is a `bin` package (the `cosyte` command), not a library. An `npx`-invoked bin CANNOT
# rely on the user having pre-installed anything, so — unlike @cosyte/mllp (peer + optional on
# @cosyte/hl7) and @cosyte/transform (peer + optional on hl7/fhir) — the parsers it wraps are HARD
# RUNTIME `dependencies`. Until PUB-FLIP nothing under @cosyte/* is on npm and the repos are private,
# so we consume them as vendored `pnpm pack` tarballs pinned to a known-good sibling commit, wired as
# `file:` runtime dependencies (umbrella ADR 0008; this repo's documentation/decisions/0021). At
# PUB-FLIP these `file:vendor/*.tgz` specifiers become real semver npm installs.
#
# Phase 1 wired the two deepest parsers — @cosyte/hl7 and @cosyte/fhir. Phase 4 (CLI-4) adds the two
# higher-layer libraries the consumer-of-consumers commands wrap: @cosyte/transform (convert: HL7 v2 →
# FHIR) and @cosyte/terminology (map-codes: ConceptMap $translate). The umbrella verify-policy cap on
# @cosyte/cli runtime deps was raised 2 → 4 to accommodate them (documentation/decisions/0023). Every
# sibling is still lazy-loaded per command so `cosyte parse` never loads transform/terminology.
#
# Phase 6 (CLI-6) wires the remaining six parsers — dicom / x12 / ccda / ncpdp / astm / mllp. These are
# breadth reach the CLI core does not need to function, so — unlike the four HARD deps above — they are
# declared in `optionalDependencies` (documentation/decisions/0025): installed by default, lazy-loaded
# per format, outside the hard-runtime-dep closure. The umbrella cap therefore STAYS 4 (no raise). Each
# is vendored here the same way, as a `pnpm pack` tarball pinned to a known-good sibling commit.
#
# This is READ-ONLY on the sibling repos: it builds + packs them in place and copies the tarball
# here; it never commits, mutates source, or touches their git state.
#
# Usage (run from the cli repo root, with ../hl7 ../fhir ../transform ../terminology checked out):
#   pnpm vendor:refresh
#
# Pinned sibling commits (record every bump here AND in the CHANGELOG):
#   HARD dependencies (cap = 4):
#   @cosyte/hl7         → 46d50eb775dc6576cec8ca5a2315720a65cb7418  (v0.0.1)
#   @cosyte/fhir        → 7a099b24e399b91d780be8110c529bc570756cfe  (v0.0.0)
#   @cosyte/transform   → e6c453157f83a8484e8f8254b1bdbc4ac3223571  (v0.0.0)
#   @cosyte/terminology → e5ed3682787a185bf213c034ea2009d020e2d916  (v0.0.1)
#   OPTIONAL breadth parsers (CLI-6, ADR 0025 — outside the cap):
#   @cosyte/dicom       → d1ed5902a3b6504becb6a2e9810be345fb2c8628  (v0.0.1)
#   @cosyte/x12         → 0c6060630c2df929b541caec030dffa4ee13098a  (v0.0.1)
#   @cosyte/ccda        → 3753216a924a8744b94da253cd8fa170d202a617  (v0.0.1)
#   @cosyte/ncpdp       → 184eecce64d40c31851b5de644739dd0a0e42e15  (v0.0.1)
#   @cosyte/astm        → 92ac210dda4381f0aaca4d58a452f75b70d32517  (v0.0.1)
#   @cosyte/mllp        → aecff75f987b274a3ef49a1dc332599c8a880304  (v0.0.1)
#
# After a refresh: `pnpm install`, then `pnpm test` + `pnpm build` to confirm the new sibling surface
# still satisfies the CLI. Bumping a pin is a deliberate act — a sibling API change can break the
# `parse` wrappers; re-run verify + the gate-refuter.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vendor="${here}/vendor"
mkdir -p "${vendor}"

refresh() {
  local name="$1" repo="$2" out="$3"
  local repo_dir="${here}/../${repo}"
  if [[ ! -d "${repo_dir}" ]]; then
    echo "vendor-refresh: sibling repo not found: ${repo_dir}" >&2
    echo "  clone the ${name} repo next to cli/ and retry." >&2
    exit 1
  fi
  echo "vendor-refresh: building + packing ${name} from ${repo_dir}"
  pnpm -C "${repo_dir}" build
  pnpm -C "${repo_dir}" pack --out "${vendor}/${out}"
  echo "vendor-refresh: wrote ${vendor}/${out}"
}

# Hard dependencies (cap = 4).
refresh "@cosyte/hl7"         hl7         cosyte-hl7-0.0.0.tgz
refresh "@cosyte/fhir"        fhir        cosyte-fhir-0.0.0.tgz
refresh "@cosyte/transform"   transform   cosyte-transform-0.0.0.tgz
refresh "@cosyte/terminology" terminology cosyte-terminology-0.0.1.tgz

# Optional breadth parsers (CLI-6, ADR 0025 — outside the cap, lazy-loaded per format).
refresh "@cosyte/dicom"       dicom       cosyte-dicom-0.0.1.tgz
refresh "@cosyte/x12"         x12         cosyte-x12-0.0.1.tgz
refresh "@cosyte/ccda"        ccda        cosyte-ccda-0.0.1.tgz
refresh "@cosyte/ncpdp"       ncpdp       cosyte-ncpdp-0.0.1.tgz
refresh "@cosyte/astm"        astm        cosyte-astm-0.0.1.tgz
refresh "@cosyte/mllp"        mllp        cosyte-mllp-0.0.1.tgz

echo "vendor-refresh: done. Now run: pnpm install && pnpm test && pnpm build"
