// Runs one position at a time on a UCI engine in a Web Worker. Results stay
// on this device: nothing here touches the operation log.
import { isBestMove, parseInfo } from "./uci";
import type { Evaluation } from "./uci";

// The part of Worker this module uses, so tests can pass a fake.
export interface EngineWorker {
  postMessage(command: string): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  terminate(): void;
}

export interface Engine {
  // Reports the evaluation of the position as it deepens. A new call
  // replaces the previous one.
  analyse(fen: string, onUpdate: (evaluation: Evaluation) => void): void;
  stop(): void;
  close(): void;
}

interface Request {
  fen: string;
  onUpdate(evaluation: Evaluation): void;
}

export function createEngine(startWorker: () => EngineWorker, depth = 18): Engine {
  const cache = new Map<string, Evaluation>();
  let worker: EngineWorker | null = null;
  let wanted: Request | null = null;
  let searching: string | null = null; // position the engine is working on
  let stopSent = false;

  function send(command: string): void {
    if (!worker) {
      worker = startWorker();
      worker.onmessage = (event) => receive(String(event.data));
      worker.postMessage("uci");
    }
    worker.postMessage(command);
  }

  function startWanted(): void {
    if (!wanted) return;
    searching = wanted.fen;
    send(`position fen ${wanted.fen}`);
    send(`go depth ${depth}`);
  }

  // The engine answers "stop" with a last "bestmove". Until that arrives its
  // output still belongs to the old position, so the next search waits.
  function interrupt(): void {
    if (searching !== null && !stopSent) {
      stopSent = true;
      send("stop");
    }
  }

  function receive(text: string): void {
    if (searching === null) return;

    if (isBestMove(text)) {
      if (wanted?.fen === searching && !stopSent) wanted = null;
      searching = null;
      stopSent = false;
      startWanted();
      return;
    }

    const evaluation = parseInfo(text);
    if (!evaluation) return;
    cache.set(searching, evaluation);
    if (wanted?.fen === searching) wanted.onUpdate(evaluation);
  }

  return {
    analyse(fen, onUpdate) {
      const known = cache.get(fen);
      if (known) onUpdate(known);
      if (known && known.depth >= depth) {
        wanted = null;
        interrupt();
        return;
      }
      wanted = { fen, onUpdate };
      if (searching === fen && !stopSent) return;
      if (searching === null) startWanted();
      else interrupt();
    },

    stop() {
      wanted = null;
      interrupt();
    },

    close() {
      worker?.terminate();
      worker = null;
      wanted = null;
      searching = null;
      stopSent = false;
    },
  };
}
