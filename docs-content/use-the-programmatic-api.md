---
id: use-the-programmatic-api
title: Use the programmatic API
sidebar_label: Use the programmatic API
description: "Call the code behind the cosyte command from TypeScript: detect a format, run a command on bytes you hold, and branch on the same exit and diagnostic codes."
---

# Use the programmatic API

The package's main entry point exports the code the `cosyte` command runs on: format detection, the
commands themselves, and the exit and diagnostic codes. Use it to drive the same logic from your own
program without starting a process. Most programs that parse messages should import the format's
own library, such as `@cosyte/hl7`, instead; this API is for code that wants the command's
behavior: detection, the exit-code contract, and output that carries no values on stderr.

## Detect a format

`detectFormat` reads the start of the input and names one format, or says it could not decide. It
never guesses:

```ts runnable
import { detectFormat } from "@cosyte/cli";

const enc = new TextEncoder();
detectFormat(enc.encode("MSH|^~\\&|SENDINGAPP|SENDINGFAC\r")).format; // => "hl7"
detectFormat(enc.encode('{"resourceType":"Patient","id":"example"}')).format; // => "fhir"
detectFormat(enc.encode("not a healthcare message")).confidence; // => "none"
```

## Run a command on bytes you hold

`run` takes the arguments that would follow `cosyte` and an object that supplies the input. It
returns what the command would have printed and its exit code, and writes nothing itself:

```ts runnable
import { run, EXIT } from "@cosyte/cli";

const files: Record<string, string> = {
  "patient.json": '{"resourceType":"Patient","id":"example","gender":"m"}',
};
const deps = {
  readFile: async (path: string) => new TextEncoder().encode(files[path] ?? ""),
  readStdin: async () => new Uint8Array(),
};

const result = await run(["validate", "patient.json"], deps);
result.exit === EXIT.INVALID; // => true
result.stdout; // => ""
result.stderr.split("\n")[0]; // => "cosyte: validate: error CODE_INVALID at Patient.gender"
```

To read real files, pass `readFileBytes` as `readFile`: it applies the same size limit as the
command, and turns a missing file into `CLI_NO_INPUT` (exit `66`). A `readFile` of your own that
throws anything other than a `CliError` ends the run as `CLI_INTERNAL` (exit `70`).

```ts runnable
import { readFileBytes, run } from "@cosyte/cli";

const deps = { readFile: readFileBytes, readStdin: async () => new Uint8Array() };
const result = await run(["inspect", "no-such-file.hl7"], deps);
result.exit; // => 66
result.stderr.startsWith("cosyte: CLI_NO_INPUT: "); // => true
```

## Branch on the codes

`EXIT` holds the exit codes and `CLI_CODES` the diagnostic codes, by name, so code does not repeat
the numbers:

```ts runnable
import { CLI_CODES, EXIT, run } from "@cosyte/cli";

const deps = {
  readFile: async () => new TextEncoder().encode("hello"),
  readStdin: async () => new Uint8Array(),
};
const { exit, stderr } = await run(["parse", "note.txt"], deps);

exit === EXIT.DATAERR; // => true
stderr.includes(CLI_CODES.CLI_FORMAT_UNDETECTED); // => true
```

## Ask which formats support an operation

```ts runnable
import { formatsSupporting, supportsOp } from "@cosyte/cli";

formatsSupporting("fmt"); // => ["astm", "ccda", "fhir", "hl7", "ncpdp", "x12"]
supportsOp("mllp", "validate"); // => false
```

## Call an MCP tool without a server

`@cosyte/cli/mcp` exports the MCP server and the function behind each tool call. `dispatchTool`
runs one call and returns the result the server would send:

```ts runnable
import { dispatchTool } from "@cosyte/cli/mcp";

const reply = await dispatchTool("validate", {
  content: '{"resourceType":"Patient","id":"example","gender":"m"}',
});
reply.isError; // => false
reply.structuredContent.status; // => "verdict"
reply.structuredContent.exit; // => 1
```

The `@cosyte/cli/mcp` entry point loads `@modelcontextprotocol/sdk`, an optional dependency; the main
entry point does not.

## Reference

The whole API is in the generated reference: [the main entry point](./api/src.md) and
[`@cosyte/cli/mcp`](./api/src/mcp.md). The functions used here are
[`detectFormat`](./api/src.md#detectformat), [`run`](./api/src.md#run),
[`readFileBytes`](./api/src.md#readfilebytes), [`EXIT`](./api/src.md#exit),
[`CLI_CODES`](./api/src.md#cli_codes), [`formatsSupporting`](./api/src.md#formatssupporting),
[`supportsOp`](./api/src.md#supportsop), and [`dispatchTool`](./api/src/mcp.md#dispatchtool).
