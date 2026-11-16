// core is compiled without DOM or Node types. This is the one global it uses;
// browsers and Node 20 both provide it.
declare const crypto: { randomUUID(): string };
