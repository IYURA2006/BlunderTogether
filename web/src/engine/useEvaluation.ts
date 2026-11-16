import { useEffect, useState } from "react";
import { isGameOver } from "../chess/rules";
import { createEngine } from "./engine";
import type { Engine, EngineWorker } from "./engine";
import type { Evaluation } from "./uci";

// One engine for the page, started the first time it is needed.
let shared: Engine | null = null;

// The browser types its message handler more narrowly than EngineWorker
// does, so the compiler needs to be told that it fits.
function startWorker(): EngineWorker {
  const url = `${import.meta.env.BASE_URL}engine/stockfish.js`;
  return new Worker(url) as unknown as EngineWorker;
}

function engine(): Engine {
  shared ??= createEngine(startWorker);
  return shared;
}

interface Result {
  fen: string;
  evaluation: Evaluation;
}

// The engine's current view of the position, or null while there is none.
export function useEvaluation(fen: string, enabled: boolean): Evaluation | null {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!enabled || isGameOver(fen)) return;
    engine().analyse(fen, (evaluation) => setResult({ fen, evaluation }));
    return () => shared?.stop();
  }, [fen, enabled]);

  // A result for another position is stale, not wrong: it is just not shown.
  return enabled && result?.fen === fen ? result.evaluation : null;
}
