---
id: performance
title: Performance
sidebar_label: Performance
description: "What we measure on @cosyte/cli and how, where the time in one run goes, and how to time the command on your own machine."
---

# Performance

This page describes what we measure on `@cosyte/cli`, how, and how to time it yourself. The shared
method every Cosyte package follows (throughput, latency percentiles, memory, import time and bundle
size, and how a pull request is compared with `main`) is written down in the performance standard
in [cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

## What we measure

We do not run benchmarks on `@cosyte/cli` yet, and no CI job guards its speed. The performance
standard names what a benchmark measures: throughput, latency at the 50th, 95th, and 99th
percentiles, peak memory, import time, and bundle size. For this package, each of those reads "not
measured" in the section below until a benchmark runs on it.

## Where the time in one run goes

A run starts Node.js, loads the command, reads the input, and calls the library for the format:

- **Startup and loading.** Each library is loaded only when the command needs it: `cosyte parse` on
  an HL7 v2 message loads `@cosyte/hl7` and none of the other parsers, the MCP SDK, or
  `@cosyte/deid`.
- **Parsing.** The wrapped library's work, described on that library's own performance page.
- **Output.** `parse` writes the model as JSON, which is often several times the size of the
  message. Indented output, the default, is larger than `--json`.

## How the output is written

- **`parse` writes as it goes.** The JSON for one message is written in pieces of about 64 KiB as
  it is produced, never built as one string first, and each record of an MLLP stream or an
  `--ndjson` file is written as soon as it is parsed.
- **A slow reader holds the command back.** When the process reading the output falls behind (a
  pager, a network upload, a slow `jq`), `parse` waits for it before it writes, parses or reads
  anything more, so the output it has not delivered yet never piles up in memory.
- **Other commands** write their result in one piece when it is ready.

## How the input is read

- **One message** is read whole before it is parsed. That is the case for every command except a
  multi-record `parse`.
- **An MLLP stream or an `--ndjson` file** is read in chunks, and each record is parsed and written
  as soon as it is complete, so the first line reaches the next process before the rest of the
  file is read. An NDJSON line that spans many chunks is joined once, when its line ends.
- **The size limit**, 64 MiB for one run, is checked against the running count as the input
  arrives. It sits well below the largest string Node.js can hold, which leaves room for the JSON
  output to be several times larger than the input.

## Running many messages

Each `cosyte` run pays the startup cost again. For many small messages, put them in one MLLP or
NDJSON file and parse it in one run, or call the [programmatic API](./use-the-programmatic-api.md),
which runs the same code inside your own process.

## What these numbers are not

- **Not a guarantee for your machine.** Absolute times depend on the hardware and its load.
- **Not a comparison with other tools.** That is a separate suite with its own written method.
- **Not the libraries' numbers.** Parsing speed belongs to each wrapped library's own page.

## Time it yourself

Time a run on your own messages with the shell's `time`:

```bash
time cosyte parse message.hl7 --json > /dev/null
time cosyte parse bulk.ndjson --ndjson --quiet > /dev/null || true
```

The second file holds a broken record on purpose, so its run exits `65`; `|| true` keeps the shell
going.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
