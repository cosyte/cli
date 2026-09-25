# The higher-layer commands: `cosyte convert` and `cosyte map-codes`

These are the two commands that reach past the per-format parsers into `@cosyte/transform` and
`@cosyte/terminology`. The `README.md` front page is held to a byte budget, so both sections live here
in full under their own headings and the front page links to each of them.

## `cosyte convert`

Convert an **HL7 v2** message to **FHIR R4** via [`@cosyte/transform`](https://github.com/cosyte/transform).
The converted FHIR message `Bundle` is your explicit request, so it goes to **stdout**; the
conversion's value-free issues (a v2 index → FHIRPath locator + a stable code, never a field value) go
to stderr:

```bash
cosyte convert adt.hl7 --to fhir            # → a FHIR message Bundle on stdout
cat oru.hl7 | cosyte convert - --to fhir | jq '.entry[].resource.resourceType'
cosyte convert adt.hl7 --to fhir --json     # { format, bundle, findings } on stdout
cosyte convert adt.hl7 --to fhir --quiet    # bundle only; the exit code carries the outcome
```

`--to fhir` is required (the only target today). The CLI adds no mapping of its own. The FHIR is
`@cosyte/transform`'s, faithfully surfaced. The load-bearing rule mirrors `validate`: an
**error-severity** conversion issue exits **`1`**, never `0`. A non-HL7 input (e.g. a FHIR document) is
a data error (`65`), never a fake conversion.

## `cosyte map-codes`

Translate a single code through a **bring-your-own FHIR ConceptMap** via
[`@cosyte/terminology`](https://github.com/cosyte/terminology) (`$translate`). A ConceptMap and a code
are reference data, not PHI, so the translation result is your explicit request on **stdout**:

```bash
cosyte map-codes gender.conceptmap.json \
  --system http://hl7.org/fhir/administrative-gender --code male   # → the target coding(s), exit 0
cat cm.json | cosyte map-codes - --code female --json              # compact { source, result }
```

The CLI ships no terminology content and never fabricates a target: a **match** is exit `0`; an
**unmapped** code is the value-free `TERM_TRANSLATE_UNMAPPED` signal + exit `1`; a map that is not
valid JSON or not a loadable ConceptMap is a `CLI_MAP_INVALID` data error (`65`).
