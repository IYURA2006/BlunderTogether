// Copies the prebuilt single-threaded Stockfish build into public/engine so
// the app can serve it from its own origin and keep working offline.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const bin = join(dirname(require.resolve("stockfish/package.json")), "bin");
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "engine");

mkdirSync(target, { recursive: true });
for (const extension of ["js", "wasm"]) {
  copyFileSync(
    join(bin, `stockfish-19-lite-single.${extension}`),
    join(target, `stockfish.${extension}`),
  );
}
copyFileSync(join(bin, "..", "Copying.txt"), join(target, "LICENSE.txt"));
