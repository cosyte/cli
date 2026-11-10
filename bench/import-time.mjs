// One cold import, for bench/profile.mjs: `node bench/import-time.mjs <url> [files]` imports the
// module at <url> in this fresh process and prints, as JSON, how long the import took. With `files`
// it instead records every file the import loads (through a synchronous module hook) and prints
// their paths, for their sizes. Nothing else is loaded first, so the import is cold.

import { registerHooks } from "node:module";

const [url, mode] = process.argv.slice(2);
if (url === undefined) {
  process.stderr.write("usage: node bench/import-time.mjs <url> [files]\n");
  process.exit(2);
}

if (mode === "files") {
  const files = new Set();
  registerHooks({
    load(next, context, nextLoad) {
      if (next.startsWith("file:")) files.add(next);
      return nextLoad(next, context);
    },
  });
  await import(url);
  process.stdout.write(JSON.stringify({ files: [...files] }));
} else {
  const start = performance.now();
  await import(url);
  process.stdout.write(JSON.stringify({ ms: performance.now() - start }));
}
