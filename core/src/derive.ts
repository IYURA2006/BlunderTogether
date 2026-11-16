import { compareStrings, compareTs } from "./compare";
import { ROOT_ID } from "./types";
import type { Derived, MoveId, Rules, State, TreeNode } from "./types";

// Builds the tree the user sees. It is computed on demand and never stored,
// so the shared state stays four flat maps that merge field by field.
export function deriveTree<P>(state: State, rules: Rules<P>): Derived<P> {
  const childIds = childIdsByParent(state);
  const deletedLines: TreeNode<P>[] = [];

  // Fills node.children. Inside a deleted line, nested deleted moves are
  // dropped: the line is shown as it would look after a restore.
  const addChildren = (node: TreeNode<P>, insideDeletedLine: boolean): void => {
    for (const id of childIds.get(node.id) ?? []) {
      const move = state.moves.get(id)!;
      // Operations are not checked for legality when applied, so an illegal
      // move can be in state. It is filtered here, with everything below it.
      const position = rules.play(node.position, move.uci);
      if (position === null) continue;

      const child: TreeNode<P> = {
        id,
        parentId: node.id,
        uci: move.uci,
        position,
        comment: state.comments.get(id)?.text ?? "",
        addedBy: move.firstTs.replicaId,
        children: [],
      };
      const deleted = state.deleted.get(id)?.deleted === true;
      if (!deleted) {
        addChildren(child, insideDeletedLine);
        node.children.push(child);
      } else if (!insideDeletedLine) {
        addChildren(child, true);
        deletedLines.push(child);
      }
    }
    moveMainlineFirst(node, state.mainline.get(node.id)?.childId);
  };

  const root: TreeNode<P> = {
    id: ROOT_ID,
    parentId: null,
    uci: "",
    position: rules.start,
    comment: state.comments.get(ROOT_ID)?.text ?? "",
    addedBy: "",
    children: [],
  };
  addChildren(root, false);
  deletedLines.sort((a, b) => compareStrings(a.id, b.id));
  return { root, deletedLines };
}

// Children are grouped by parentId, earliest move first. Where nobody chose
// a main line, the move that was played first stays in front. firstTs is the
// smallest timestamp any replica saw for the move, so the order is the same
// everywhere and does not depend on arrival. A move whose parent never
// arrived sits under a key nobody visits, so it needs no special handling.
function childIdsByParent(state: State): Map<MoveId, MoveId[]> {
  const byParent = new Map<MoveId, MoveId[]>();
  for (const [id, move] of state.moves) {
    const siblings = byParent.get(move.parentId);
    if (siblings) siblings.push(id);
    else byParent.set(move.parentId, [id]);
  }
  const firstTs = (id: MoveId) => state.moves.get(id)!.firstTs;
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => compareTs(firstTs(a), firstTs(b)) || compareStrings(a, b));
  }
  return byParent;
}

// The main line register may name a move that is deleted, illegal, not yet
// received or under another parent. Looking only among the visible children
// ignores all of those, and the first-added order stays as the fallback.
function moveMainlineFirst<P>(node: TreeNode<P>, mainlineId: MoveId | undefined): void {
  const index = node.children.findIndex((child) => child.id === mainlineId);
  if (index > 0) {
    const [mainline] = node.children.splice(index, 1);
    node.children.unshift(mainline!);
  }
}
