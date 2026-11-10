# src

Public programmatic entry point for `@cosyte/cli` (the `.` subpath export).

`@cosyte/cli` is a **`bin` package**: its primary artifact is the `cosyte` command on your `PATH`
(`npx --package @cosyte/cli cosyte parse …`), not an import surface. This module is the small,
honest **programmatic API** over the same `core` the CLI uses: the format autodetector, the
exit-code contract, the value-free diagnostic types, and the dispatcher, so another adapter (such
as the MCP server) can drive the same logic without shelling out.

The CLI is a **thin, PHI-safe skin** over the wrapped `@cosyte/*` parsers: it routes, reads, shapes
output, and owns the exit-code + value-free-diagnostic disciplines; it re-implements no wire-format
parsing.

## Classes

### CliError

A typed, PHI-safe CLI error. Its `message` is **value-free by
construction**: callers must build it from codes, indices, offsets, format names, and file paths,
never from an input value. It carries the [ExitCode](#exitcode) the invocation resolves to.

#### Example

```ts
import { CliError, CLI_CODES, EXIT } from "@cosyte/cli";

throw new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read the named file");
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new CliError**(`code`, `exit`, `message`): [`CliError`](#clierror)

###### Parameters

###### code

[`CliCode`](#clicode)

A stable [CliCode](#clicode).

###### exit

[`ExitCode`](#exitcode)

The [ExitCode](#exitcode) to resolve to.

###### message

`string`

A **value-free** explanation (positional/structural context only, never PHI).

###### Returns

[`CliError`](#clierror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`CliCode`](#clicode)

The stable diagnostic code.

##### exit

> `readonly` **exit**: [`ExitCode`](#exitcode)

The exit code this error resolves the invocation to.

## Interfaces

### DeidAvailability

Whether de-identification is available, and (while it is not) the value-free reason why. The one
function that answers "is the ground layer here?", consulted **before any input is read** so a
`redact` invocation never touches PHI it cannot strip.

#### Properties

##### available

> `readonly` **available**: `boolean`

`true` when `@cosyte/deid` resolves in this install.

##### reason

> `readonly` **reason**: `string`

A value-free explanation: the delegate's own label and version, or why it is unavailable.

***

### DeidDelegate

The delegate, reduced to what the command needs: its own published honesty label and version, and
one call that de-identifies an input. Deliberately CLI-owned shapes, so the delegate's types never
reach this package's published surface.

#### Properties

##### label

> `readonly` **label**: `string`

The delegate's own output label, quoted verbatim; the CLI asserts no standard of its own.

##### redact

> `readonly` **redact**: (`format`, `bytes`) => `Promise`\<[`RedactOutcome`](#redactoutcome)\>

De-identify one input under the delegate's default policy.

###### Parameters

###### format

[`DeidCoveredFormat`](#deidcoveredformat)

A covered format.

###### bytes

`Uint8Array`

The input bytes.

###### Returns

`Promise`\<[`RedactOutcome`](#redactoutcome)\>

The serialized de-identified document and the value-free manifest.

##### version

> `readonly` **version**: `string`

The delegate's own version string.

***

### DeidManifestRecord

One entry of the delegate's value-free manifest, narrowed to the fields the CLI renders. The
`locus` is a **path, never a value**, by the delegate's own contract; nothing here carries an input
value, which is what lets the manifest go on the diagnostic channel at all.

#### Properties

##### category

> `readonly` **category**: `string`

The identifier category acted on.

##### code

> `readonly` **code**: `string`

The delegate's stable disposition code.

##### count

> `readonly` **count**: `number`

How many values at this locus were acted on.

##### disposition

> `readonly` **disposition**: `string`

What happened: `transformed`, `removed`, or the fail-closed `blocked`.

##### locus

> `readonly` **locus**: `string`

The structural path acted on: never a value.

##### transform

> `readonly` **transform**: `string`

The transform applied.

***

### DetectResult

How confident autodetection is:
- `certain`: exactly one signature matched (`format` names it);
- `ambiguous`: more than one matched (`format` is `null`; `candidates` names them);
- `none`: nothing matched (`format` is `null`; `candidates` is empty).

`format` is `null` unless `confidence` is `certain`, so a non-certain result can never be mistaken
for a routable format.

#### Properties

##### candidates

> `readonly` **candidates**: readonly [`CosyteFormat`](#cosyteformat)[]

The matching candidate formats (0 for `none`, 1 for `certain`, ≥2 for `ambiguous`). Value-free.

##### confidence

> `readonly` **confidence**: `"certain"` \| `"ambiguous"` \| `"none"`

The detection confidence.

##### format

> `readonly` **format**: [`CosyteFormat`](#cosyteformat) \| `null`

The detected format, or `null` when `confidence` is not `certain`.

***

### Finding

A single value-free finding: a stable code, a severity, and a positional locator. Every field is
safe to print, log, or serialize. None carries a name, DOB, MRN, or field value.

#### Properties

##### code

> `readonly` **code**: `string`

The stable diagnostic/warning code (the wrapped library's or the CLI's).

##### location

> `readonly` **location**: `string`

A value-free positional locator: a FHIRPath expression, or an HL7 segment/field index path.

##### severity

> `readonly` **severity**: `string`

The R4-style severity (`fatal` | `error` | `warning` | `information`), or `warning` for HL7.

***

### FmtResult

The result of a canonical re-serialization (`fmt`): the spec-clean text + a value-free warning count.

#### Properties

##### output

> `readonly` **output**: `string`

The wrapped serializer's output text.

##### warningCount

> `readonly` **warningCount**: `number`

How many parse warnings the round-trip surfaced (value-free count only).

***

### ParseResult

The result of wrapping a parser's `parse`: the library's parsed model + its value-free warnings.

#### Properties

##### model

> `readonly` **model**: `unknown`

The wrapped library's parsed model: emitted verbatim as JSON on the data channel.

##### warnings

> `readonly` **warnings**: readonly [`ParseWarning`](#parsewarning)[]

The parser's value-free warnings (code + position).

***

### PhiPosture

The resolved PHI display posture for one invocation. `showValues` is `true` **only** when the user
passed `--unsafe-show-values`; every value-echoing decision reads this one flag.

#### Properties

##### showValues

> `readonly` **showValues**: `boolean`

`true` iff `--unsafe-show-values` was given: a value may appear on a secondary surface.

***

### RedactOutcome

A completed de-identification pass: the serialized document plus the delegate's manifest.

#### Properties

##### manifest

> `readonly` **manifest**: readonly [`DeidManifestRecord`](#deidmanifestrecord)[]

The delegate's value-free manifest, in locus order.

##### output

> `readonly` **output**: `string`

The de-identified document, serialized exactly as this format's wrapped serializer emits it.

***

### ResolvedInput

A successfully-resolved input: the format (guaranteed to support the requested op) and the bytes.

#### Properties

##### bytes

> `readonly` **bytes**: `Uint8Array`

The input bytes (a whole file or a drained stdin buffer); guaranteed non-empty.

##### format

> `readonly` **format**: [`CosyteFormat`](#cosyteformat)

The resolved format: guaranteed to satisfy `supportsOp(format, op)` for the requested op.

***

### ResolvedInputStream

A successfully-resolved **streaming** input: the format, plus the input as a stream of chunks with
the leading bytes detection consumed put back in front, so the consumer still sees the whole input
in order.

#### Properties

##### chunks

> `readonly` **chunks**: [`ByteChunks`](#bytechunks)

The whole input as chunks, size-limited: reading past the limit raises `CLI_INPUT_TOO_LARGE`.

##### format

> `readonly` **format**: [`CosyteFormat`](#cosyteformat)

The resolved format: guaranteed to satisfy `supportsOp(format, op)` for the requested op.

***

### RunDeps

The injectable I/O side-effects the dispatcher needs. Kept tiny and pure-ish so tests drive the
CLI end to end with in-memory fakes and no real filesystem, stdin or stdout.

The two whole-input readers are required; the chunk readers and the output sink are **optional**,
and a caller that omits them still gets identical output. They are the difference between reading
a stream as it arrives and being handed one buffer: with them, a multi-record `parse` emits each
record as it is produced and refuses an over-limit input while it is still arriving; without them,
the same code path runs over a single chunk and returns its output on the result's `stdout` as
before.

#### Properties

##### openFile?

> `readonly` `optional` **openFile?**: (`path`) => `AsyncIterable`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Optional: open a file as a stream of byte chunks (see [fileChunks](#filechunks)).

###### Parameters

###### path

`string`

###### Returns

`AsyncIterable`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### openStdin?

> `readonly` `optional` **openStdin?**: () => `AsyncIterable`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Optional: open stdin as a stream of byte chunks (see [streamChunks](#streamchunks)).

###### Returns

`AsyncIterable`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### readFile

> `readonly` **readFile**: (`path`) => `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Read a file's bytes, or raise a `CLI_NO_INPUT` [CliError](#clierror) if it cannot be read.

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### readStdin

> `readonly` **readStdin**: () => `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Read all of stdin's bytes.

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### writeStdout?

> `readonly` `optional` **writeStdout?**: (`chunk`) => `void`

Optional: write one piece of the data channel **as it is produced**. When present, a multi-record
`parse` writes each record's NDJSON line through here instead of accumulating them, and the
returned result's `stdout` is empty because the output has already been delivered. May throw (a
consumer that closed the pipe); the caller turns that into a value-free
`CLI_OUTPUT_WRITE_FAILED`.

###### Parameters

###### chunk

`string`

###### Returns

`void`

***

### RunResult

A fully-resolved CLI invocation.

#### Example

```ts
import { EXIT, type RunResult } from "@cosyte/cli";

const r: RunResult = { stdout: "{}\n", stderr: "", exit: EXIT.OK };
r.exit; // => 0
```

#### Properties

##### exit

> `readonly` **exit**: [`ExitCode`](#exitcode)

The exit code the invocation resolves to.

##### stderr

> `readonly` **stderr**: `string`

The diagnostic channel is **value-free**: codes, positions, file paths, format names only.

##### stdout

> `readonly` **stdout**: `string`

The data channel: the parsed model or requested output. May contain the user's data by design.

***

### Verdict

The verdict of running a format's validation surface: value-free findings + the validity boolean.

#### Properties

##### findings

> `readonly` **findings**: readonly [`Finding`](#finding)[]

The value-free findings (code + severity + positional locator).

##### valid

> `readonly` **valid**: `boolean`

`true` iff the input is valid (no error/fatal-severity finding).

## Type Aliases

### ByteChunks

> **ByteChunks** = `AsyncIterable`\<`Uint8Array`\>

A stream of input byte chunks, in arrival order: what every function here consumes.

***

### CliCode

> **CliCode** = *typeof* [`CLI_CODES`](#cli_codes)\[keyof *typeof* [`CLI_CODES`](#cli_codes)\]

A value from [CLI\_CODES](#cli_codes): the stable code carried by a [CliError](#clierror).

***

### CosyteFormat

> **CosyteFormat** = `"hl7"` \| `"fhir"` \| `"dicom"` \| `"x12"` \| `"ccda"` \| `"ncpdp"` \| `"astm"` \| `"mllp"`

The set of formats the `cosyte` command names.

***

### DeidCoverage

> **DeidCoverage** = `"covered"` \| `"no-adapter"` \| `"unserializable"`

What the delegate can do for one format, from this CLI's point of view:

- `covered`: an adapter for the standard this CLI resolves, serializable onto the text channel.
- `no-adapter`: the delegate does not de-identify this format (`CLI_NOT_IMPLEMENTED`, exit `69`).
- `unserializable`: the delegate covers it, but the result cannot ride a text stdout
  (`CLI_FORMAT_UNSUPPORTED`, exit `65`: the CLI's own limit, not the delegate's).

***

### DeidCoveredFormat

> **DeidCoveredFormat** = `"hl7"` \| `"fhir"` \| `"x12"` \| `"ccda"`

A format the delegate de-identifies and the CLI can serialize.

***

### ExitCode

> **ExitCode** = *typeof* [`EXIT`](#exit-2)\[keyof *typeof* [`EXIT`](#exit-2)\]

A value from [EXIT](#exit-2): the exit code a CLI invocation resolves to.

***

### InputResolution

> **InputResolution** = \{ `input`: [`ResolvedInput`](#resolvedinput); `ok`: `true`; \} \| \{ `ok`: `false`; `result`: [`RunResult`](#runresult); \}

The outcome of [resolveInput](#resolveinput): either the resolved input, or a ready-to-return value-free
[RunResult](#runresult) carrying the diagnostic + exit code for whatever went wrong. A discriminated union
so a command reads `if (!r.ok) return r.result;` and then works with `r.input`.

***

### InputStreamResolution

> **InputStreamResolution** = \{ `input`: [`ResolvedInputStream`](#resolvedinputstream); `ok`: `true`; \} \| \{ `ok`: `false`; `result`: [`RunResult`](#runresult); \}

The outcome of [resolveInputStream](#resolveinputstream): the resolved streaming input, or a ready-to-return
value-free [RunResult](#runresult). The same discriminated-union shape as [InputResolution](#inputresolution).

***

### InspectSummary

> **InspectSummary** = `Hl7Summary` \| `FhirSummary` \| `X12Summary` \| `AstmSummary` \| `CcdaSummary` \| `DicomSummary` \| `NcpdpSummary` \| `MllpSummary`

The discriminated value-free structural summary `inspect` renders.

***

### Op

> **Op** = `"parse"` \| `"inspect"` \| `"fmt"` \| `"validate"`

The four wrapping operations a command can ask a format's adapter to perform.

***

### ParseWarning

> **ParseWarning** = `object` & `Readonly`\<`Record`\<`string`, `unknown`\>\>

A value-free parse warning: a stable code plus the parser's positional (index-only) context.

#### Type Declaration

##### code

> `readonly` **code**: `string`

## Variables

### CLI\_CODES

> `const` **CLI\_CODES**: `object`

Stable **CLI diagnostic code** registry: errors the CLI owns (routing, I/O, argument handling),
distinct from the wrapped library's own warning/issue codes which are passed through unchanged.
Each code is its own value (`key === value`) so the set survives `Object.values(...)`; renaming or
removing one is a **breaking change** because scripts branch on the stderr text.

#### Type Declaration

##### CLI\_DEID\_INCOMPLETE

> `readonly` **CLI\_DEID\_INCOMPLETE**: `"CLI_DEID_INCOMPLETE"` = `"CLI_DEID_INCOMPLETE"`

The delegated de-identifier reported that it could not handle every element of the input (a
fail-closed `blocked` locus, or its own fatal). The run is **not** a de-identified copy, so no
output is emitted: an operation-level failure, never a bug. Names loci and codes, never a
value. Exit `1`.

##### CLI\_EMPTY\_INPUT

> `readonly` **CLI\_EMPTY\_INPUT**: `"CLI_EMPTY_INPUT"` = `"CLI_EMPTY_INPUT"`

The input was empty, no bytes to detect or parse. Exit `65`.

##### CLI\_FORMAT\_AMBIGUOUS

> `readonly` **CLI\_FORMAT\_AMBIGUOUS**: `"CLI_FORMAT_AMBIGUOUS"` = `"CLI_FORMAT_AMBIGUOUS"`

More than one format signature matched; the CLI will not guess. Names the candidates, never the bytes. Exit `65`.

##### CLI\_FORMAT\_UNDETECTED

> `readonly` **CLI\_FORMAT\_UNDETECTED**: `"CLI_FORMAT_UNDETECTED"` = `"CLI_FORMAT_UNDETECTED"`

No format signature matched; the CLI will not guess. Names the candidates, never the bytes. Exit `65`.

##### CLI\_FORMAT\_UNSUPPORTED

> `readonly` **CLI\_FORMAT\_UNSUPPORTED**: `"CLI_FORMAT_UNSUPPORTED"` = `"CLI_FORMAT_UNSUPPORTED"`

A recognised format whose parser does not support the requested operation (e.g. `parse` on a
format wired only for `inspect`). Names the format + operation, never the bytes. Exit `65`.

##### CLI\_INPUT\_TOO\_LARGE

> `readonly` **CLI\_INPUT\_TOO\_LARGE**: `"CLI_INPUT_TOO_LARGE"` = `"CLI_INPUT_TOO_LARGE"`

The input is larger than the documented size limit the CLI reads in one invocation. Raised
against the running byte count while the input is read, so the refusal always arrives before an
allocation ceiling could. Names the limit, never the input. Exit `65`, never `70`.

##### CLI\_INTERNAL

> `readonly` **CLI\_INTERNAL**: `"CLI_INTERNAL"` = `"CLI_INTERNAL"`

An unexpected internal error (a bug). Exit `70`.

##### CLI\_MAP\_INVALID

> `readonly` **CLI\_MAP\_INVALID**: `"CLI_MAP_INVALID"` = `"CLI_MAP_INVALID"`

The BYO ConceptMap supplied to `map-codes` is not valid JSON or not a loadable FHIR ConceptMap.
Names the stable terminology-loader code, never the map's bytes. Exit `65`.

##### CLI\_NO\_INPUT

> `readonly` **CLI\_NO\_INPUT**: `"CLI_NO_INPUT"` = `"CLI_NO_INPUT"`

The named file does not exist or could not be read. Exit `66`.

##### CLI\_NOT\_IMPLEMENTED

> `readonly` **CLI\_NOT\_IMPLEMENTED**: `"CLI_NOT_IMPLEMENTED"` = `"CLI_NOT_IMPLEMENTED"`

A command whose ground-layer library does not cover the resolved format (e.g. `redact` on a
format `@cosyte/deid` ships no adapter for). Never a fake success: a distinct, value-free
"unavailable" signal. Exit `69`.

##### CLI\_OUTPUT\_WRITE\_FAILED

> `readonly` **CLI\_OUTPUT\_WRITE\_FAILED**: `"CLI_OUTPUT_WRITE_FAILED"` = `"CLI_OUTPUT_WRITE_FAILED"`

The output stream could not be written: a consumer that closes the pipe ends the invocation
here rather than as an unhandled platform error, whether it went away part way through a record
stream or before a single-result write was delivered. Names no input, and never the platform's
own error text. Exit `74`.

##### CLI\_PARSE\_FAILED

> `readonly` **CLI\_PARSE\_FAILED**: `"CLI_PARSE_FAILED"` = `"CLI_PARSE_FAILED"`

The wrapped parser rejected the input. Positional context only, never the offending bytes. Exit `65`.

##### CLI\_PARSER\_UNAVAILABLE

> `readonly` **CLI\_PARSER\_UNAVAILABLE**: `"CLI_PARSER_UNAVAILABLE"` = `"CLI_PARSER_UNAVAILABLE"`

An optional package a command needs is not installed: the parser for a recognised format, the
conversion library, the de-identifier, or the MCP server's SDK. All are `optionalDependencies`:
normally installed, but an install with `--omit=optional` (or a removed copy) lacks them, and the
CLI degrades to this value-free signal naming the package rather than crashing. Exit `69`.

##### CLI\_USAGE

> `readonly` **CLI\_USAGE**: `"CLI_USAGE"` = `"CLI_USAGE"`

A required argument was missing or a flag was invalid. Exit `2`.

#### Example

```ts
import { CLI_CODES } from "@cosyte/cli";

if (diagnostic.code === CLI_CODES.CLI_FORMAT_UNDETECTED) {
  // ask the user for --format
}
```

***

### DEID\_BLOCKED

> `const` **DEID\_BLOCKED**: `"blocked"` = `"blocked"`

The fail-closed disposition: the delegate reports it could not handle the element.

***

### DEID\_COVERAGE

> `const` **DEID\_COVERAGE**: `Readonly`\<`Record`\<[`CosyteFormat`](#cosyteformat), [`DeidCoverage`](#deidcoverage)\>\>

The honest per-format de-identification matrix, the `redact` analogue of the parser registry's
operation matrix. Every one of the eight formats has an entry, so a new format cannot be added
without answering for it here.

#### Example

```ts
import { DEID_COVERAGE } from "@cosyte/cli";

DEID_COVERAGE.hl7; // => "covered"
DEID_COVERAGE.dicom; // => "unserializable"
```

***

### DEID\_PACKAGE

> `const` **DEID\_PACKAGE**: `"@cosyte/deid"` = `"@cosyte/deid"`

The npm package the whole de-identification capability is delegated to.

***

### DEID\_UNAVAILABLE\_REASON

> `const` **DEID\_UNAVAILABLE\_REASON**: `string`

The value-free reason `redact`/`deid` reports when the de-identification library is absent from the
install. It is an `optionalDependency`, so a copy without it degrades rather than crashing.

***

### DETECT\_PREFIX\_BYTES

> `const` **DETECT\_PREFIX\_BYTES**: `512` = `512`

How many leading bytes detection reads. Small: every signature lives in the first line (the
deepest is DICOM's magic at byte 128). Exported because a **streaming** caller has to know how much
of the input to hold back before it can detect the format, and reading a different amount than
detection uses would make the two disagree.

#### Example

```ts
import { DETECT_PREFIX_BYTES } from "@cosyte/cli";

DETECT_PREFIX_BYTES; // => 512
```

***

### DETECTABLE\_FORMATS

> `const` **DETECTABLE\_FORMATS**: readonly [`CosyteFormat`](#cosyteformat)[]

The formats content-autodetection can recognise (every format now carries a signature).

***

### EXIT

> `const` **EXIT**: `object`

The stable exit-code map. Adding a code is a documented, tested change to the CLI's contract;
renaming or repurposing one is a breaking change.

#### Type Declaration

##### DATAERR

> `readonly` **DATAERR**: `65` = `65`

Data error: input could not be parsed or its format could not be detected (`EX_DATAERR`).

##### INVALID

> `readonly` **INVALID**: `1` = `1`

Operation-level failure: `validate` found the input **invalid** (parseable but non-conformant),
or `redact` could not de-identify every locus: a real, expected CI signal that the tool worked
and the operation did not complete. Never emitted for unparseable input (that is `DATAERR`).

##### IOERR

> `readonly` **IOERR**: `74` = `74`

Output error: the stream the CLI was writing to closed before the output had been delivered, so
the consumer holds nothing or holds only part of the answer. The shape a downstream consumer
that exits early produces (a pager quit, a `head` that has seen enough). A handled condition the
consumer owns, never a defect in the CLI, so it is deliberately distinct from `SOFTWARE`
(`EX_IOERR`).

##### NOINPUT

> `readonly` **NOINPUT**: `66` = `66`

No input: the named file does not exist or is unreadable (`EX_NOINPUT`).

##### OK

> `readonly` **OK**: `0` = `0`

Success: the operation completed; `validate` found the input **valid**.

##### SOFTWARE

> `readonly` **SOFTWARE**: `70` = `70`

Internal error: an unexpected exception (a bug), distinct from a handled bad input (`EX_SOFTWARE`).

##### UNAVAILABLE

> `readonly` **UNAVAILABLE**: `69` = `69`

Unavailable: a required capability is not wired for this input (e.g. `redact` on a format
`@cosyte/deid` has no adapter for, or with that optional library absent), a distinct non-zero
signal that is never a fake success (`EX_UNAVAILABLE`).

##### USAGE

> `readonly` **USAGE**: `2` = `2`

Usage error: unknown command, bad flag, missing argument. A value specific to this CLI, not a
`sysexits.h` constant.

#### Example

```ts
import { EXIT } from "@cosyte/cli";

process.exitCode = EXIT.OK; // => 0
```

***

### KNOWN\_FORMATS

> `const` **KNOWN\_FORMATS**: readonly [`CosyteFormat`](#cosyteformat)[]

The full set of format names `--format` accepts as syntactically valid (a bad value is a usage error).

***

### MAX\_INPUT\_BYTES

> `const` **MAX\_INPUT\_BYTES**: `number`

The maximum number of input bytes `cosyte parse` reads in one invocation: **67108864 bytes
(64 MiB)**.

Chosen to sit far below the smaller of Node's two allocation ceilings
(`buffer.constants.MAX_STRING_LENGTH`, 536870888 characters), because the bytes read are not the
peak: a parsed model rendered as JSON is routinely several times the size of the input that
produced it, so the limit has to leave room for the output as well as the input. A power of two, so
the byte count and its mebibyte rendering are both exact.

#### Example

```ts
import { MAX_INPUT_BYTES } from "@cosyte/cli";

MAX_INPUT_BYTES; // => 67108864
```

***

### OP\_SUPPORT

> `const` **OP\_SUPPORT**: `Readonly`\<`Record`\<[`CosyteFormat`](#cosyteformat), `ReadonlySet`\<[`Op`](#op)\>\>\>

The honest per-format operation matrix. A (format, op) pair absent here is a value-free
`CLI_FORMAT_UNSUPPORTED`, never a faked result. The unsupported cells and why:
- **dicom** `parse`/`fmt`. The model is binary (no faithful JSON view; `serializeDicom` emits a
  Part-10 byte stream, not text). `inspect`/`validate` are supported.
- **ccda** `parse`: the canonical form is XML; there is no library-blessed JSON model, so `fmt`
  (XML re-serialize) is the faithful surface. `inspect`/`fmt`/`validate` are supported.
- **mllp** `fmt`/`validate`: MLLP is a transport container the CLI de-frames to HL7; `parse` yields
  the enclosed HL7 message(s) and `inspect` reports the frame count.

#### Example

```ts
import { OP_SUPPORT } from "@cosyte/cli";

OP_SUPPORT.dicom.has("parse"); // => false
OP_SUPPORT.hl7.has("validate"); // => true
```

***

### SHOW\_VALUES

> `const` **SHOW\_VALUES**: [`PhiPosture`](#phiposture)

The opted-in, PHI-exposing posture selected by `--unsafe-show-values`.

***

### UNSAFE\_EXCERPT\_MAX

> `const` **UNSAFE\_EXCERPT\_MAX**: `200` = `200`

The maximum number of leading input bytes an `--unsafe-show-values` diagnostic may echo. Bounded so
an unsafe excerpt stays a single, readable diagnostic line rather than dumping a whole message.

***

### UNSAFE\_SHOW\_VALUES\_FLAG

> `const` **UNSAFE\_SHOW\_VALUES\_FLAG**: `"--unsafe-show-values"` = `"--unsafe-show-values"`

The single global flag token that opts into showing values on secondary surfaces.

***

### VALUE\_FREE

> `const` **VALUE\_FREE**: [`PhiPosture`](#phiposture)

The default, safe posture: no value ever reaches a secondary surface.

***

### VERSION

> `const` **VERSION**: `string` = `"0.1.7"`

The `@cosyte/cli` version. On the uniform `v0.0.x-until-first-alpha` ladder.

Read by `cosyte --version` and by the MCP server's advertised `SERVER_INFO`, so it is a
user-visible surface on both front doors, not merely an export.

#### Example

```ts
import { VERSION } from "@cosyte/cli";

console.log(`cosyte ${VERSION}`);
```

## Functions

### asCosyteFormat()

> **asCosyteFormat**(`value`): [`CosyteFormat`](#cosyteformat) \| `null`

Narrow an arbitrary `--format` string to a [CosyteFormat](#cosyteformat), or `null` if it is not a known
format name (which the caller turns into a usage error, exit `2`).

#### Parameters

##### value

`string`

The raw `--format` argument.

#### Returns

[`CosyteFormat`](#cosyteformat) \| `null`

The narrowed format, or `null`.

#### Example

```ts
import { asCosyteFormat } from "@cosyte/cli";

asCosyteFormat("hl7"); // => "hl7"
asCosyteFormat("nope"); // => null
```

***

### classifyCandidates()

> **classifyCandidates**(`candidates`): [`DetectResult`](#detectresult)

Classify a list of matched candidate formats into a [DetectResult](#detectresult): exactly one → `certain`,
zero → `none`, two-or-more → `ambiguous` (all with `format` `null` unless certain). Split out and
exported so the **ambiguity** contract is directly testable. It is otherwise unreachable while
every signature is disjoint, and it must stay a *detected* ambiguity, never a mis-route.

#### Parameters

##### candidates

readonly [`CosyteFormat`](#cosyteformat)[]

The formats whose signatures matched the input.

#### Returns

[`DetectResult`](#detectresult)

The classified [DetectResult](#detectresult).

#### Example

```ts
import { classifyCandidates } from "@cosyte/cli";

classifyCandidates(["hl7"]).confidence; // => "certain"
classifyCandidates([]).confidence; // => "none"
classifyCandidates(["hl7", "fhir"]).confidence; // => "ambiguous"
```

***

### collectChunks()

> **collectChunks**(`chunks`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Drain a chunk stream into one buffer: the single-message path, where the parser needs the whole
message anyway. The size limit is already applied by [withinLimit](#withinlimit) upstream, so this cannot
accumulate more than the limit allows.

#### Parameters

##### chunks

[`ByteChunks`](#bytechunks)

The input chunk stream.

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The concatenated bytes.

#### Example

```ts
import { collectChunks, oneChunk } from "@cosyte/cli";

(await collectChunks(oneChunk(new TextEncoder().encode("MSH|")))).length; // => 4
```

***

### completionCommand()

> **completionCommand**(`args`): [`RunResult`](#runresult)

Run the `completion` command.

#### Parameters

##### args

`string`[]

The arguments after the `completion` subcommand token; the first is the shell name.

#### Returns

[`RunResult`](#runresult)

A [RunResult](#runresult): the completion script on `stdout` (exit `0`), or a value-free usage
  error (exit `2`) when the shell is missing or unrecognised.

#### Example

```ts
import { completionCommand } from "@cosyte/cli";

completionCommand(["bash"]).exit; // => 0
completionCommand(["powershell"]).exit; // => 2
```

***

### convertCommand()

> **convertCommand**(`args`, `deps`, `posture?`): `Promise`\<[`RunResult`](#runresult)\>

Run the `convert` command.

#### Parameters

##### args

`string`[]

The arguments after the `convert` subcommand token.

##### deps

[`RunDeps`](#rundeps)

Injected input readers ([RunDeps](#rundeps)).

##### posture?

[`PhiPosture`](#phiposture) = `VALUE_FREE`

The resolved [PhiPosture](#phiposture) (governs only the opt-in unsafe excerpt on an HL7
  parse-failure diagnostic; the converted bundle and the value-free findings are unaffected).

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

A [RunResult](#runresult): the converted FHIR `Bundle` on `stdout` (the data channel), value-free
  findings on `stderr` (or JSON under `--json`), and an exit code that carries the outcome: `0`
  clean · `1` an error-severity conversion issue · `65` the HL7 input could not be parsed or is not
  an HL7 v2 source · `66` no input · `2` usage.

#### Throws

Never [CliError](#clierror); may propagate a truly unexpected error for the dispatcher to map to
  `CLI_INTERNAL`.

#### Example

```ts
import { convertCommand } from "@cosyte/cli";

const deps = {
  readFile: async () => new TextEncoder().encode("MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r"),
  readStdin: async () => new Uint8Array(),
};
(await convertCommand(["adt.hl7", "--to", "fhir"], deps)).exit; // => 0
```

***

### convertOutcome()

> **convertOutcome**(`findings`): `object`

Decide the conversion outcome from the library's value-free findings: whether any is
**error-severity** (which drives a non-zero exit: the load-bearing "a conversion error is never
exit 0" rule) and the value-free human report. The severity classification is
the library's: `@cosyte/transform` fixes each issue's severity; the CLI only reads it. Exported so
the exit-verdict and report logic is unit-testable with synthetic findings, independent of which HL7
message happens to produce an error.

#### Parameters

##### findings

readonly [`Finding`](#finding)[]

The value-free [Finding](#finding)s the conversion produced.

#### Returns

`object`

`hasError` (true iff any finding is error/fatal severity) and the rendered value-free
  `report` (one line per finding + a summary line).

##### hasError

> `readonly` **hasError**: `boolean`

##### report

> `readonly` **report**: `string`

#### Example

```ts
import { convertOutcome } from "@cosyte/cli";

convertOutcome([{ code: "TRANSFORM_RESOURCE_INVALID", severity: "error", location: "PID" }])
  .hasError; // => true
convertOutcome([{ code: "TRANSFORM_ELEMENT_DROPPED", severity: "information", location: "PID.13" }])
  .hasError; // => false
```

***

### deframeMllp()

> **deframeMllp**(`bytes`): `Promise`\<\{ `payloads`: `Buffer`\<`ArrayBufferLike`\>[]; `warningCount`: `number`; \}\>

De-frame an MLLP byte stream into its enclosed HL7 payloads via `@cosyte/mllp`'s `FrameReader`. MLLP
is a transport container, not a document format: each frame's payload is an HL7 v2 message the CLI
then parses/inspects with the `hl7` adapter. Multi-frame streams are the CLI's multi-message surface.

#### Parameters

##### bytes

`Uint8Array`

The MLLP-framed input.

#### Returns

`Promise`\<\{ `payloads`: `Buffer`\<`ArrayBufferLike`\>[]; `warningCount`: `number`; \}\>

The de-framed HL7 payloads (in stream order) + a value-free framing-warning count.
**Truncation is a data error, never a silent drop.** The `FrameReader` is a streaming decoder: an
unterminated trailing frame (a VT opened with no closing FS/CR) is left buffered and delivered by
*no* callback, so feeding a whole file and reading only `onFrame` would silently lose the partial
message with a green exit. We therefore detect an open trailing frame at the byte level (the last
VT sits after the last FS: MLLP payloads are HL7 v2 text and never carry the `0x0B`/`0x1C` framing
bytes), or, once the reader has accepted every byte, a final frame whose FS is the last byte (the
reader is still waiting for its CR), and reject the whole stream as a value-free
`CLI_PARSE_FAILED` data error. A stray FS that closes no frame is the reader's framing error.

#### Throws

`CLI_PARSER_UNAVAILABLE` if `@cosyte/mllp` is absent; `CLI_PARSE_FAILED` (exit
  `65`) on a truncated stream; a hard framing error propagates for the caller's value-free boundary.

#### Example

```ts
import { deframeMllp } from "@cosyte/cli";

// a VT-framed "MSH|..." message → one payload
(await deframeMllp(new Uint8Array([0x0b, 0x4d, 0x53, 0x48, 0x1c, 0x0d]))).payloads.length; // => 1
```

***

### deidCoverage()

> **deidCoverage**(`format`): [`DeidCoverage`](#deidcoverage)

What the delegate can do for `format`.

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

The resolved format.

#### Returns

[`DeidCoverage`](#deidcoverage)

That format's [DeidCoverage](#deidcoverage).

#### Example

```ts
import { deidCoverage } from "@cosyte/cli";

deidCoverage("ncpdp"); // => "no-adapter"
```

***

### deidCoveredFormats()

> **deidCoveredFormats**(): readonly [`CosyteFormat`](#cosyteformat)[]

The formats `redact` produces output for, sorted: the single source the help text, the published
documentation and the tests all read, so the three cannot drift.

#### Returns

readonly [`CosyteFormat`](#cosyteformat)[]

The covered format names, sorted.

#### Example

```ts
import { deidCoveredFormats } from "@cosyte/cli";

deidCoveredFormats(); // => ["ccda", "fhir", "hl7", "x12"]
```

***

### deidStatus()

> **deidStatus**(`load?`): `Promise`\<[`DeidAvailability`](#deidavailability)\>

Report the current de-identification availability. This is the single documented flip point: it
resolves the delegated library rather than asserting anything about it.

#### Parameters

##### load?

() => `Promise`\<[`DeidDelegate`](#deiddelegate)\>

The delegate loader; injectable so a test can drive the unavailable branch.

#### Returns

`Promise`\<[`DeidAvailability`](#deidavailability)\>

`{ available: true }` with the delegate's own label and version, else `{ available: false }`
  with the value-free [DEID\_UNAVAILABLE\_REASON](#deid_unavailable_reason).

#### Example

```ts
import { deidStatus } from "@cosyte/cli";

(await deidStatus()).available; // => true when @cosyte/deid is installed
```

***

### describeByteLimit()

> **describeByteLimit**(`limit?`): `string`

Render a byte limit as a **concrete number with an explicit byte-based unit**: `"67108864 bytes
(64 MiB)"`. Every surface that states the limit (the refusal diagnostic, `cosyte --help`, the
command reference) renders it through here, so the number a user reads is always the number the
code enforces, and never a vague description of one.

#### Parameters

##### limit?

`number` = `MAX_INPUT_BYTES`

The limit in bytes. Defaults to [MAX\_INPUT\_BYTES](#max_input_bytes).

#### Returns

`string`

The limit as bytes, plus a mebibyte rendering when it is a whole number of mebibytes.

#### Example

```ts
import { describeByteLimit } from "@cosyte/cli";

describeByteLimit(67108864); // => "67108864 bytes (64 MiB)"
describeByteLimit(1000); // => "1000 bytes"
```

***

### detectFormat()

> **detectFormat**(`bytes`): [`DetectResult`](#detectresult)

Detect the healthcare format of `bytes` by content, conservatively.

#### Parameters

##### bytes

`Uint8Array`

The input bytes (a whole file or a stdin buffer). Only the leading prefix is sniffed.

#### Returns

[`DetectResult`](#detectresult)

A [DetectResult](#detectresult): `certain` + a `format` on a single match, else `ambiguous`/`none`
  with `format: null` and the value-free `candidates` list. **Never guesses.**

#### Example

```ts
import { detectFormat } from "@cosyte/cli";

const enc = new TextEncoder();
detectFormat(enc.encode("MSH|^~\\&|A|B\r")).format;            // => "hl7"
detectFormat(enc.encode('{"resourceType":"Patient"}')).format; // => "fhir"
detectFormat(enc.encode("hello")).confidence;                  // => "none"
```

***

### detectionError()

> **detectionError**(`detected`): [`CliError`](#clierror)

Build the value-free [CliError](#clierror) for a **non-certain** detection: the data error the caller
returns instead of guessing a parser. `ambiguous` names the matching candidates (a value-free code
list); `none` asks for `--format`. Both map to the data-error exit (`65`). Never echoes input bytes.

#### Parameters

##### detected

[`DetectResult`](#detectresult)

A [DetectResult](#detectresult) whose `format` is `null` (i.e. not `certain`).

#### Returns

[`CliError`](#clierror)

A value-free `CLI_FORMAT_AMBIGUOUS` or `CLI_FORMAT_UNDETECTED` error.

#### Example

```ts
import { classifyCandidates, detectionError } from "@cosyte/cli";

detectionError(classifyCandidates([])).code; // => "CLI_FORMAT_UNDETECTED"
detectionError(classifyCandidates(["hl7", "fhir"])).code; // => "CLI_FORMAT_AMBIGUOUS"
```

***

### errorResult()

> **errorResult**(`err`): [`RunResult`](#runresult)

Resolve a [CliError](#clierror) into a value-free [RunResult](#runresult): empty `stdout` (nothing reaches the
data channel on an error), the rendered diagnostic on `stderr`, and the error's exit code. The
single place the CLI turns an owned error into a result, so every command and the dispatcher render
errors identically.

#### Parameters

##### err

[`CliError`](#clierror)

The CLI error to resolve.

#### Returns

[`RunResult`](#runresult)

The value-free [RunResult](#runresult).

#### Example

```ts
import { CliError, CLI_CODES, EXIT, errorResult } from "@cosyte/cli";

errorResult(new CliError(CLI_CODES.CLI_USAGE, EXIT.USAGE, "missing <file>")).exit; // => 2
```

***

### extractPhiPosture()

> **extractPhiPosture**(`argv`): `object`

Resolve the global `--unsafe-show-values` flag out of an argument vector, **order-independently**
(it may appear before or after the subcommand), and return the posture plus the argv with every
occurrence of the flag removed, so each command's own `parseArgs` never sees it and cannot reject
it as unknown. This is the one place the flag is recognised.

#### Parameters

##### argv

readonly `string`[]

The raw arguments (after the program name).

#### Returns

`object`

The resolved [PhiPosture](#phiposture) and the flag-stripped argv.

##### argv

> **argv**: `string`[]

##### posture

> **posture**: [`PhiPosture`](#phiposture)

#### Example

```ts
import { extractPhiPosture } from "@cosyte/cli";

extractPhiPosture(["parse", "x.hl7"]).posture.showValues; // => false
extractPhiPosture(["--unsafe-show-values", "parse", "x.hl7"]).posture.showValues; // => true
extractPhiPosture(["parse", "x.hl7", "--unsafe-show-values"]).argv; // => ["parse", "x.hl7"]
```

***

### extractStableCode()

> **extractStableCode**(`e`): `string` \| `null`

Pull a `code` off a thrown value **only** when it is a PHI-free constant token
(`^[A-Z][A-Z0-9_]*$`: a letter-led UPPER_SNAKE code like `MALFORMED_JSON`), e.g. a wrapped
parser's stable fatal code. Anything else (no `code`, a non-string, a non-token, or a **pure-digit**
value that could be a raw identifier) yields `null`, so a parser exception that embedded input bytes
in a `code`-shaped field can never reach a diagnostic.

#### Parameters

##### e

`unknown`

A caught value.

#### Returns

`string` \| `null`

The stable code token, or `null`.

#### Example

```ts
import { extractStableCode } from "@cosyte/cli";

extractStableCode({ code: "MALFORMED_JSON" }); // => "MALFORMED_JSON"
extractStableCode(new Error("boom")); // => null
```

***

### fileChunks()

> **fileChunks**(`path`): `AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Open a file as a stream of byte **chunks**, with the same value-free failure mode as
[readFileBytes](#readfilebytes): a missing, unreadable or non-file path is a `CLI_NO_INPUT` error, never a
raw filesystem exception.

#### Parameters

##### path

`string`

The file path to read.

#### Returns

`AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

An async iterable of the file's chunks.

#### Throws

`CLI_NO_INPUT` (exit `66`) when the file cannot be opened or read.

#### Example

```ts throws
import { fileChunks } from "@cosyte/cli";

for await (const chunk of fileChunks("/no/such/file")) chunk.length; // throws CLI_NO_INPUT
```

***

### fmtCommand()

> **fmtCommand**(`args`, `deps`, `posture?`): `Promise`\<[`RunResult`](#runresult)\>

Run the `fmt` command.

#### Parameters

##### args

`string`[]

The arguments after the `fmt` subcommand token.

##### deps

[`RunDeps`](#rundeps)

Injected input readers ([RunDeps](#rundeps)).

##### posture?

[`PhiPosture`](#phiposture) = `VALUE_FREE`

The resolved [PhiPosture](#phiposture) (governs only the opt-in unsafe excerpt on a
  parse-failure diagnostic).

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

A [RunResult](#runresult): the canonical re-serialization on `stdout` (exit `0`), a value-free
  warning-count note on `stderr` unless `--quiet`; an unparseable input is a data error (`65`) with
  no partial emit, an unreadable file `66`, a bad flag `2`.

#### Throws

Never [CliError](#clierror); may propagate a truly unexpected error for the dispatcher to map.

#### Example

```ts
import { fmtCommand } from "@cosyte/cli";

const deps = {
  readFile: async () => new TextEncoder().encode('{ "resourceType":"Patient" , "id":"x" }'),
  readStdin: async () => new Uint8Array(),
};
(await fmtCommand(["patient.json"], deps)).exit; // => 0
```

***

### fmtFormat()

> **fmtFormat**(`format`, `bytes`): `Promise`\<[`FmtResult`](#fmtresult)\>

Canonically re-serialize one input of `format` via the wrapped library's spec-clean serializer. The
CLI never re-canonicalizes on its own; the output is exactly the serializer's.

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

A format for which `supportsOp(format, "fmt")` is true.

##### bytes

`Uint8Array`

The input bytes.

#### Returns

`Promise`\<[`FmtResult`](#fmtresult)\>

The serialized text + a value-free warning count.

#### Throws

`CLI_PARSER_UNAVAILABLE` if the optional parser is absent; the wrapped parser's
  rejection propagates for the command's value-free failure boundary (no partial emit).

#### Example

```ts
import { fmtFormat } from "@cosyte/cli";

const bytes = new TextEncoder().encode('{ "resourceType":"Patient" , "id":"x" }');
(await fmtFormat("fhir", bytes)).output.startsWith("{"); // => true
```

***

### formatDiagnostic()

> **formatDiagnostic**(`err`): `string`

Render a [CliError](#clierror) as a single value-free `stderr` line: `cosyte: <CODE>: <message>`. The
message is already value-free by the [CliError](#clierror) contract; this only prefixes the tool name
and the code so scripts and humans can branch on a stable token.

#### Parameters

##### err

[`CliError`](#clierror)

The CLI error to render.

#### Returns

`string`

The stderr line (no trailing newline).

#### Example

```ts
import { CliError, CLI_CODES, EXIT, formatDiagnostic } from "@cosyte/cli";

formatDiagnostic(new CliError(CLI_CODES.CLI_USAGE, EXIT.USAGE, "missing <file> argument"));
// => "cosyte: CLI_USAGE: missing <file> argument"
```

***

### formatHl7Position()

> **formatHl7Position**(`pos`): `string`

Render an HL7 warning position as a **value-free** locator string built only from its numeric
indices: e.g. `seg[3].field[5].comp[1]`. No segment content, no field value, ever appears; only the
structural coordinates the parser reported.

#### Parameters

##### pos

`Hl7PositionLike`

The HL7 position (segment/field/repetition/component/subcomponent indices).

#### Returns

`string`

A value-free locator, e.g. `"seg[3].field[5]"`.

#### Example

```ts
import { formatHl7Position } from "@cosyte/cli";

formatHl7Position({ segmentIndex: 3, fieldIndex: 5 }); // => "seg[3].field[5]"
formatHl7Position({ segmentIndex: 0 }); // => "seg[0]"
```

***

### formatsSupporting()

> **formatsSupporting**(`op`): readonly [`CosyteFormat`](#cosyteformat)[]

The formats that support `op`, as a sorted, value-free list: used to build the "does not support"
diagnostic so the user is told which formats *do* support the operation they asked for.

#### Parameters

##### op

[`Op`](#op)

The wrapping operation.

#### Returns

readonly [`CosyteFormat`](#cosyteformat)[]

The supporting format names, sorted.

#### Example

```ts
import { formatsSupporting } from "@cosyte/cli";

formatsSupporting("fmt"); // => ["astm", "ccda", "fhir", "hl7", "ncpdp", "x12"]
```

***

### helpText()

> **helpText**(`limitBytes?`): `string`

Build the value-free `--help` text. Names commands, flags, the input-size limit, and exit codes,
never any input.

The limit is **rendered from the constant the code enforces**, not typed in: the help output and
the published command reference state one number because there is only one number to state.

#### Parameters

##### limitBytes?

`number` = `MAX_INPUT_BYTES`

The input-size limit to state. Defaults to [MAX\_INPUT\_BYTES](#max_input_bytes).

#### Returns

`string`

The full help text.

#### Example

```ts
import { helpText } from "@cosyte/cli";

helpText(1024).includes("1024 bytes"); // => true
```

***

### inputTooLargeError()

> **inputTooLargeError**(`limit?`): [`CliError`](#clierror)

Build the value-free over-limit refusal: a stable `CLI_INPUT_TOO_LARGE` code, the **data-error**
exit (`65`, never the internal-error `70`), and a message that names the limit and nothing else.
The offending input's own size is deliberately not reported either: the limit is the actionable
fact, and a size read off the input is a property of the input.

#### Parameters

##### limit?

`number` = `MAX_INPUT_BYTES`

The limit that was exceeded, in bytes. Defaults to [MAX\_INPUT\_BYTES](#max_input_bytes).

#### Returns

[`CliError`](#clierror)

The value-free [CliError](#clierror) to resolve the invocation with.

#### Example

```ts
import { inputTooLargeError } from "@cosyte/cli";

inputTooLargeError().exit; // => 65
inputTooLargeError().code; // => "CLI_INPUT_TOO_LARGE"
```

***

### inspectCommand()

> **inspectCommand**(`args`, `deps`, `posture?`): `Promise`\<[`RunResult`](#runresult)\>

Run the `inspect` command.

#### Parameters

##### args

`string`[]

The arguments after the `inspect` subcommand token.

##### deps

[`RunDeps`](#rundeps)

Injected input readers ([RunDeps](#rundeps)).

##### posture?

[`PhiPosture`](#phiposture) = `VALUE_FREE`

The resolved [PhiPosture](#phiposture) (governs only the opt-in unsafe excerpt on a
  parse-failure diagnostic; the summary itself is always value-free).

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

A [RunResult](#runresult): the value-free structural summary on `stdout` (human, or JSON under
  `--json`), exit `0`; a parse failure is a data error (`65`), an unreadable file `66`, a bad flag `2`.

#### Throws

Never [CliError](#clierror); may propagate a truly unexpected error for the dispatcher to map.

#### Example

```ts
import { inspectCommand } from "@cosyte/cli";

const deps = {
  readFile: async () => new TextEncoder().encode('{"resourceType":"Patient"}'),
  readStdin: async () => new Uint8Array(),
};
(await inspectCommand(["patient.json", "--json"], deps)).exit; // => 0
```

***

### inspectFormat()

> **inspectFormat**(`format`, `bytes`): `Promise`\<[`InspectSummary`](#inspectsummary)\>

Build the value-free structural summary of one input of `format`: counts and structural type codes
only, never a field value.

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

A format for which `supportsOp(format, "inspect")` is true.

##### bytes

`Uint8Array`

The input bytes.

#### Returns

`Promise`\<[`InspectSummary`](#inspectsummary)\>

A [InspectSummary](#inspectsummary) variant for the format.

#### Throws

`CLI_PARSER_UNAVAILABLE` if the optional parser is absent; the wrapped parser's
  rejection propagates for the command's value-free failure boundary.

#### Example

```ts
import { inspectFormat } from "@cosyte/cli";

const bytes = new TextEncoder().encode('{"resourceType":"Patient"}');
(await inspectFormat("fhir", bytes)).format; // => "fhir"
```

***

### isDeidCovered()

> **isDeidCovered**(`format`): `format is DeidCoveredFormat`

Whether `format` is one the delegate de-identifies and the CLI can serialize.

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

The resolved format.

#### Returns

`format is DeidCoveredFormat`

`true` iff `redact` produces output for it.

#### Example

```ts
import { isDeidCovered } from "@cosyte/cli";

isDeidCovered("x12"); // => true
```

***

### loadOptional()

> **loadOptional**\<`T`\>(`format`, `load`): `Promise`\<`T`\>

Lazy-import an **optional** parser package, mapping an *absent* package to a value-free
`CLI_PARSER_UNAVAILABLE` (exit `69`): the graceful-degradation path for the `optionalDependencies`
breadth parsers. A genuine import that succeeds passes straight through; any error whose
shape is "module not found" becomes the value-free CLI error. Other errors propagate unchanged.

#### Type Parameters

##### T

`T`

The imported module's type.

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

The format whose optional parser is being loaded (named in the diagnostic).

##### load

() => `Promise`\<`T`\>

A thunk performing the dynamic import.

#### Returns

`Promise`\<`T`\>

The imported module.

#### Throws

`CLI_PARSER_UNAVAILABLE` (exit `69`) when the package is absent; any other error
  propagates unchanged.

#### Example

```ts
import { loadOptional } from "@cosyte/cli";

// a present parser resolves; an absent one throws CLI_PARSER_UNAVAILABLE
await loadOptional("x12", () => import("@cosyte/x12"));
```

***

### loadOptionalPackage()

> **loadOptionalPackage**\<`T`\>(`detail`, `load`): `Promise`\<`T`\>

The same graceful-degradation path as [loadOptional](#loadoptional), keyed on a **package name** rather than
a [CosyteFormat](#cosyteformat), with the diagnostic supplied by the caller.

Three of the packages the CLI lazy-loads do not go through [loadOptional](#loadoptional):
`@cosyte/transform` (a conversion library, not one of the eight formats, so calling it a "parser"
in the diagnostic would be wrong), the MCP server's SDK (loaded by the `mcp` tree, not a parser
either), and `@cosyte/fhir` (a format whose diagnostic also names what installs it, since it is
both an optional dependency here and the peer dependency of `@cosyte/transform`). An install can
lack any of them, so each must degrade to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`) instead
of surfacing a raw resolver error and a stack frame.

#### Type Parameters

##### T

`T`

The imported module's type.

#### Parameters

##### detail

`string`

The value-free diagnostic detail shown when the package is absent.

##### load

() => `Promise`\<`T`\>

A thunk performing the dynamic import.

#### Returns

`Promise`\<`T`\>

The imported module.

#### Throws

`CLI_PARSER_UNAVAILABLE` (exit `69`) when the package is absent; any other error
  propagates unchanged.

#### Example

```ts
import { loadOptionalPackage } from "@cosyte/cli";

await loadOptionalPackage("the conversion library is not installed", () =>
  import("@cosyte/transform"),
);
```

***

### mapCodesCommand()

> **mapCodesCommand**(`args`, `deps`): `Promise`\<[`RunResult`](#runresult)\>

Run the `map-codes` command.

#### Parameters

##### args

`string`[]

The arguments after the `map-codes` subcommand token.

##### deps

[`RunDeps`](#rundeps)

Injected input readers ([RunDeps](#rundeps)); the positional argument (or `-`) is the BYO
  ConceptMap document.

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

A [RunResult](#runresult): the translation result on `stdout` (matched target coding(s) or the
  value-free unmapped signal), a value-free note on `stderr` (unless `--quiet`), and an exit code
  carrying the outcome: `0` mapped · `1` unmapped · `65` unloadable ConceptMap · `66` no input ·
  `2` usage.

#### Throws

Never [CliError](#clierror); may propagate a truly unexpected error for the dispatcher to map to
  `CLI_INTERNAL`.

#### Example

```ts
import { mapCodesCommand } from "@cosyte/cli";

const cm = JSON.stringify({
  resourceType: "ConceptMap",
  group: [
    {
      source: "http://hl7.org/fhir/administrative-gender",
      target: "http://terminology.hl7.org/CodeSystem/v2-0001",
      element: [{ code: "male", target: [{ code: "M", equivalence: "equivalent" }] }],
    },
  ],
});
const deps = {
  readFile: async () => new TextEncoder().encode(cm),
  readStdin: async () => new Uint8Array(),
};
const r = await mapCodesCommand(
  ["gender.json", "--system", "http://hl7.org/fhir/administrative-gender", "--code", "male"],
  deps,
);
r.exit; // => 0
```

***

### mllpFrames()

> **mllpFrames**(`chunks`): `AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

De-frame a chunk stream into **MLLP frame payloads** (each an enclosed HL7 v2 message), yielded as
each frame completes. The framing is `@cosyte/mllp`'s own streaming `FrameReader`, fed chunk by
chunk; the CLI only tracks where the frame bytes fell so it can tell a **truncated** stream from a
complete one.

**Truncation is a data error, never a silent drop.** An unterminated trailing frame (a start-of-block
byte after the last end-of-block byte, or an end-of-block byte that ends the stream before its
carriage return) is delivered by no callback, so it would otherwise vanish with a green exit. It is detected at end of stream and raised, after the frames that did complete
have already been yielded: their output stands, and the invocation still resolves to the data error.

#### Parameters

##### chunks

[`ByteChunks`](#bytechunks)

The input chunk stream.

#### Returns

`AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

A stream of enclosed HL7 payloads, in frame order.

#### Throws

`CLI_PARSER_UNAVAILABLE` (exit `69`) if `@cosyte/mllp` is absent;
  `CLI_PARSE_FAILED` (exit `65`) at end of stream on a truncated final frame.

#### Example

```ts
import { mllpFrames, oneChunk } from "@cosyte/cli";

const framed = new Uint8Array([0x0b, 0x4d, 0x53, 0x48, 0x1c, 0x0d]);
const seen: number[] = [];
for await (const p of mllpFrames(oneChunk(framed))) seen.push(p.length);
seen.length; // => 1
```

***

### ndjsonRecords()

> **ndjsonRecords**(`chunks`): `AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Split a chunk stream into **NDJSON records**: each non-empty, newline-terminated line, yielded as
soon as its terminator arrives. A record split across two chunks is carried over; a final record
with no trailing newline is yielded at end of stream; a blank line carries no record and is
skipped.

#### Parameters

##### chunks

[`ByteChunks`](#bytechunks)

The input chunk stream.

#### Returns

`AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

A stream of record bytes, in input order.

#### Example

```ts
import { ndjsonRecords, oneChunk } from "@cosyte/cli";

const src = oneChunk(new TextEncoder().encode('{"a":1}\n\n{"b":2}\n'));
const out: string[] = [];
for await (const r of ndjsonRecords(src)) out.push(new TextDecoder().decode(r));
out.length; // => 2
```

***

### oneChunk()

> **oneChunk**(`bytes`): `AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Wrap `bytes` as a one-chunk stream, so the streaming record path can also serve a caller that
hands the CLI a whole buffer (an injected reader, or the programmatic API). The path is the same;
only the granularity the input arrives at differs.

#### Parameters

##### bytes

`Uint8Array`

The whole input.

#### Returns

`AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

A stream yielding exactly one chunk (or none, when `bytes` is empty).

#### Example

```ts
import { oneChunk } from "@cosyte/cli";

let n = 0;
for await (const c of oneChunk(new Uint8Array([1, 2, 3]))) n += c.length;
n; // => 3
```

***

### parseCommand()

> **parseCommand**(`args`, `deps`, `posture?`): `Promise`\<[`RunResult`](#runresult)\>

Run the `parse` command.

#### Parameters

##### args

`string`[]

The arguments after the `parse` subcommand token.

##### deps

[`RunDeps`](#rundeps)

Injected I/O ([RunDeps](#rundeps)). When it carries the chunk readers and the output
  sink, a multi-record input is read and emitted incrementally; when it does not, the same path
  runs over one chunk and the output comes back on `stdout` instead.

##### posture?

[`PhiPosture`](#phiposture) = `VALUE_FREE`

The resolved [PhiPosture](#phiposture). Defaults to [VALUE\_FREE](#value_free); under
  `--unsafe-show-values` a bounded excerpt of the offending input is appended to a `CLI_PARSE_FAILED`
  diagnostic (the single, opt-in value-echoing surface): single-record mode only.

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

A [RunResult](#runresult): the typed-JSON model (or NDJSON records) on `stdout`, a value-free note
  (or nothing) on `stderr`, and the resolved exit code. An input past the documented size limit is a
  value-free data error naming the limit. Never throws a [CliError](#clierror): it resolves it to a
  result; unexpected exceptions are caught by the dispatcher and mapped to `CLI_INTERNAL`.

#### Throws

Never [CliError](#clierror); may propagate a truly unexpected error for the dispatcher to map.

#### Example

```ts
import { parseCommand } from "@cosyte/cli";

const enc = new TextEncoder();
const deps = {
  readFile: async () => enc.encode('{"resourceType":"Patient","id":"x"}'),
  readStdin: async () => new Uint8Array(),
};
(await parseCommand(["patient.json"], deps)).exit; // => 0
```

***

### parseFailureResult()

> **parseFailureResult**(`format`, `bytes`, `posture`, `e`): [`RunResult`](#runresult)

Build the value-free [RunResult](#runresult) for a **wrapped-parser rejection**: a `CLI_PARSE_FAILED`
data error (exit `65`). The stderr line names the format and, when the thrown value carried one, a
stable code token in parentheses; it **never** echoes the parser's message or the input bytes. Under
`--unsafe-show-values` (and only then) a bounded excerpt of the offending input is appended via the
single [unsafeInputSuffix](#unsafeinputsuffix) chokepoint.

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

The format whose parser rejected the input.

##### bytes

`Uint8Array`

The offending input (only consulted for the opt-in unsafe excerpt).

##### posture

[`PhiPosture`](#phiposture)

The resolved [PhiPosture](#phiposture); the excerpt is appended only when it opts in.

##### e

`unknown`

The caught exception (its `code`, if a stable token, is surfaced: nothing else).

#### Returns

[`RunResult`](#runresult)

A value-free `CLI_PARSE_FAILED` / exit-`65` [RunResult](#runresult).

#### Example

```ts
import { parseFailureResult, VALUE_FREE } from "@cosyte/cli";

const bytes = new TextEncoder().encode("not hl7");
parseFailureResult("hl7", bytes, VALUE_FREE, { code: "MISSING_MSH" }).exit; // => 65
```

***

### parseFormat()

> **parseFormat**(`format`, `bytes`): `Promise`\<[`ParseResult`](#parseresult)\>

Parse one record of `format` into the wrapped library's model + its value-free warnings. The model
is emitted verbatim on the data channel; the CLI adds no parsing of its own.

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

A format for which `supportsOp(format, "parse")` is true.

##### bytes

`Uint8Array`

The single record's bytes (already de-framed for MLLP: callers pass `"hl7"` there).

#### Returns

`Promise`\<[`ParseResult`](#parseresult)\>

The parsed model + value-free warnings.

#### Throws

`CLI_PARSER_UNAVAILABLE` if the optional parser is absent; the wrapped parser's
  own rejection propagates for the command's value-free failure boundary to catch.

#### Example

```ts
import { parseFormat } from "@cosyte/cli";

const bytes = new TextEncoder().encode('{"resourceType":"Patient","id":"x"}');
(await parseFormat("fhir", bytes)).warnings.length; // => 0
```

***

### readFileBytes()

> **readFileBytes**(`path`, `limit?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Read a file into bytes, mapping any read failure to a **value-free** `CLI_NO_INPUT` /
[EXIT.NOINPUT](#noinput) error. The path is structural context (the user supplied it), so it may appear
in the message; the file *contents* never do.

A file whose size already exceeds `limit` is refused **before it is read**, with the value-free
over-limit data error, so an oversized file is never allocated in the first place. The size is read
from the **open descriptor** rather than from the path, so what is measured and what is read are the
same file even if the path is replaced in between.

#### Parameters

##### path

`string`

The file path to read.

##### limit?

`number` = `MAX_INPUT_BYTES`

The maximum number of bytes to accept. Defaults to [MAX\_INPUT\_BYTES](#max_input_bytes).

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The file bytes.

#### Throws

`CLI_NO_INPUT` (exit `66`) when the file is missing, a directory, or unreadable;
  `CLI_INPUT_TOO_LARGE` (exit `65`) when it is larger than `limit`.

#### Example

```ts throws
import { readFileBytes } from "@cosyte/cli";

await readFileBytes("/no/such/file"); // throws CliError CLI_NO_INPUT
```

***

### readStreamBytes()

> **readStreamBytes**(`stream`, `limit?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Drain a readable stream (e.g. `process.stdin`) into a single byte buffer, refusing an over-limit
stream against the **running total**: the read is abandoned the moment the accumulated size passes
`limit`, so the bytes past it are never allocated and no platform allocation ceiling is ever
reached.

#### Parameters

##### stream

`Readable`

The readable stream to drain.

##### limit?

`number` = `MAX_INPUT_BYTES`

The maximum number of bytes to accept. Defaults to [MAX\_INPUT\_BYTES](#max_input_bytes).

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The concatenated bytes.

#### Throws

`CLI_INPUT_TOO_LARGE` (exit `65`) as soon as the running total passes `limit`.

#### Example

```ts
import { Readable } from "node:stream";
import { readStreamBytes } from "@cosyte/cli";

const bytes = await readStreamBytes(Readable.from([Buffer.from("MSH|")]));
bytes.length; // => 4
```

***

### redactCommand()

> **redactCommand**(`args`, `deps`, `loadDelegate?`): `Promise`\<[`RunResult`](#runresult)\>

Run the `redact` / `deid` command.

#### Parameters

##### args

`string`[]

The arguments after the `redact`/`deid` subcommand token.

##### deps

[`RunDeps`](#rundeps)

Injected input readers ([RunDeps](#rundeps)).

##### loadDelegate?

() => `Promise`\<[`DeidDelegate`](#deiddelegate)\>

The de-identification delegate loader; injectable so a test can drive the
  library-absent path without uninstalling it.

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

A [RunResult](#runresult). A clean pass over a covered format: the de-identified document on
  `stdout`, the delegate's attribution and value-free manifest on `stderr`, exit `0`. Otherwise
  empty `stdout` and a typed non-zero exit: `1` when the delegate could not handle an element, `69`
  when it has no adapter for the format or is absent, `65` when the format cannot ride a text
  stdout or the input did not parse, `66` for an unreadable file, `2` for a bad flag.

#### Throws

Never [CliError](#clierror); may propagate a truly unexpected error for the dispatcher to map.

#### Example

```ts
import { redactCommand } from "@cosyte/cli";

const deps = {
  readFile: async () => new TextEncoder().encode('{"resourceType":"Patient","id":"x"}'),
  readStdin: async () => new Uint8Array(),
};
(await redactCommand(["patient.json"], deps)).exit; // => 0
```

***

### resolveInput()

> **resolveInput**(`source`, `formatOverride`, `deps`, `op`): `Promise`\<[`InputResolution`](#inputresolution)\>

Resolve and read the input, and resolve its format, for a file-consuming command.

#### Parameters

##### source

`string` \| `undefined`

The positional `<file|->` argument (or `undefined` when it was omitted).

##### formatOverride

`string` \| `undefined`

The raw `--format` value, or `undefined` to autodetect by content.

##### deps

[`RunDeps`](#rundeps)

Injected input readers ([RunDeps](#rundeps)).

##### op

[`Op`](#op) \| `null`

The wrapping operation the caller will run; the resolved format is confirmed to support
  it (else a value-free `CLI_FORMAT_UNSUPPORTED` naming the supporting formats). Pass `null` when
  the caller answers for capability itself: `redact` delegates to `@cosyte/deid`, whose per-format
  coverage is a different matrix with its own two distinct refusals, so applying the parser
  registry's matrix first would answer with the wrong code.

#### Returns

`Promise`\<[`InputResolution`](#inputresolution)\>

`{ ok: true, input }` when the bytes read and the format resolved to a parser supporting
  `op`; else `{ ok: false, result }` with a value-free usage/no-input/data-error [RunResult](#runresult).

#### Throws

Propagates a **non-`CliError`** read failure unchanged, so the dispatcher maps it to
  `CLI_INTERNAL` (a `CliError` read failure, e.g. a missing file, is caught and returned).

#### Example

```ts
import { resolveInput } from "@cosyte/cli";

const deps = {
  readFile: async () => new TextEncoder().encode('{"resourceType":"Patient"}'),
  readStdin: async () => new Uint8Array(),
};
const r = await resolveInput("patient.json", undefined, deps, "parse");
if (r.ok) r.input.format; // => "fhir"
```

***

### resolveInputStream()

> **resolveInputStream**(`source`, `formatOverride`, `deps`, `op`, `limit?`): `Promise`\<[`InputStreamResolution`](#inputstreamresolution)\>

Resolve the input as a **stream of chunks** rather than one buffer, for a command that can act on a
record before the whole input has arrived.

It reads only as far as the detection window ([DETECT\_PREFIX\_BYTES](#detect_prefix_bytes)) before deciding the
format, then hands back those bytes followed by the rest of the stream, unread. The size limit is
applied to the running total from the first chunk, so an over-limit input is refused while it is
still arriving and never assembled.

When the caller's [RunDeps](#rundeps) carry no chunk readers, the whole-input readers are wrapped as a
single chunk: the same code path, the same output, only the granularity differs.

#### Parameters

##### source

`string` \| `undefined`

The positional `<file|->` argument (or `undefined` when it was omitted).

##### formatOverride

`string` \| `undefined`

The raw `--format` value, or `undefined` to autodetect by content.

##### deps

[`RunDeps`](#rundeps)

Injected readers ([RunDeps](#rundeps)); the chunk readers are used when present.

##### op

[`Op`](#op)

The wrapping operation the caller will run; the resolved format is confirmed to support it.

##### limit?

`number` = `MAX_INPUT_BYTES`

The maximum number of input bytes to accept. Defaults to [MAX\_INPUT\_BYTES](#max_input_bytes).

#### Returns

`Promise`\<[`InputStreamResolution`](#inputstreamresolution)\>

`{ ok: true, input }` with the format and the chunk stream, else `{ ok: false, result }`
  carrying the value-free usage / no-input / data-error [RunResult](#runresult).

#### Throws

Propagates a **non-`CliError`** read failure unchanged, so the dispatcher maps it to
  `CLI_INTERNAL`.

#### Example

```ts
import { resolveInputStream } from "@cosyte/cli";

const deps = {
  readFile: async () => new TextEncoder().encode('{"resourceType":"Patient"}'),
  readStdin: async () => new Uint8Array(),
};
const r = await resolveInputStream("patient.json", undefined, deps, "parse");
if (r.ok) r.input.format; // => "fhir"
```

***

### run()

> **run**(`argv`, `deps`): `Promise`\<[`RunResult`](#runresult)\>

Run a full `cosyte` invocation as data.

#### Parameters

##### argv

`string`[]

The arguments after the program name (i.e. `process.argv.slice(2)`).

##### deps

[`RunDeps`](#rundeps)

Injected input readers ([RunDeps](#rundeps)).

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

The [RunResult](#runresult) to write to the process streams and exit with.

#### Example

```ts
import { run } from "@cosyte/cli";

const deps = { readFile: async () => new Uint8Array(), readStdin: async () => new Uint8Array() };
const { exit } = await run(["--version"], deps);
exit; // => 0
```

***

### streamChunks()

> **streamChunks**(`stream`): `AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Open a readable stream (e.g. `process.stdin`) as a stream of byte **chunks**, in arrival order.
Unlike [readStreamBytes](#readstreambytes) this never concatenates: the consumer decides what to keep, which is
what lets a multi-record command emit a record before the rest of the input has been read.

#### Parameters

##### stream

`Readable`

The readable stream to iterate.

#### Returns

`AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

An async iterable of the stream's chunks, string chunks encoded as UTF-8.

#### Example

```ts
import { Readable } from "node:stream";
import { streamChunks } from "@cosyte/cli";

const seen: number[] = [];
for await (const c of streamChunks(Readable.from([Buffer.from("MS"), Buffer.from("H|")]))) {
  seen.push(c.length);
}
seen.length; // => 2
```

***

### supportsOp()

> **supportsOp**(`format`, `op`): `boolean`

True iff `format`'s wrapped parser supports `op` in this build (see [OP\_SUPPORT](#op_support)).

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

The resolved format.

##### op

[`Op`](#op)

The wrapping operation.

#### Returns

`boolean`

Whether the (format, op) pair is wired.

#### Example

```ts
import { supportsOp } from "@cosyte/cli";

supportsOp("x12", "fmt"); // => true
supportsOp("dicom", "parse"); // => false
```

***

### toCliError()

> **toCliError**(`err`): [`CliError`](#clierror)

Coerce an unknown thrown value into a [CliError](#clierror). A [CliError](#clierror) passes through; anything
else becomes a `CLI_INTERNAL` / [EXIT.SOFTWARE](#software) error whose message is a **fixed, value-free
string**: the original message is deliberately discarded so a parser exception that embedded input
bytes can never reach stderr.

#### Parameters

##### err

`unknown`

The caught value.

#### Returns

[`CliError`](#clierror)

A [CliError](#clierror) safe to render to stderr.

#### Example

```ts
import { toCliError } from "@cosyte/cli";

toCliError(new Error("boom")).code; // => "CLI_INTERNAL"
```

***

### truncatedMllpError()

> **truncatedMllpError**(): [`CliError`](#clierror)

The value-free data error for a **truncated MLLP stream**: a frame opened and never closed (no FS,
or an FS with no CR after it), which the streaming reader buffers and delivers to no callback. Built here so the whole-buffer de-framer
above and the chunk-by-chunk one in `core/records.ts` refuse the same input with the same code and
the same words.

#### Returns

[`CliError`](#clierror)

A `CLI_PARSE_FAILED` (exit `65`) [CliError](#clierror).

#### Example

```ts
import { truncatedMllpError } from "@cosyte/cli";

truncatedMllpError().exit; // => 65
```

***

### unsafeInputSuffix()

> **unsafeInputSuffix**(`bytes`, `posture`): `string`

Build the **only** value-bearing addition the CLI ever appends to a secondary (stderr) surface: a
bounded, single-line excerpt of the offending input, shown **iff** `--unsafe-show-values` is set.
Under the default value-free posture it returns the empty string, so a diagnostic stays value-free
unless the user explicitly opted in. This is the single chokepoint the PHI-leak matrix pins.

#### Parameters

##### bytes

`Uint8Array`

The input the CLI is operating on (only the leading [UNSAFE\_EXCERPT\_MAX](#unsafe_excerpt_max) bytes
  are considered).

##### posture

[`PhiPosture`](#phiposture)

The resolved [PhiPosture](#phiposture).

#### Returns

`string`

`""` under the value-free default; otherwise a ` [unsafe-show-values] …` suffix carrying a
  bounded, newline-flattened prefix of `bytes`.

#### Example

```ts
import { unsafeInputSuffix, VALUE_FREE, SHOW_VALUES } from "@cosyte/cli";

const bytes = new TextEncoder().encode("bad message");
unsafeInputSuffix(bytes, VALUE_FREE); // => ""
unsafeInputSuffix(bytes, SHOW_VALUES);
// => " [unsafe-show-values] offending input (first 200 bytes): bad message"
```

***

### validateCommand()

> **validateCommand**(`args`, `deps`, `posture?`): `Promise`\<[`RunResult`](#runresult)\>

Run the `validate` command.

#### Parameters

##### args

`string`[]

The arguments after the `validate` subcommand token.

##### deps

[`RunDeps`](#rundeps)

Injected input readers ([RunDeps](#rundeps)).

##### posture?

[`PhiPosture`](#phiposture) = `VALUE_FREE`

The resolved [PhiPosture](#phiposture) (governs only the opt-in unsafe excerpt on a
  parse-failure diagnostic; a validation verdict is always value-free).

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

A [RunResult](#runresult) whose **exit code carries the verdict** (`0` valid / `1` invalid /
  `65` unparseable / `66` no input / `2` usage). Value-free findings on `stderr`, or value-free
  JSON on stdout under `--json`.

#### Throws

Never [CliError](#clierror); may propagate a truly unexpected error for the dispatcher to map.

#### Example

```ts
import { validateCommand } from "@cosyte/cli";

const deps = {
  readFile: async () => new TextEncoder().encode('{"resourceType":"Patient","gender":"male"}'),
  readStdin: async () => new Uint8Array(),
};
(await validateCommand(["patient.json"], deps)).exit; // => 0
```

***

### validateFormat()

> **validateFormat**(`format`, `bytes`): `Promise`\<[`Verdict`](#verdict)\>

Run the format's validation surface and return a value-free [Verdict](#verdict). For the Postel's-Law
lenient parsers, a **parseable** input is valid: recovered deviations are non-fatal warnings the
library surfaces, never a stricter verdict the CLI invents. FHIR additionally runs `validateResource`
and is invalid on any error/fatal-severity issue.

#### Parameters

##### format

[`CosyteFormat`](#cosyteformat)

A format for which `supportsOp(format, "validate")` is true.

##### bytes

`Uint8Array`

The input bytes.

#### Returns

`Promise`\<[`Verdict`](#verdict)\>

The value-free verdict (findings + validity).

#### Throws

`CLI_PARSER_UNAVAILABLE` if the optional parser is absent; an unparseable input
  propagates as the wrapped parser's throw for the command to map to a data error (`65`).

#### Example

```ts
import { validateFormat } from "@cosyte/cli";

const bytes = new TextEncoder().encode('{"resourceType":"Patient","gender":"male"}');
(await validateFormat("fhir", bytes)).valid; // => true
```

***

### valueFreeLocator()

> **valueFreeLocator**(`pos`): `string`

Render an arbitrary parser **position** object as a value-free locator string, keeping **only**
number-valued own properties (the parsers' positions are index-only): e.g. `{ segmentIndex: 3,
elementIndex: 2 }` → `segmentIndex[3].elementIndex[2]`. A non-number field (which a position should
never carry) is dropped, so a stray value can never reach a diagnostic. Falls back to `"?"` when no
numeric index is present.

#### Parameters

##### pos

`unknown`

A parser position object (index-only by the parser's contract).

#### Returns

`string`

A value-free locator built solely from numeric indices.

#### Example

```ts
import { valueFreeLocator } from "@cosyte/cli";

valueFreeLocator({ segmentIndex: 3, elementIndex: 2 }); // => "segmentIndex[3].elementIndex[2]"
valueFreeLocator({}); // => "?"
```

***

### withinLimit()

> **withinLimit**(`chunks`, `limit?`): `AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Pass chunks through while counting them against the CLI's own size limit, and **refuse the moment
the running total passes it**: the chunk that crosses the limit is never yielded, the source is
never pulled again, and nothing downstream ever allocates memory proportional to an oversized
input. This is why the refusal a caller sees is the CLI's own data error rather than a platform
allocation failure reported as an internal error.

#### Parameters

##### chunks

[`ByteChunks`](#bytechunks)

The input chunk stream.

##### limit?

`number` = `MAX_INPUT_BYTES`

The maximum number of bytes to accept. Defaults to [MAX\_INPUT\_BYTES](#max_input_bytes).

#### Returns

`AsyncGenerator`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The same chunks, up to the limit.

#### Throws

`CLI_INPUT_TOO_LARGE` (exit `65`) as soon as the running total passes `limit`.

#### Example

```ts
import { oneChunk, withinLimit } from "@cosyte/cli";

const src = withinLimit(oneChunk(new Uint8Array(10)), 4);
await src.next().catch((e: unknown) => (e as { code: string }).code); // => "CLI_INPUT_TOO_LARGE"
```
