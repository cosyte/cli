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
# Phase 1 wires only the two deepest parsers — @cosyte/hl7 and @cosyte/fhir — because the umbrella
# verify-policy caps @cosyte/cli runtime deps at 2. The other six parsers + transform + terminology
# are added, lazy-loaded, in later phases as the cap is deliberately raised per format.
#
# This is READ-ONLY on the sibling repos: it builds + packs them in place and copies the tarball
# here; it never commits, mutates source, or touches their git state.
#
# Usage (run from the cli repo root, with ../hl7 and ../fhir checked out):
#   pnpm vendor:refresh
#
# Pinned sibling commits (record every bump here AND in the CHANGELOG):
#   @cosyte/hl7  → 46d50eb775dc6576cec8ca5a2315720a65cb7418  (v0.0.1)
#   @cosyte/fhir → 7a099b24e399b91d780be8110c529bc570756cfe  (v0.0.0)
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

refresh "@cosyte/hl7"  hl7  cosyte-hl7-0.0.0.tgz
refresh "@cosyte/fhir" fhir cosyte-fhir-0.0.0.tgz

echo "vendor-refresh: done. Now run: pnpm install && pnpm test && pnpm build"
