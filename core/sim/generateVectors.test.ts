import { writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { runSimulation } from "./simulation";

// Not a test: writes simulation runs to testdata/ as shared test vectors.
// Skipped unless asked for:
//   GENERATE_VECTORS=1 npm run test:sim -- generateVectors
// The expected state comes from the code under test, so generate vectors
// only from a core whose tests pass, and read the diff before committing.
const RUNS = [
  { seed: 1, operations: 40 },
  { seed: 2, operations: 80 },
  { seed: 3, operations: 120 },
];

test.skipIf(process.env.GENERATE_VECTORS !== "1")("write simulation vectors to testdata", () => {
  for (const { seed, operations } of RUNS) {
    const result = runSimulation({ seed, operations });
    expect(result.converged, `seed ${seed} diverged`).toBe(true);

    const vector = {
      name: `simulation seed ${seed}, ${operations} operations`,
      ops: result.ops,
      expected: JSON.parse(result.canonical[0] as string) as unknown,
    };
    const file = new URL(`../../testdata/sim-seed-${seed}.json`, import.meta.url);
    writeFileSync(file, JSON.stringify(vector, null, 2) + "\n");
  }
});
