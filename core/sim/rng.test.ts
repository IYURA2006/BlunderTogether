import { expect, test } from "vitest";
import { createRng } from "./rng";

function firstNumbers(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

test("the same seed gives the same sequence", () => {
  expect(firstNumbers(42, 100)).toEqual(firstNumbers(42, 100));
});

test("different seeds give different sequences", () => {
  expect(firstNumbers(1, 10)).not.toEqual(firstNumbers(2, 10));
});

test("next stays in [0, 1)", () => {
  for (const value of firstNumbers(7, 1000)) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }
});

test("int reaches every value below n and nothing else", () => {
  const rng = createRng(3);
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i++) seen.add(rng.int(5));
  expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
});

test("pick returns an item from the list", () => {
  const rng = createRng(5);
  const items = ["a", "b", "c"];
  for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
});

test("pick refuses an empty list", () => {
  expect(() => createRng(1).pick([])).toThrow("empty");
});

test("chance follows its probability", () => {
  const rng = createRng(9);
  let hits = 0;
  for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits++;
  expect(hits).toBeGreaterThan(2700);
  expect(hits).toBeLessThan(3300);
});

test("chance never fires at 0 and always fires at 1", () => {
  const rng = createRng(11);
  for (let i = 0; i < 100; i++) {
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
  }
});
