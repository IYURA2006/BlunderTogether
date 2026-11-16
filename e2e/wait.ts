// Polls until the condition holds. Fails with a message that names what was
// being waited for, so a timeout says which step got stuck.
export async function waitFor(
  what: string,
  condition: () => boolean,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// Gives pending socket events a chance to run between two test steps.
export function letNetworkRun(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
