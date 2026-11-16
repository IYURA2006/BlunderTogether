// Command server is the BlunderTogether sync server.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

const shutdownTimeout = 10 * time.Second

type server struct {
	hub        *hub
	static     string
	sendBuffer int

	// ctx lives as long as the server. Cancelling it ends every WebSocket
	// connection; conns counts their handlers so close can wait for them.
	ctx    context.Context
	cancel context.CancelFunc
	conns  sync.WaitGroup
}

func newServer(st *store, static string) *server {
	ctx, cancel := context.WithCancel(context.Background())
	return &server{
		hub:        newHub(st),
		static:     static,
		sendBuffer: defaultSendBuffer,
		ctx:        ctx,
		cancel:     cancel,
	}
}

func (s *server) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("GET /ws", s.handleWS)
	if s.static != "" {
		mux.Handle("GET /", http.FileServer(http.Dir(s.static)))
	}
	return mux
}

// close ends every WebSocket connection and waits for the handlers. When it
// returns no room is running and nothing uses the store. The HTTP server
// must have stopped accepting before, or a new handler could start mid-wait.
func (s *server) close() {
	s.cancel()
	s.conns.Wait()
}

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "blunder.db", "SQLite file")
	static := flag.String("static", "", "folder with the built web app; empty serves none")
	flag.Parse()

	if err := run(*addr, *dbPath, *static); err != nil {
		log.Fatal(err)
	}
}

func run(addr, dbPath, static string) error {
	st, err := openStore(dbPath)
	if err != nil {
		return fmt.Errorf("open database %s: %w", dbPath, err)
	}
	defer st.close()

	srv := newServer(st, static)
	// Test hook: e2e/restart.test.ts uses it to stop the process between commit and ack.
	if os.Getenv("CRASH_AFTER_COMMIT") == "1" {
		srv.hub.afterCommit = func() { os.Exit(3) }
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	httpServer := &http.Server{Handler: srv.handler()}
	serveErr := make(chan error, 1)
	go func() { serveErr <- httpServer.Serve(ln) }()
	log.Printf("listening on %s", ln.Addr())

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	log.Print("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	// Shutdown stops accepting and waits for plain HTTP requests. It leaves
	// WebSocket connections alone, so those are closed separately.
	err = httpServer.Shutdown(shutdownCtx)
	srv.close()
	if errors.Is(err, context.DeadlineExceeded) {
		return nil
	}
	return err
}
