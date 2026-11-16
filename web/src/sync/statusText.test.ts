import { expect, test } from "vitest";
import { describeStatus } from "./statusText";

test("says whether the server is reachable and how many changes are unsent", () => {
  expect(describeStatus({ connected: true, unsent: 0 })).toBe("Connected, all changes sent");
  expect(describeStatus({ connected: false, unsent: 0 })).toBe("Offline, no changes waiting");
  expect(describeStatus({ connected: false, unsent: 1 })).toBe("Offline, 1 change waiting");
  expect(describeStatus({ connected: true, unsent: 12 })).toBe("Connected, sending 12 changes");
});
