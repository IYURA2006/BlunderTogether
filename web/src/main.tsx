import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Notice } from "./components/Notice";
import { acquireRoomLock } from "./lock";
import { loadInto, takeWaitingLoad } from "./newStudy";
import { newRoomId, roomIdFromHash } from "./roomId";
import { startSession } from "./session";
import "./styles.css";

// The lock and the room are set up before React starts. Inside a component
// they would run twice in development (StrictMode), and the second run would
// find the room locked by the first.
async function openPage(): Promise<ReactNode> {
  if (window.location.hash.length <= 1) {
    window.history.replaceState(null, "", `#${newRoomId()}`);
  }
  const roomId = roomIdFromHash(window.location.hash);

  if (roomId === null) {
    return (
      <Notice title="This link does not lead to a study">
        <p>The part of the address after # is not a study this app could have made.</p>
        <p>
          <a href="#">Start a new study</a>
        </p>
      </Notice>
    );
  }

  if (!(await acquireRoomLock(roomId))) {
    return (
      <Notice title="This room is open in another tab">
        <p>
          Keep working in that tab. To use this one instead, close the other tab and reload this
          page.
        </p>
      </Notice>
    );
  }

  try {
    const session = await startSession(roomId);
    const waiting = takeWaitingLoad();
    const loaded = waiting ? await loadInto(session.room, waiting) : undefined;
    return <App session={session} loaded={loaded} />;
  } catch {
    return (
      <Notice title="This study could not be opened">
        <p>
          The browser did not let this site read its saved data. Private windows and strict privacy
          settings can cause this.
        </p>
      </Notice>
    );
  }
}

// A different room means a different database and lock, so start over.
window.addEventListener("hashchange", () => window.location.reload());

const page = await openPage();
createRoot(document.getElementById("root")!).render(<StrictMode>{page}</StrictMode>);
