import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ROOT_ID } from "@blunder/core";
import type { MoveId } from "@blunder/core";
import { Board } from "./components/Board";
import { BoardControls } from "./components/BoardControls";
import { CommentBox } from "./components/CommentBox";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { CopyLinkButton } from "./components/CopyLinkButton";
import { DeletedLines } from "./components/DeletedLines";
import { EngineLine } from "./components/EngineLine";
import { HiddenWorkNotice } from "./components/HiddenWorkNotice";
import { MoveActions } from "./components/MoveActions";
import { MoveTree } from "./components/MoveTree";
import { NetworkControls } from "./components/NetworkControls";
import { OpeningMenu } from "./components/OpeningMenu";
import { OpeningName } from "./components/OpeningName";
import { PgnControls } from "./components/PgnControls";
import { openingLine, openingNameFor, positionsBackFrom } from "./openings/openings";
import type { Opening } from "./openings/list";
import { toPgn } from "./pgn/export";
import { importMessage, importPgn, pgnProblem } from "./pgn/import";
import { startNewStudy } from "./newStudy";
import type { Loaded } from "./newStudy";
import type { Session } from "./session";
import { deletedLineRows, findHiddenWork } from "./tree/deletedLines";
import { moveLabel } from "./tree/notation";
import { useArrowKeys } from "./useArrowKeys";

interface Props {
  session: Session;
  // Set when the study was just started from an opening or a game.
  loaded?: Loaded;
}

export function App({ session, loaded }: Props) {
  const { room, sync, status } = session;
  const view = useSyncExternalStore(room.subscribe, room.view);
  const syncStatus = useSyncExternalStore(status.subscribe, status.get);

  const [wantedId, setWantedId] = useState<MoveId>(loaded?.moveId ?? ROOT_ID);
  const [askedOpening, setAskedOpening] = useState<Opening | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [engineOn, setEngineOn] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // The move the user picked can vanish when anyone deletes its line. The
  // board then falls back to the closest move that is still shown.
  const selected = view.visible.get(room.nearestVisible(wantedId))!;
  const parent = selected.parentId === null ? undefined : view.visible.get(selected.parentId);
  const next = selected.children[0];
  const label = parent ? moveLabel(parent.position, selected.uci) : "";
  const hiddenWork = findHiddenWork(view.deletedLines, room.replicaId);

  // Every edit is written to this device before it shows. If that write
  // fails, the edit did not happen and the user has to know.
  const trackSave = useCallback(async (saving: Promise<unknown>): Promise<void> => {
    try {
      await saving;
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, []);

  const goBack = useCallback(() => {
    if (parent) setWantedId(parent.id);
  }, [parent]);
  const goForward = useCallback(() => {
    if (next) setWantedId(next.id);
  }, [next]);
  useArrowKeys(goBack, goForward);

  const play = (uci: string) => trackSave(room.playMove(selected.id, uci).then(setWantedId));
  const restore = (ids: MoveId[]) =>
    trackSave(Promise.all(ids.map((id) => room.setDeleted(id, false))));
  // Loading into a study that has moves would mix two studies for everyone
  // in the room, so it is offered as a new study with its own link.
  const hasMoves = view.root.children.length > 0 || view.deletedLines.length > 0;

  function loadOpening(opening: Opening): void {
    if (hasMoves) setAskedOpening(opening);
    else void trackSave(room.playLine(ROOT_ID, openingLine(opening)).then(setWantedId));
  }

  async function importGame(text: string): Promise<string> {
    if (hasMoves) {
      const problem = pgnProblem(text);
      if (problem === null) startNewStudy({ kind: "pgn", text });
      return problem ?? "";
    }
    try {
      const result = await importPgn(room, text);
      if (result.ok) setWantedId(result.lastId);
      setSaveFailed(false);
      return importMessage(result);
    } catch {
      setSaveFailed(true);
      return "";
    }
  }
  const selectedId = selected.id;
  const openingName = useMemo(
    () => openingNameFor(positionsBackFrom(view.visible, selectedId)),
    [view, selectedId],
  );
  const commitComment = useCallback(
    (text: string) => trackSave(room.setComment(selectedId, text)),
    [trackSave, room, selectedId],
  );

  return (
    <div className="app">
      <header className="masthead">
        <h1 className="wordmark">BlunderTogether</h1>
        <ConnectionStatus status={syncStatus} />
        <CopyLinkButton />
      </header>

      {saveFailed && (
        <p className="problem" role="alert">
          The last change could not be saved on this device, so it was not made. Check that the
          browser allows this site to store data, then try again.
        </p>
      )}

      <main className="study">
        <section className="board-column" aria-label="Board">
          <Board
            fen={selected.position}
            lastMove={selected.uci}
            orientation={orientation}
            onMove={play}
          />
          <EngineLine fen={selected.position} enabled={engineOn} onToggle={setEngineOn} />
          <BoardControls
            canGoBack={parent !== undefined}
            canGoForward={next !== undefined}
            onBack={goBack}
            onForward={goForward}
            onFlip={() => setOrientation(orientation === "white" ? "black" : "white")}
          />
          <div className="study-tools">
            <OpeningMenu onLoad={loadOpening} />
            <PgnControls
              exportPgn={() => toPgn(view.root)}
              onImport={importGame}
              startsNewStudy={hasMoves}
              initialMessage={loaded?.message ?? ""}
            />
          </div>
        </section>

        <section className="notation-column" aria-label="Moves and notes">
          <HiddenWorkNotice work={hiddenWork} onRestore={() => restore(hiddenWork.lineIds)} />
          <OpeningName name={openingName} />
          <MoveTree root={view.root} selectedId={selected.id} onSelect={setWantedId} />
          {parent && (
            <MoveActions
              label={label}
              canPromote={parent.children[0] !== selected}
              onPromote={() => trackSave(room.promote(selected.id))}
              onDelete={() => trackSave(room.setDeleted(selected.id, true))}
            />
          )}
          <CommentBox
            key={selected.id}
            label={parent ? `Note on ${label}` : "Note on the starting position"}
            saved={selected.comment}
            onCommit={commitComment}
          />
          <DeletedLines lines={deletedLineRows(view)} onRestore={(id) => restore([id])} />
        </section>
      </main>

      {askedOpening && (
        <ConfirmDialog
          title={`Start a new study with the ${askedOpening.name}?`}
          confirmLabel="Start a new study"
          onConfirm={() => startNewStudy({ kind: "opening", name: askedOpening.name })}
          onCancel={() => setAskedOpening(null)}
        >
          <p>
            This study already has moves. The opening is loaded into a new study with its own link.
            This one stays as it is, and the back button of the browser returns to it.
          </p>
        </ConfirmDialog>
      )}

      <footer className="footer">
        <NetworkControls sync={sync} />
      </footer>
    </div>
  );
}
