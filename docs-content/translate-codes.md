---
id: translate-codes
title: Translate a code through a ConceptMap
sidebar_label: Translate a code
description: "Translate one code through a FHIR ConceptMap you supply with cosyte map-codes, and branch on whether it mapped."
---

# Translate a code through a ConceptMap

`cosyte map-codes` loads a FHIR R4 `ConceptMap` you supply and translates one code through it, with
`@cosyte/terminology`. The package ships no terminology content: the map is yours, and an unmapped
code is reported as unmapped, never filled in. The examples use `gender.conceptmap.json`, a
synthetic map from FHIR administrative gender to the HL7 v2 table 0001 codes.

## Translate a code

Name the map, the code, and the code's system:

```bash
cosyte map-codes gender.conceptmap.json \
  --system http://hl7.org/fhir/administrative-gender --code female --json \
  | jq -c '.result.matches[].target'
```

```text
{"code":"F","system":"http://terminology.hl7.org/CodeSystem/v2-0001"}
```

Without `--json`, the same object is printed indented, and a count of matches goes to stderr.
`--system` names the code's system, which `@cosyte/terminology` uses to choose the map's groups.
`--version` and `--display` pass the source code's version and display text through to the
translation.

## Read the map from stdin

Pass `-` in place of the file name:

```bash
cat gender.conceptmap.json | cosyte map-codes - --code male --json | jq -r '.result.matches[0].target.code'
```

```text
M
```

## Branch on whether it mapped

The exit code is `0` when there is at least one match and `1` when there is none. An unmapped code
also prints `TERM_TRANSLATE_UNMAPPED` on stderr, unless you pass `--quiet`:

```bash
cosyte map-codes gender.conceptmap.json \
  --system http://hl7.org/fhir/administrative-gender --code other > /dev/null; echo "exit $?"
```

```text
cosyte: map-codes: TERM_TRANSLATE_UNMAPPED (fallback mode: none)
exit 1
```

The fallback mode is the map's own `group.unmapped.mode`, which `@cosyte/terminology` reports and
never applies; `none` means no such fallback applied to this code.

A code and a `ConceptMap` are reference data, not patient data, so the source code and its target
are printed on stdout.

## When the map does not load

A file that is not JSON, or JSON that is not a loadable `ConceptMap`, exits `65` with
`CLI_MAP_INVALID` and the loader's own code when it gave one:

```bash
echo '{"resourceType":"Patient"}' | cosyte map-codes - --code male; echo "exit $?"
```

```text
cosyte: CLI_MAP_INVALID: the supplied ConceptMap could not be loaded (TERM_CONCEPTMAP_MALFORMED)
exit 65
```

## Reference

- [`map-codes`](./reference-commands.md#map-codes) and its options.
- [`CLI_MAP_INVALID`](./diagnostic-codes.md#cli_map_invalid).
- [`mapCodesCommand`](./api/src.md#mapcodescommand) in the API reference.
- How translation works, and what the result's `relationship`, `equivalence`, and `provenance`
  mean, is documented with `@cosyte/terminology`, at
  [docs.cosyte.com/terminology](https://docs.cosyte.com/terminology).
