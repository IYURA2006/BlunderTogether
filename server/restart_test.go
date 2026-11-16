package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/coder/websocket"
)

func TestSeqContinuesAfterServerRestart(t *testing.T) {
	dbPath := tempDB(t)

	first := startServer(t, dbPath)
	a := mustJoin(t, first, 0)
	check(t, a.push("a1", "a2", "a3"))
	check(t, a.waitFor(3, 3))
	first.stop()

	second := startServer(t, dbPath)
	b := mustJoin(t, second, 3)
	check(t, b.push("b1", "b2"))
	check(t, b.waitFor(2, 2))
	checkSeqs(t, b.ops, 4)

	stored, err := second.store.opsAfter(testRoom, 0)
	check(t, err)
	checkSeqs(t, stored, 1)
	checkIDs(t, stored, "a1", "a2", "a3", "b1", "b2")
}

func TestSeqContinuesAfterIdleRoomReopens(t *testing.T) {
	ts := startServer(t, tempDB(t))

	a := mustJoin(t, ts, 0)
	check(t, a.push("a1", "a2"))
	check(t, a.waitFor(2, 2))
	check(t, a.ws.Close(websocket.StatusNormalClosure, ""))

	// The handler returns only after it has left the room, so once all
	// handlers are done the room must be gone.
	ts.srv.conns.Wait()
	ts.srv.hub.mu.Lock()
	running := len(ts.srv.hub.rooms)
	ts.srv.hub.mu.Unlock()
	if running != 0 {
		t.Fatalf("%d rooms still running after the last client left", running)
	}

	b := mustJoin(t, ts, 0)
	check(t, b.push("b1"))
	check(t, b.waitFor(3, 1))
	checkSeqs(t, b.ops, 1)
	checkIDs(t, b.ops, "a1", "a2", "b1")
}

// The first server stops between commit and ack, as a crash would. The
// client never hears back, reconnects to a new server over the same file
// and sends the operation again.
func TestCrashAfterCommitStoresOperationOnce(t *testing.T) {
	dbPath := tempDB(t)

	committed := make(chan struct{})
	release := make(chan struct{})
	crashing := startServer(t, dbPath, func(s *server) {
		s.hub.afterCommit = func() {
			close(committed)
			<-release
		}
	})
	// Registered after startServer, so it runs before the server is stopped
	// and lets the blocked room finish.
	t.Cleanup(func() { close(release) })

	a := mustJoin(t, crashing, 0)
	check(t, a.push("lost-ack"))
	<-committed
	a.ws.CloseNow()

	restarted := startServer(t, dbPath)
	b := mustJoin(t, restarted, 0)
	check(t, b.push("lost-ack"))
	check(t, b.waitFor(1, 1))
	check(t, b.push("next"))
	check(t, b.waitFor(2, 2))
	checkSeqs(t, b.ops, 1)
	checkIDs(t, b.ops, "lost-ack", "next")

	stored, err := restarted.store.opsAfter(testRoom, 0)
	check(t, err)
	checkSeqs(t, stored, 1)
	checkIDs(t, stored, "lost-ack", "next")
}

func TestShutdownClosesClients(t *testing.T) {
	ts := startServer(t, tempDB(t))

	c := mustJoin(t, ts, 0)
	check(t, c.push("a"))
	check(t, c.waitFor(1, 1))

	ts.stop()

	_, err := c.read()
	if err == nil || errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("read after shutdown: %v, want a closed connection", err)
	}
}

func TestHealthz(t *testing.T) {
	ts := startServer(t, tempDB(t))

	resp, err := http.Get(ts.http.URL + "/healthz")
	check(t, err)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestStaticFiles(t *testing.T) {
	dir := t.TempDir()
	check(t, os.WriteFile(filepath.Join(dir, "index.html"), []byte("<p>app</p>"), 0o644))
	ts := startServer(t, tempDB(t), func(s *server) { s.static = dir })

	resp, err := http.Get(ts.http.URL + "/")
	check(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	check(t, err)
	if resp.StatusCode != http.StatusOK || string(body) != "<p>app</p>" {
		t.Fatalf("got %d %q, want the index page", resp.StatusCode, body)
	}
}
