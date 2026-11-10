// The names of the benchmarks one group of shapes holds, one a line, for `cosyte-bench run --only`:
//   node bench/names.mjs hl7
// The Bench workflow reads each group in its own job.

import { benchmarkName, GROUPS, SHAPES } from "./cli.bench.mjs";

const group = process.argv[2];
if (group === undefined || !GROUPS.includes(group)) {
  process.stderr.write(`usage: node bench/names.mjs <${GROUPS.join(" | ")}>\n`);
  process.exit(2);
}
for (const shape of SHAPES) {
  if (shape.group !== group) continue;
  for (const op of shape.ops) process.stdout.write(`${benchmarkName(shape, op)}\n`);
}
