import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { buildServer } from "./server";

declare module "vitest" {
  export interface ProvidedContext {
    serverBinary: string;
  }
}

// Builds the server once for the whole run. Test files read the path with
// inject("serverBinary").
export default function setup(project: TestProject): () => void {
  const dir = mkdtempSync(join(tmpdir(), "blunder-e2e-bin-"));
  try {
    project.provide("serverBinary", buildServer(dir));
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return () => rmSync(dir, { recursive: true, force: true });
}
