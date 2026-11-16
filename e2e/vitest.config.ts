import { defineConfig } from "vitest/config";

// These tests start a real server process, so they need more time and must
// not share ports by running in parallel.
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    globalSetup: "./globalSetup.ts",
  },
});
