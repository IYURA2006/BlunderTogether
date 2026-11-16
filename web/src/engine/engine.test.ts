import { expect, test } from "vitest";
import { createEngine } from "./engine";
import type { EngineWorker } from "./engine";
import type { Evaluation } from "./uci";

const A = "fen-a";
const B = "fen-b";

function setup(depth = 3) {
  const sent: string[] = [];
  const worker: EngineWorker = {
    postMessage: (command) => sent.push(command),
    onmessage: null,
    terminate: () => sent.push("terminated"),
  };
  let started = 0;
  const engine = createEngine(() => {
    started += 1;
    return worker;
  }, depth);
  const say = (text: string) => worker.onmessage?.({ data: text });
  const info = (d: number, move: string) => say(`info depth ${d} score cp ${d * 10} pv ${move}`);
  return { engine, sent, say, info, started: () => started };
}

function collect() {
  const seen: Evaluation[] = [];
  return { seen, onUpdate: (evaluation: Evaluation) => seen.push(evaluation) };
}

test("starts the worker only when a position is first analysed", () => {
  const { engine, sent, started } = setup();
  expect(started()).toBe(0);
  engine.analyse(A, () => {});
  expect(started()).toBe(1);
  expect(sent).toEqual(["uci", `position fen ${A}`, "go depth 3"]);
});

test("reports each deeper evaluation of the wanted position", () => {
  const { engine, info } = setup();
  const a = collect();
  engine.analyse(A, a.onUpdate);
  info(1, "e2e4");
  info(2, "d2d4");
  expect(a.seen.map((e) => e.depth)).toEqual([1, 2]);
  expect(a.seen[1]?.line).toEqual(["d2d4"]);
});

test("a new position stops the search and starts only after the engine confirms", () => {
  const { engine, sent, say, info } = setup();
  const a = collect();
  const b = collect();
  engine.analyse(A, a.onUpdate);
  engine.analyse(B, b.onUpdate);
  expect(sent.at(-1)).toBe("stop");

  // Output that arrives before "bestmove" still describes the old position.
  info(2, "e2e4");
  expect(a.seen).toEqual([]);
  expect(b.seen).toEqual([]);

  say("bestmove e2e4");
  expect(sent.slice(-2)).toEqual([`position fen ${B}`, "go depth 3"]);
  info(1, "c2c4");
  expect(b.seen.map((e) => e.line[0])).toEqual(["c2c4"]);
});

test("switching positions quickly sends stop once", () => {
  const { engine, sent } = setup();
  engine.analyse(A, () => {});
  engine.analyse(B, () => {});
  engine.analyse(A, () => {});
  engine.analyse(B, () => {});
  expect(sent.filter((command) => command === "stop")).toHaveLength(1);
});

test("going back to the position being stopped searches it again", () => {
  const { engine, sent, say } = setup();
  engine.analyse(A, () => {});
  engine.analyse(B, () => {});
  engine.analyse(A, () => {});
  say("bestmove e2e4");
  expect(sent.slice(-2)).toEqual([`position fen ${A}`, "go depth 3"]);
});

test("a finished position is answered from the cache without a new search", () => {
  const { engine, sent, say, info } = setup();
  engine.analyse(A, () => {});
  info(3, "e2e4");
  say("bestmove e2e4");
  const commands = sent.length;

  const again = collect();
  engine.analyse(A, again.onUpdate);
  expect(again.seen.map((e) => e.depth)).toEqual([3]);
  expect(sent).toHaveLength(commands);
});

test("a half-searched position shows its cached result and keeps searching", () => {
  const { engine, sent, say, info } = setup();
  engine.analyse(A, () => {});
  info(1, "e2e4");
  engine.analyse(B, () => {});
  say("bestmove e2e4");
  say("bestmove c2c4");

  const again = collect();
  engine.analyse(A, again.onUpdate);
  expect(again.seen.map((e) => e.depth)).toEqual([1]);
  expect(sent.slice(-2)).toEqual([`position fen ${A}`, "go depth 3"]);
});

test("stop ends the search and reports nothing more", () => {
  const { engine, sent, say, info } = setup();
  const a = collect();
  engine.analyse(A, a.onUpdate);
  engine.stop();
  expect(sent.at(-1)).toBe("stop");
  info(2, "e2e4");
  say("bestmove e2e4");
  expect(a.seen).toEqual([]);
  expect(sent.at(-1)).toBe("stop");
});

test("close terminates the worker", () => {
  const { engine, sent } = setup();
  engine.analyse(A, () => {});
  engine.close();
  expect(sent.at(-1)).toBe("terminated");
});
