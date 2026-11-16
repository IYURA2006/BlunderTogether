import { useId, useState } from "react";
import type { SyncClient } from "../sync/types";

interface Props {
  sync: SyncClient;
}

const MAX_DELAY_MS = 5000;

// Controls for showing how the study behaves on a bad connection.
export function NetworkControls({ sync }: Props) {
  const sliderId = useId();
  const [offline, setOffline] = useState(false);
  const [delayMs, setDelayMs] = useState(0);

  function changeOffline(value: boolean): void {
    setOffline(value);
    sync.setOffline(value);
  }

  function changeDelay(value: number): void {
    setDelayMs(value);
    sync.setDelayMs(value);
  }

  return (
    <section className="network-controls">
      <h2>Try a bad connection</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={offline}
          onChange={(event) => changeOffline(event.target.checked)}
        />
        Work offline
      </label>
      <div className="slider">
        <label htmlFor={sliderId}>Delay every message</label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={MAX_DELAY_MS}
          step={250}
          value={delayMs}
          onChange={(event) => changeDelay(Number(event.target.value))}
        />
        <output htmlFor={sliderId}>{(delayMs / 1000).toFixed(2)} s</output>
      </div>
      <p className="hint">
        Changes made offline stay on this device and merge with everyone else's when you reconnect.
      </p>
    </section>
  );
}
