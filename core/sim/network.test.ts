import { expect, test } from "vitest";
import { createNetwork } from "./network";
import { createRng } from "./rng";

interface Arrival {
  to: number;
  message: number;
}

function recordingNetwork(seed: number, replicaCount: number) {
  const arrivals: Arrival[] = [];
  const rng = createRng(seed);
  const network = createNetwork<number>(rng, replicaCount, (to, message) => {
    arrivals.push({ to, message });
  });
  return { network, arrivals, rng };
}

test("every message arrives at least once after the network heals", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { network, arrivals, rng } = recordingNetwork(seed, 3);
    for (let message = 0; message < 100; message++) {
      network.broadcast(rng.int(3), message);
      if (rng.chance(0.3)) network.setCut(rng.int(3), rng.chance(0.5));
      if (rng.chance(0.5)) network.deliverOne();
    }

    network.healAll();
    network.deliverAll();

    // 100 broadcasts, each to the two other replicas.
    const distinct = new Set(arrivals.map((a) => `${a.to}:${a.message}`));
    expect(distinct.size, `seed ${seed}`).toBe(200);
    expect(network.waiting()).toBe(0);
  }
});

test("a cut replica receives nothing until the network heals", () => {
  const { network, arrivals } = recordingNetwork(1, 2);
  network.setCut(1, true);
  network.send(0, 1, 7);

  expect(network.deliverOne()).toBe(false);
  expect(arrivals).toEqual([]);
  expect(network.waiting()).toBe(1);

  network.healAll();
  network.deliverAll();
  expect(arrivals[0]).toEqual({ to: 1, message: 7 });
});

test("messages from a cut replica wait as well", () => {
  const { network, arrivals } = recordingNetwork(1, 2);
  network.setCut(0, true);
  network.send(0, 1, 7);

  expect(network.deliverOne()).toBe(false);
  expect(arrivals).toEqual([]);
});

test("a sender does not receive its own broadcast", () => {
  const { network, arrivals } = recordingNetwork(1, 3);
  network.broadcast(0, 7);
  network.deliverAll();

  expect(arrivals.some((a) => a.to === 0)).toBe(false);
});

test("some messages arrive more than once", () => {
  const { network, arrivals } = recordingNetwork(1, 2);
  for (let message = 0; message < 200; message++) network.send(0, 1, message);
  network.deliverAll();

  expect(arrivals.length).toBeGreaterThan(200);
});

test("messages do not arrive in the order they were sent", () => {
  const { network, arrivals } = recordingNetwork(1, 2);
  for (let message = 0; message < 50; message++) network.send(0, 1, message);
  network.deliverAll();

  const order = arrivals.map((a) => a.message);
  expect(order).not.toEqual([...order].sort((a, b) => a - b));
});

test("delivering on an empty network does nothing", () => {
  const { network } = recordingNetwork(1, 2);
  expect(network.deliverOne()).toBe(false);
});
