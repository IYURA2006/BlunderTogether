export type ReplicaId = string;

// "root" for the starting position, otherwise 32 hex characters.
export type MoveId = string;

export const ROOT_ID: MoveId = "root";

// Lamport timestamp. Ordered by counter, then by replicaId as a string.
export interface Ts {
  counter: number;
  replicaId: ReplicaId;
}

interface OpBase {
  opId: string;
  replicaId: ReplicaId;
  ts: Ts;
}

export interface AddMoveOp extends OpBase {
  type: "addMove";
  parentId: MoveId;
  uci: string;
}

export interface SetMainlineOp extends OpBase {
  type: "setMainline";
  parentId: MoveId;
  childId: MoveId;
}

export interface SetDeletedOp extends OpBase {
  type: "setDeleted";
  moveId: MoveId;
  deleted: boolean;
}

export interface SetCommentOp extends OpBase {
  type: "setComment";
  moveId: MoveId;
  text: string;
}

export type Op = AddMoveOp | SetMainlineOp | SetDeletedOp | SetCommentOp;

export interface MoveEntry {
  parentId: MoveId;
  uci: string;
  firstTs: Ts;
}

// Shared state: four maps. The visible tree is derived from them, never stored.
export interface State {
  moves: Map<MoveId, MoveEntry>;
  mainline: Map<MoveId, { childId: MoveId; ts: Ts }>;
  deleted: Map<MoveId, { deleted: boolean; ts: Ts }>;
  comments: Map<MoveId, { text: string; ts: Ts }>;
}

// One replica's Lamport clock. tick and observe change it in place.
export interface Clock {
  replicaId: ReplicaId;
  counter: number;
}

// Chess rules are passed in so core does not depend on a chess library.
// play returns the position after the move, or null if the move is illegal.
export interface Rules<P> {
  start: P;
  play(position: P, uci: string): P | null;
}

export interface TreeNode<P> {
  id: MoveId;
  parentId: MoveId | null; // null only for the root
  uci: string; // "" for the root
  position: P; // position after this move
  comment: string; // "" when there is none
  addedBy: ReplicaId; // firstTs.replicaId, "" for the root
  children: TreeNode<P>[]; // mainline child first, then earliest added
}

export interface Derived<P> {
  root: TreeNode<P>;
  // Subtrees hidden only by their own deleted flag, shown as they would
  // look after a restore. Sorted by id.
  deletedLines: TreeNode<P>[];
}

export const MAX_COMMENT_CHARS = 2000;
