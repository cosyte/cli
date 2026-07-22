---
id: guides-overview
title: Guides
sidebar_position: 1
---

# Guides

Task-oriented recipes for the `cosyte` command. Each is a short, copy-pasteable answer to one real
question.

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. The `cosyte` command ships seven commands
> over two wired parsers (HL7 v2 + FHIR) plus the `@cosyte/transform` and `@cosyte/terminology`
> higher-layer libraries: `parse` (autodetect → typed JSON), `validate` (verdict in the exit code),
> `inspect` (a value-free structural summary), `fmt` (canonical re-serialization), `convert` (HL7 v2 →
> FHIR R4 via `@cosyte/transform`), `map-codes` (ConceptMap `$translate` via `@cosyte/terminology`),
> and `redact`/`deid` (an honest gated stub, exit `69`, until `@cosyte/deid` ships). PHI discipline runs
> throughout — value-free by default, the opt-in `--unsafe-show-values`, never a PHI temp file. The MCP
> server and the remaining formats land in later phases — a command is only documented here once its
> behavior ships and its example passes the doc/code-agreement check.

## Parse from a pipeline and select a field

`parse` is pipeline-first. Use `--json` for compact output and pipe it to `jq`:

```bash
cat adt.hl7 | cosyte parse - --json | jq '.model.segments[0]'
```

## Branch on the outcome in CI

The exit code is the contract — no need to grep stdout:

```bash
if cosyte parse "$file" > /dev/null 2> err.log; then
  echo "parsed OK"
else
  code=$?   # 65 = unparseable/undetected, 66 = missing file, 2 = usage
  echo "parse failed with exit $code"; cat err.log   # err.log is value-free
fi
```

## Force a format when autodetection can't

A `.txt` that is really HL7, or an ambiguous input, takes an explicit `--format`:

```bash
cosyte parse --format hl7 weird-extension.txt
```

## Debug a rejected message (and mind the PHI)

A `CLI_PARSE_FAILED` line is value-free by default — a code and position, never the bytes. When you
are working locally and need to see what the parser choked on, add the loud, opt-in
`--unsafe-show-values` (it is **PHI-exposing** — never on stderr you will share):

```bash
cosyte parse broken.hl7 --format hl7                       # value-free diagnostic
cosyte parse broken.hl7 --format hl7 --unsafe-show-values  # appends a bounded input excerpt
```

## Convert an HL7 v2 feed to FHIR in a pipeline

`convert` wraps `@cosyte/transform` — the FHIR `Bundle` is on stdout, the value-free conversion issues
on stderr, and an error-severity issue sets a non-zero exit:

```bash
cat adt.hl7 | cosyte convert - --to fhir | jq '.entry[].resource.resourceType'
```

## Translate a code through a bring-your-own ConceptMap

`map-codes` wraps `@cosyte/terminology`. A code and a ConceptMap are reference data (not PHI), so the
target coding lands on stdout; an unmapped code is a value-free signal and a non-zero exit:

```bash
cosyte map-codes gender.conceptmap.json \
  --system http://hl7.org/fhir/administrative-gender --code male --json
```

## Use the programmatic core

The same autodetection and exit-code contract are importable — useful when embedding the routing logic:

```ts runnable
import { detectFormat, EXIT } from "@cosyte/cli";

const enc = new TextEncoder();
const detected = detectFormat(enc.encode('{"resourceType":"Bundle"}'));
detected.format; // => "fhir"
detected.confidence; // => "certain"
EXIT.USAGE; // => 2
```

Until more commands ship, the [Quickstart](./quickstart) covers the one-line parse and the **API
Reference** documents every export.
