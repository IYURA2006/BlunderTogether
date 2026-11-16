import { cpus } from "node:os";
import { expect, inject, test } from "vitest";
import WebSocket from "ws";
import { runSimulation } from "../core/sim/simulation";
import { MAX_OPS_PER_PUSH } from "../web/src/sync/messages";
import type { ServerMessage } from "../web/src/sync/messages";
import { newRoomId } from "../web/src/roomId";
import { openRaw, rawOp } from "./rawSocket";
import { createTestServer } from "./server";
import { waitFor } from "./wait";

// Measurements for the README. Run with: npm run bench
const enabled = process.env.BENCH === "1";
const ROOM_OPS = 10_000;
const SIM_SEEDS = 1_000;

async function fillRoom(wsUrl: string, roomId: string): Promise<void> {
  const writer = await openRaw(wsUrl);
  writer.send({ type: "hello", roomId, since: 0 });
  for (let sent = 0; sent < ROOM_OPS; sent += MAX_OPS_PER_PUSH) {
    const ops = Array.from({ length: MAX_OPS_PER_PUSH }, (_, i) =>
      rawOp(`bench-${sent + i}`, sent + i + 1),
    );
    writer.send({ type: "push", ops });
  }
  const acked = () =>
    writer.messages.reduce((n, m) => (m.type === "ack" ? n + m.opIds.length : n), 0);
  await waitFor("every push to be acknowledged", () => acked() === ROOM_OPS);
  writer.close();
}

// Time and bytes for a new client to receive the whole log.
function catchUp(wsUrl: string, roomId: string): Promise<{ ms: number; bytes: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let started = 0;
    let bytes = 0;
    let received = 0;
    ws.on("error", reject);
    ws.on("open", () => {
      started = performance.now();
      ws.send(JSON.stringify({ type: "hello", roomId, since: 0 }));
    });
    ws.on("message", (data) => {
      const text = data.toString();
      bytes += Buffer.byteLength(text);
      const message = JSON.parse(text) as ServerMessage;
      if (message.type === "ops") received += message.ops.length;
      if (received === ROOM_OPS) {
        ws.close();
        resolve({ ms: performance.now() - started, bytes });
      }
    });
  });
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
}

test.runIf(enabled)("catch-up for a room with 10,000 operations", async () => {
  const server = await createTestServer(inject("serverBinary"));
  await server.start();
  try {
    const roomId = newRoomId();
    const fillStart = performance.now();
    await fillRoom(server.wsUrl, roomId);
    const fillMs = performance.now() - fillStart;

    const runs = [];
    for (let i = 0; i < 5; i++) runs.push(await catchUp(server.wsUrl, roomId));
    const ms = median(runs.map((run) => run.ms));
    const bytes = runs[0]!.bytes;

    console.log(`machine: ${cpus()[0]?.model}, Node ${process.version}`);
    console.log(
      `store ${ROOM_OPS} operations in pushes of ${MAX_OPS_PER_PUSH}: ${fillMs.toFixed(0)} ms`,
    );
    console.log(`catch-up of ${ROOM_OPS} operations, median of 5: ${ms.toFixed(0)} ms`);
    console.log(`catch-up size: ${bytes} bytes (${(bytes / ROOM_OPS).toFixed(0)} per operation)`);
    expect(bytes).toBeGreaterThan(0);
  } finally {
    await server.dispose();
  }
});

test.runIf(enabled)("simulation speed", () => {
  const start = performance.now();
  let created = 0;
  for (let seed = 0; seed < SIM_SEEDS; seed++) {
    const result = runSimulation({ seed });
    expect(result.converged).toBe(true);
    created += result.ops.length;
  }
  const seconds = (performance.now() - start) / 1000;
  console.log(`simulation: ${SIM_SEEDS} runs in ${seconds.toFixed(2)} s`);
  console.log(`simulation: ${Math.round(created / seconds)} operations created per second`);
});
