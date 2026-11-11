import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createOutputSink } from "../src/core/io.js";

/**
 * `createOutputSink` is the stdout side of the `cosyte` bin: every chunk of the data channel goes
 * through it. Under back-pressure (a consumer reading slower than we write) it hands back a promise
 * that settles on `drain`, so the command stops producing until the consumer catches up, instead of
 * queueing its whole output in memory. It also tracks delivery: a run whose output reached nobody
 * must not be reported as a success.
 */

/** A writable that holds every write until `release()` acknowledges the ones queued so far. */
function slowConsumer(highWaterMark: number): {
  stream: Writable;
  received: string[];
  release: () => void;
  fail: () => void;
} {
  const received: string[] = [];
  let held: ((err?: Error) => void)[] = [];
  const stream = new Writable({
    highWaterMark,
    decodeStrings: false,
    write(chunk: string, _enc, callback) {
      received.push(chunk);
      held.push(callback);
    },
  });
  const release = (): void => {
    const now = held;
    held = [];
    for (const cb of now) cb();
  };
  const fail = (): void => {
    const now = held;
    held = [];
    for (const cb of now) cb(new Error("EPIPE"));
  };
  return { stream, received, release, fail };
}

describe("createOutputSink", () => {
  it("returns nothing to wait on while the stream is under its high-water mark", () => {
    const c = slowConsumer(1_024);
    const sink = createOutputSink(c.stream);
    expect(sink.write("small\n")).toBeUndefined();
    expect(sink.produced).toBe(true);
  });

  it("hands back a promise under back-pressure that settles only on drain", async () => {
    const c = slowConsumer(8);
    const sink = createOutputSink(c.stream);
    const wait = sink.write("more than eight characters\n");
    expect(wait).toBeInstanceOf(Promise);

    let settled = false;
    void wait?.then(() => (settled = true));
    await new Promise((r) => setImmediate(r));
    expect(settled).toBe(false); // the consumer has not read anything yet

    c.release();
    await wait;
    expect(settled).toBe(true);
    await sink.flushed();
    expect(sink.delivered).toBe(true);
    expect(c.received.join("")).toBe("more than eight characters\n");
  });

  it("flushed() waits for every write to be acknowledged", async () => {
    const c = slowConsumer(1_024);
    const sink = createOutputSink(c.stream);
    void sink.write("a\n");
    void sink.write("b\n");
    let done = false;
    const flushed = sink.flushed().then(() => (done = true));
    await new Promise((r) => setImmediate(r));
    expect(done).toBe(false);
    // The stream hands writes over one at a time, so the second arrives only after the first is
    // acknowledged.
    c.release();
    await new Promise((r) => setImmediate(r));
    expect(done).toBe(false);
    c.release();
    await flushed;
    expect(done).toBe(true);
    expect(sink.delivered).toBe(true);
  });

  it("flushed() resolves at once when nothing is outstanding", async () => {
    const c = slowConsumer(1_024);
    const sink = createOutputSink(c.stream);
    await sink.flushed();
    expect(sink.produced).toBe(false);
    expect(sink.delivered).toBe(true);
  });

  it("a write that fails marks the output undelivered", async () => {
    const c = slowConsumer(1_024);
    const sink = createOutputSink(c.stream);
    c.stream.on("error", () => undefined);
    void sink.write("a\n");
    const flushed = sink.flushed();
    c.fail();
    await flushed;
    expect(sink.delivered).toBe(false);
  });

  it("a stream that errors while we wait for drain releases the wait, and the next write throws", async () => {
    const c = slowConsumer(4);
    const sink = createOutputSink(c.stream);
    const wait = sink.write("past the mark\n");
    expect(wait).toBeInstanceOf(Promise);
    c.stream.destroy(new Error("EPIPE"));
    await wait;
    expect(sink.open).toBe(false);
    expect(() => sink.write("again\n")).toThrow();
    expect(sink.delivered).toBe(false);
  });

  it("a stream that closes while we wait for drain releases the wait", async () => {
    const c = slowConsumer(4);
    const sink = createOutputSink(c.stream);
    const wait = sink.write("past the mark\n");
    c.stream.destroy();
    await wait;
    expect(sink.open).toBe(false);
  });
});
