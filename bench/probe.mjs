// Loaded with `node --import` ahead of the `cosyte` bin by bench/profile.mjs, to read what one whole
// invocation held at its peak. It starts V8's GC profiler before the bin loads, and when the process
// exits it writes, to the file COSYTE_BENCH_PROBE_OUT names:
// - the peak V8 heap: the most heap in use just before any collection, or at exit;
// - the peak external memory (Buffers, ArrayBuffers), read the same way;
// - the peak resident set of the process, from the kernel (every byte: heap, Buffers, code);
// - how many collections ran.
// It reads sizes only, never the input or the output.

import { writeFileSync } from "node:fs";
import { getHeapStatistics, GCProfiler } from "node:v8";

const out = process.env["COSYTE_BENCH_PROBE_OUT"];
const profiler = new GCProfiler();
profiler.start();

process.on("exit", () => {
  const { statistics } = profiler.stop();
  const end = getHeapStatistics();
  let peakHeapBytes = end.used_heap_size;
  let peakExternalBytes = end.external_memory;
  for (const gc of statistics) {
    peakHeapBytes = Math.max(peakHeapBytes, gc.beforeGC.heapStatistics.usedHeapSize);
    peakExternalBytes = Math.max(peakExternalBytes, gc.beforeGC.heapStatistics.externalMemory);
  }
  const report = {
    peakHeapBytes,
    peakExternalBytes,
    peakResidentBytes: process.resourceUsage().maxRSS * 1024,
    collections: statistics.length,
  };
  if (out !== undefined) writeFileSync(out, JSON.stringify(report));
});
