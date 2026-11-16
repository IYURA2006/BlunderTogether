package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/coder/websocket"
)

func TestCatchUpFromCursor(t *testing.T) {
	ts := startServer(t, tempDB(t))

	a := mustJoin(t, ts, 0)
	check(t, a.push("a1", "a2", "a3", "a4", "a5"))
	check(t, a.waitFor(5, 5))

	b := mustJoin(t, ts, 3)
	check(t, b.waitFor(2, 0))
	checkSeqs(t, b.ops, 4)
	checkIDs(t, b.ops, "a4", "a5")
}

func TestCatchUpIsSentInBatches(t *testing.T) {
	ts := startServer(t, tempDB(t))

	const total = 3 * maxOpsPerPush
	a := mustJoin(t, ts, 0)
	for i := 0; i < total; i += maxOpsPerPush {
		ids := make([]string, maxOpsPerPush)
		for j := range ids {
			ids[j] = fmt.Sprintf("op-%d", i+j)
		}
		check(t, a.push(ids...))
	}
	check(t, a.waitFor(total, total))

	b := mustJoin(t, ts, 0)
	first, err := b.read()
	check(t, err)
	second, err := b.read()
	check(t, err)
	if len(first.Ops) != maxOpsPerMessage || len(second.Ops) != total-maxOpsPerMessage {
		t.Fatalf("batches of %d and %d operations, want %d and %d",
			len(first.Ops), len(second.Ops), maxOpsPerMessage, total-maxOpsPerMessage)
	}
	checkSeqs(t, b.ops, 1)
}

func TestDuplicatePushIsStoredOnceAndAcked(t *testing.T) {
	ts := startServer(t, tempDB(t))

	a := mustJoin(t, ts, 0)
	check(t, a.push("x", "y"))
	check(t, a.waitFor(2, 2))

	// y is a resend, z is new: both are acked, only z is broadcast.
	check(t, a.push("y", "z"))
	check(t, a.waitFor(3, 4))

	// A push with nothing new is acked and broadcasts nothing, so the next
	// operation the client sees is w.
	check(t, a.push("x"))
	check(t, a.push("w"))
	check(t, a.waitFor(4, 6))

	checkSeqs(t, a.ops, 1)
	checkIDs(t, a.ops, "x", "y", "z", "w")
	if got := strings.Join(a.acked, ","); got != "x,y,y,z,x,w" {
		t.Fatalf("acked %s, want x,y,y,z,x,w", got)
	}

	stored, err := ts.store.opsAfter(testRoom, 0)
	check(t, err)
	checkSeqs(t, stored, 1)
	checkIDs(t, stored, "x", "y", "z", "w")
}

func TestTwoClientsSeeTheSameOrder(t *testing.T) {
	ts := startServer(t, tempDB(t))

	const perClient = 20
	clients := map[string]*client{"a": mustJoin(t, ts, 0), "b": mustJoin(t, ts, 0)}

	var wg sync.WaitGroup
	for name, c := range clients {
		wg.Go(func() {
			for i := range perClient {
				if err := c.push(fmt.Sprintf("%s%d", name, i)); err != nil {
					t.Errorf("client %s: %v", name, err)
					return
				}
				if err := c.waitFor(0, i+1); err != nil {
					t.Errorf("client %s: %v", name, err)
					return
				}
			}
			if err := c.waitFor(2*perClient, perClient); err != nil {
				t.Errorf("client %s: %v", name, err)
			}
		})
	}
	wg.Wait()
	if t.Failed() {
		return
	}

	a, b := clients["a"], clients["b"]
	checkSeqs(t, a.ops, 1)
	checkSeqs(t, b.ops, 1)
	for i := range a.ops {
		if opID(t, a.ops[i]) != opID(t, b.ops[i]) {
			t.Fatalf("seq %d is %q for a and %q for b", a.ops[i].Seq, opID(t, a.ops[i]), opID(t, b.ops[i]))
		}
	}
}

// Clients keep connecting, reading a little and reconnecting from their
// cursor while another client pushes. Whenever they join, what they read
// must continue exactly from the cursor they sent.
func TestHelloDuringPushesSeesNoGap(t *testing.T) {
	ts := startServer(t, tempDB(t))

	const pushes, perPush, joiners = 100, 3, 4
	const total = pushes * perPush

	var wg sync.WaitGroup
	wg.Go(func() {
		pusher, err := join(t, ts, 0)
		if err != nil {
			t.Errorf("pusher: %v", err)
			return
		}
		for i := range pushes {
			err := pusher.push(fmt.Sprintf("p%d-0", i), fmt.Sprintf("p%d-1", i), fmt.Sprintf("p%d-2", i))
			if err == nil {
				err = pusher.waitFor(0, (i+1)*perPush)
			}
			if err != nil {
				t.Errorf("pusher: %v", err)
				return
			}
		}
	})

	for j := range joiners {
		wg.Go(func() {
			var cursor int64
			for cursor < total {
				c, err := join(t, ts, cursor)
				if err != nil {
					t.Errorf("joiner %d: %v", j, err)
					return
				}
				for range 3 {
					if cursor+int64(len(c.ops)) == total {
						break
					}
					if _, err := c.read(); err != nil {
						t.Errorf("joiner %d: %v", j, err)
						return
					}
				}
				for _, op := range c.ops {
					if op.Seq != cursor+1 {
						t.Errorf("joiner %d: got seq %d after %d", j, op.Seq, cursor)
						return
					}
					cursor = op.Seq
				}
				c.ws.CloseNow()
			}
		})
	}
	wg.Wait()
}

func TestSlowClientIsDisconnected(t *testing.T) {
	ts := startServer(t, tempDB(t), func(s *server) { s.sendBuffer = 1 })

	fast := mustJoin(t, ts, 0)
	check(t, fast.push("first"))
	check(t, fast.waitFor(1, 1))

	// Reading the catch-up proves slow is in the room. After that it stops
	// reading.
	slow := mustJoin(t, ts, 0)
	check(t, slow.waitFor(1, 0))

	// Each broadcast is about 1 MiB. Twelve of them are more than the
	// kernel will hold for a client that does not read (the socket buffers
	// stop growing at a few MiB), so the server's writer stalls and the
	// one-message buffer fills.
	const bigPushes = 12
	pad := strings.Repeat("x", 1<<20)
	for i := range bigPushes {
		op := fmt.Sprintf(`{"opId":"big%d","pad":%q}`, i, pad)
		check(t, fast.sendText([]byte(`{"type":"push","ops":[`+op+`]}`)))
		check(t, fast.waitFor(i+2, i+2))
	}
	checkSeqs(t, fast.ops, 1)

	err := slow.waitFor(1+bigPushes, 0)
	if err == nil {
		t.Fatal("slow client received everything, want it disconnected")
	}
	if errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("slow client was left connected: %v", err)
	}

	check(t, fast.push("last"))
	check(t, fast.waitFor(bigPushes+2, bigPushes+2))
}

func TestProtocolErrors(t *testing.T) {
	hello := fmt.Sprintf(`{"type":"hello","roomId":%q,"since":0}`, testRoom)
	tooMany := make([]string, maxOpsPerPush+1)
	for i := range tooMany {
		tooMany[i] = fmt.Sprintf(`{"opId":"op-%d"}`, i)
	}

	tests := []struct {
		name   string
		frames []string
		want   string
	}{
		{"too many ops", []string{hello, `{"type":"push","ops":[` + strings.Join(tooMany, ",") + `]}`}, codeTooManyOps},
		{"bad room id", []string{`{"type":"hello","roomId":"too-short","since":0}`}, codeBadRoom},
		{"push before hello", []string{`{"type":"push","ops":[{"opId":"a"}]}`}, codeHelloRequired},
		{"second hello", []string{hello, hello}, codeHelloRequired},
		{"not JSON", []string{`hello`}, codeBadMessage},
		{"unknown type", []string{`{"type":"pull"}`}, codeBadMessage},
		{"negative since", []string{fmt.Sprintf(`{"type":"hello","roomId":%q,"since":-1}`, testRoom)}, codeBadMessage},
		{"fractional since", []string{fmt.Sprintf(`{"type":"hello","roomId":%q,"since":1.5}`, testRoom)}, codeBadMessage},
		{"empty push", []string{hello, `{"type":"push","ops":[]}`}, codeBadMessage},
		{"op is not an object", []string{hello, `{"type":"push","ops":["a"]}`}, codeBadMessage},
		{"op without opId", []string{hello, `{"type":"push","ops":[{"type":"addMove"}]}`}, codeBadMessage},
		{"opId is not a string", []string{hello, `{"type":"push","ops":[{"opId":7}]}`}, codeBadMessage},
		{"opId too long", []string{hello, `{"type":"push","ops":[{"opId":"` + strings.Repeat("a", maxOpIDLength+1) + `"}]}`}, codeBadMessage},
	}

	ts := startServer(t, tempDB(t))
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := mustDial(t, ts)
			for _, frame := range tc.frames {
				check(t, c.sendText([]byte(frame)))
			}

			msg, err := c.read()
			if msg.Type != typeError || msg.Code != tc.want {
				t.Fatalf("got %+v (%v), want error %s", msg, err, tc.want)
			}
			if msg.Message == "" {
				t.Error("error has no message")
			}

			_, err = c.read()
			if got := websocket.CloseStatus(err); got != websocket.StatusPolicyViolation {
				t.Fatalf("after the error: %v, want close status %d", err, websocket.StatusPolicyViolation)
			}
		})
	}

	// Nothing from the rejected pushes may have reached the log.
	stored, err := ts.store.opsAfter(testRoom, 0)
	check(t, err)
	if len(stored) != 0 {
		t.Fatalf("log holds %d operations, want none", len(stored))
	}
}

func TestPushAtTheLimitsIsAccepted(t *testing.T) {
	ts := startServer(t, tempDB(t))

	ids := make([]string, maxOpsPerPush)
	for i := range ids {
		ids[i] = fmt.Sprintf("%0*d", maxOpIDLength, i)
	}
	c := mustJoin(t, ts, 0)
	check(t, c.push(ids...))
	check(t, c.waitFor(maxOpsPerPush, maxOpsPerPush))
	checkSeqs(t, c.ops, 1)
}

func TestOversizedFrameClosesWith1009(t *testing.T) {
	ts := startServer(t, tempDB(t))

	c := mustJoin(t, ts, 0)
	check(t, c.sendText([]byte(strings.Repeat(" ", maxMessageBytes+1))))

	_, err := c.read()
	if got := websocket.CloseStatus(err); got != websocket.StatusMessageTooBig {
		t.Fatalf("got %v, want close status %d", err, websocket.StatusMessageTooBig)
	}
}
