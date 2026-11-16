package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// testTimeout bounds every network step, so a missing message fails the
// test instead of hanging it.
const testTimeout = 10 * time.Second

const testRoom = "room-0123456789abcdef"

type testServer struct {
	srv     *server
	store   *store
	http    *httptest.Server
	stopped bool
}

// startServer runs a server over the database file. The configure functions
// run before it accepts connections.
func startServer(t *testing.T, dbPath string, configure ...func(*server)) *testServer {
	t.Helper()
	st, err := openStore(dbPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	srv := newServer(st, "")
	for _, fn := range configure {
		fn(srv)
	}
	ts := &testServer{srv: srv, store: st, http: httptest.NewServer(srv.handler())}
	t.Cleanup(ts.stop)
	return ts
}

// stop shuts the server down in the same order as main.
func (ts *testServer) stop() {
	if ts.stopped {
		return
	}
	ts.stopped = true
	ts.http.Close()
	ts.srv.close()
	ts.store.close()
}

func tempDB(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "test.db")
}

// client is a WebSocket client that remembers every operation and ack it
// has read.
type client struct {
	ws    *websocket.Conn
	ops   []seqOp
	acked []string
}

func dial(t *testing.T, ts *testServer) (*client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()
	url := "ws" + strings.TrimPrefix(ts.http.URL, "http") + "/ws"
	ws, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		return nil, err
	}
	ws.SetReadLimit(-1)
	t.Cleanup(func() { ws.CloseNow() })
	return &client{ws: ws}, nil
}

func mustDial(t *testing.T, ts *testServer) *client {
	t.Helper()
	c, err := dial(t, ts)
	check(t, err)
	return c
}

// join dials and says hello.
func join(t *testing.T, ts *testServer, since int64) (*client, error) {
	c, err := dial(t, ts)
	if err != nil {
		return nil, err
	}
	return c, c.send(clientMessage{Type: typeHello, RoomID: testRoom, Since: since})
}

func mustJoin(t *testing.T, ts *testServer, since int64) *client {
	t.Helper()
	c, err := join(t, ts, since)
	check(t, err)
	return c
}

func (c *client) sendText(text []byte) error {
	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()
	return c.ws.Write(ctx, websocket.MessageText, text)
}

func (c *client) send(msg any) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return c.sendText(data)
}

func (c *client) push(opIDs ...string) error {
	ops := make([]json.RawMessage, len(opIDs))
	for i, id := range opIDs {
		ops[i] = testOp(id)
	}
	return c.send(clientMessage{Type: typePush, Ops: ops})
}

// read returns the next message and records its operations or acks.
func (c *client) read() (serverMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()
	var msg serverMessage
	_, data, err := c.ws.Read(ctx)
	if err != nil {
		return msg, err
	}
	if err := json.Unmarshal(data, &msg); err != nil {
		return msg, err
	}
	switch msg.Type {
	case typeOps:
		c.ops = append(c.ops, msg.Ops...)
	case typeAck:
		c.acked = append(c.acked, msg.OpIDs...)
	default:
		return msg, fmt.Errorf("unexpected %s message: %s %s", msg.Type, msg.Code, msg.Message)
	}
	return msg, nil
}

// waitFor reads until the client has seen at least this many operations and
// acks. It does not assume an order between an ack and its broadcast.
func (c *client) waitFor(ops, acks int) error {
	for len(c.ops) < ops || len(c.acked) < acks {
		if _, err := c.read(); err != nil {
			return fmt.Errorf("have %d ops and %d acks, want %d and %d: %w",
				len(c.ops), len(c.acked), ops, acks, err)
		}
	}
	return nil
}

func (c *client) lastSeq() int64 {
	if len(c.ops) == 0 {
		return 0
	}
	return c.ops[len(c.ops)-1].Seq
}

func testOp(id string) json.RawMessage {
	return json.RawMessage(fmt.Sprintf(`{"type":"addMove","opId":%q}`, id))
}

func opID(t *testing.T, op seqOp) string {
	t.Helper()
	var head struct {
		OpID string `json:"opId"`
	}
	check(t, json.Unmarshal(op.Op, &head))
	return head.OpID
}

func check(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// checkSeqs fails unless the operations are numbered first, first+1, ...
// with no gap and no repeat.
func checkSeqs(t *testing.T, ops []seqOp, first int64) {
	t.Helper()
	for i, op := range ops {
		if want := first + int64(i); op.Seq != want {
			t.Fatalf("operation %d has seq %d, want %d", i, op.Seq, want)
		}
	}
}

func checkIDs(t *testing.T, ops []seqOp, want ...string) {
	t.Helper()
	if len(ops) != len(want) {
		t.Fatalf("got %d operations, want %d", len(ops), len(want))
	}
	for i, op := range ops {
		if got := opID(t, op); got != want[i] {
			t.Fatalf("operation %d is %q, want %q", i, got, want[i])
		}
	}
}
