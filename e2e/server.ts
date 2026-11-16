import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = fileURLToPath(new URL("../server", import.meta.url));
const HEALTH_TIMEOUT_MS = 5000;

// Compiles the Go server into outDir and returns the path of the binary.
export function buildServer(outDir: string): string {
  const binary = join(outDir, "server");
  execFileSync("go", ["build", "-o", binary, "."], { cwd: SERVER_DIR, stdio: "inherit" });
  return binary;
}

export interface TestServer {
  readonly wsUrl: string;

  // Starts the process and waits until /healthz answers.
  start(env?: Record<string, string>): Promise<void>;

  // Exit code of the current process, or of the last one if none is running.
  // Null when a signal ended it.
  exited(): Promise<number | null>;

  stop(): Promise<number | null>; // SIGTERM, then waits for the exit
  kill(): Promise<void>; // SIGKILL, then waits for the exit

  // Kills the process if it still runs and deletes the database.
  dispose(): Promise<void>;
}

// If the test process dies without running its hooks, no server is left behind.
const running = new Set<ChildProcess>();
process.on("exit", () => {
  for (const child of running) child.kill("SIGKILL");
});

// One server on its own port with its own database file. start can be called
// again after stop or kill; the port and the database stay the same.
export async function createTestServer(binary: string): Promise<TestServer> {
  const address = `127.0.0.1:${await freePort()}`;
  const dir = mkdtempSync(join(tmpdir(), "blunder-e2e-db-"));
  const dbFile = join(dir, "test.db");
  let child: ChildProcess | null = null;
  let exit: Promise<number | null> = Promise.resolve(null);
  let output = "";

  async function start(env: Record<string, string> = {}): Promise<void> {
    if (child !== null) throw new Error("server is already running");
    output = "";
    const started = spawn(binary, ["-addr", address, "-db", dbFile], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    started.stdout.on("data", (chunk) => (output += chunk));
    started.stderr.on("data", (chunk) => (output += chunk));
    child = started;
    running.add(started);
    exit = new Promise((resolve) => {
      started.once("exit", (code) => {
        running.delete(started);
        if (child === started) child = null;
        resolve(code);
      });
    });
    await waitUntilHealthy();
  }

  async function waitUntilHealthy(): Promise<void> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (!(await isHealthy())) {
      if (child === null) {
        throw new Error(`server exited with code ${await exit} before it was healthy\n${output}`);
      }
      if (Date.now() > deadline) {
        await kill();
        throw new Error(`server did not answer /healthz on ${address}\n${output}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`http://${address}/healthz`);
      return response.status === 200;
    } catch {
      return false; // not listening yet
    }
  }

  async function stop(): Promise<number | null> {
    child?.kill("SIGTERM");
    return exit;
  }

  async function kill(): Promise<void> {
    child?.kill("SIGKILL");
    await exit;
  }

  async function dispose(): Promise<void> {
    await kill();
    rmSync(dir, { recursive: true, force: true });
  }

  return { wsUrl: `ws://${address}/ws`, start, exited: () => exit, stop, kill, dispose };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
