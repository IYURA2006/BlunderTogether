import { expect, test } from "vitest";
import { syncUrl } from "./url";

test("the sync address is /ws on the page's own origin", () => {
  expect(syncUrl({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws");
  expect(syncUrl({ protocol: "https:", host: "chess.example" })).toBe("wss://chess.example/ws");
});

test("an override replaces it", () => {
  const page = { protocol: "https:", host: "chess.example" };
  expect(syncUrl(page, "ws://other:8080/ws")).toBe("ws://other:8080/ws");
  expect(syncUrl(page, "")).toBe("wss://chess.example/ws");
});
