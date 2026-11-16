/// <reference types="vite/client" />
// The vectors in testdata/ are shared with the Go side, so they define what
// "the same state" means across languages.
import { describe, expect, test } from "vitest";
import { canonicalize, isOp } from "./index";
import type { Op } from "./index";
import { stateFrom } from "./testing";

interface Vector {
  name: string;
  ops: Op[];
  expected: unknown;
}

const files = import.meta.glob<Vector>("../../testdata/*.json", {
  eager: true,
  import: "default",
});

function resultOf(ops: Op[]): unknown {
  return JSON.parse(canonicalize(stateFrom(ops)));
}

test("testdata holds at least the two starting vectors", () => {
  expect(Object.keys(files).length).toBeGreaterThanOrEqual(2);
});

describe.each(Object.values(files))("vector: $name", ({ ops, expected }) => {
  test("every operation passes the shape check", () => {
    expect(ops.every(isOp)).toBe(true);
  });

  test("given order", () => {
    expect(resultOf(ops)).toEqual(expected);
  });

  test("reversed order", () => {
    expect(resultOf([...ops].reverse())).toEqual(expected);
  });

  test("every operation delivered twice", () => {
    expect(resultOf([...ops, ...ops])).toEqual(expected);
  });
});
