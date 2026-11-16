import { describeStatus } from "../sync/statusText";
import type { SyncStatus } from "../sync/types";

interface Props {
  status: SyncStatus;
}

export function ConnectionStatus({ status }: Props) {
  return (
    <p className="connection-status" role="status">
      <span className={status.connected ? "dot dot-connected" : "dot"} aria-hidden="true" />
      {describeStatus(status)}
    </p>
  );
}
