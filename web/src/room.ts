// One open room: the CRDT state, its clock and the actions a user can take.
// No React and no DOM here, so it can be tested in Node.
import {
  MAX_COMMENT_CHARS,
  ROOT_ID,
  addMove,
  apply,
  clockFromLog,
  deriveTree,
  emptyState,
  isOp,
  moveIdOf,
  newClock,
  observe,
  setComment,
  setDeleted,
  setMainline,
} from "@blunder/core";
import type { MoveId, Op, State, TreeNode } from "@blunder/core";
import { chessRules } from "./chess/rules";
import type { Store } from "./sync/types";
import { createValueStore } from "./valueStore";

export type MoveNode = TreeNode<string>;

// What the interface draws. A new object is built after every change, so
// React can compare views by identity.
export interface RoomView {
  root: MoveNode;
  deletedLines: MoveNode[];
  visible: Map<MoveId, MoveNode>; // every visible move by id, the root included
}

export interface Room {
  replicaId: string;
  subscribe(listener: () => void): () => void;
  view(): RoomView;

  // Returns the id of the move, which then exists and is visible.
  playMove(parentId: MoveId, uci: string): Promise<MoveId>;
  // Plays the moves one after another and returns the id of the last one.
  playLine(parentId: MoveId, ucis: string[]): Promise<MoveId>;
  promote(moveId: MoveId): Promise<void>;
  setDeleted(moveId: MoveId, deleted: boolean): Promise<void>;
  setComment(moveId: MoveId, text: string): Promise<void>;

  applyRemoteOps(ops: Op[]): void;

  // The move itself, or its closest ancestor that is still shown.
  nearestVisible(moveId: MoveId): MoveId;
}

function buildView(state: State): RoomView {
  const { root, deletedLines } = deriveTree(state, chessRules);
  const visible = new Map<MoveId, MoveNode>();
  const index = (node: MoveNode): void => {
    visible.set(node.id, node);
    node.children.forEach(index);
  };
  index(root);
  return { root, deletedLines, visible };
}

export async function openRoom(store: Store, notifyLocalOp: (op: Op) => void): Promise<Room> {
  const replicaId = await store.loadReplicaId();
  const log = (await store.loadLog()).filter(isOp);

  const state = emptyState();
  for (const op of log) apply(state, op);
  // Continue after the highest counter ever stored. Starting again at 0
  // would reuse timestamps, and new edits would lose to old ones.
  const clock = newClock(replicaId, clockFromLog(log));

  const applied = new Set(log.map((op) => op.opId));
  const views = createValueStore(buildView(state));

  function refresh(): void {
    views.set(buildView(state));
  }

  // Saved before it is applied: once the user sees an edit, a reload must
  // not lose it. Sent last, because the outbox already guarantees delivery.
  async function commit(op: Op): Promise<void> {
    await store.saveLocalOp(op);
    apply(state, op);
    applied.add(op.opId);
    refresh();
    notifyLocalOp(op);
  }

  async function playMove(parentId: MoveId, uci: string): Promise<MoveId> {
    const id = moveIdOf(parentId, uci);
    if (views.get().visible.has(id)) return id;
    // The parent is visible, so a known but hidden move can only be hidden
    // by its own deleted flag. Adding it again would change nothing.
    const op = state.moves.has(id) ? setDeleted(clock, id, false) : addMove(clock, parentId, uci);
    await commit(op);
    return id;
  }

  return {
    replicaId,

    subscribe: views.subscribe,
    view: views.get,

    playMove,

    async playLine(parentId, ucis) {
      let id = parentId;
      for (const uci of ucis) id = await playMove(id, uci);
      return id;
    },

    async promote(moveId) {
      const move = state.moves.get(moveId);
      if (move) await commit(setMainline(clock, move.parentId, moveId));
    },

    async setDeleted(moveId, deleted) {
      await commit(setDeleted(clock, moveId, deleted));
    },

    async setComment(moveId, text) {
      const trimmed = text.slice(0, MAX_COMMENT_CHARS);
      const current = state.comments.get(moveId)?.text ?? "";
      if (trimmed !== current) await commit(setComment(clock, moveId, trimmed));
    },

    applyRemoteOps(ops) {
      // The server echoes every operation back to its sender, so a batch
      // often holds nothing new and the tree need not be rebuilt.
      let changed = false;
      for (const op of ops) {
        observe(clock, op.ts);
        if (applied.has(op.opId)) continue;
        apply(state, op);
        applied.add(op.opId);
        changed = true;
      }
      if (changed) refresh();
    },

    nearestVisible(moveId) {
      let id = moveId;
      while (!views.get().visible.has(id)) {
        id = state.moves.get(id)?.parentId ?? ROOT_ID;
      }
      return id;
    },
  };
}
