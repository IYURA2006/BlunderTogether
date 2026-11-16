package main

import (
	"encoding/json"
	"log"
)

// Requests a connection sends to its room's inbox.
type (
	joinRequest struct {
		c     *conn
		since int64
	}
	leaveRequest struct {
		c *conn
	}
	pushRequest struct {
		c   *conn
		ops []pushedOp
	}
)

// room is one goroutine that owns a room's client list and is the only
// writer of that room's log. Everything reaches it through inbox, so its
// fields need no lock and every client sees events in the order it handled
// them.
type room struct {
	id          string
	store       *store
	afterCommit func()
	inbox       chan any

	clients map[*conn]struct{}
	lastSeq int64
}

func newRoom(id string, st *store, afterCommit func()) *room {
	return &room{
		id:          id,
		store:       st,
		afterCommit: afterCommit,
		inbox:       make(chan any),
		clients:     make(map[*conn]struct{}),
	}
}

// run handles requests until the hub closes the inbox.
func (r *room) run() {
	lastSeq, err := r.store.maxSeq(r.id)
	if err != nil {
		log.Printf("room %s: read last seq: %v", r.id, err)
		r.refuseAll()
		return
	}
	r.lastSeq = lastSeq

	for req := range r.inbox {
		switch req := req.(type) {
		case joinRequest:
			r.join(req.c, req.since)
		case leaveRequest:
			delete(r.clients, req.c)
		case pushRequest:
			r.push(req.c, req.ops)
		}
	}
}

// refuseAll is what a room that could not start does instead of run: it
// keeps receiving so that no connection blocks on the inbox, and turns every
// client away.
func (r *room) refuseAll() {
	for req := range r.inbox {
		if join, ok := req.(joinRequest); ok {
			join.c.drop()
		}
	}
}

// join queues the log after since for the client and only then adds it to
// the client list. No push is handled in between, so the first broadcast the
// client gets follows directly on the last operation of its catch-up.
func (r *room) join(c *conn, since int64) {
	ops, err := r.store.opsAfter(r.id, since)
	if err != nil {
		log.Printf("room %s: read log: %v", r.id, err)
		c.drop()
		return
	}
	for len(ops) > 0 {
		n := min(len(ops), maxOpsPerMessage)
		if !c.send(encode(serverMessage{Type: typeOps, Ops: ops[:n]})) {
			return
		}
		ops = ops[n:]
	}
	r.clients[c] = struct{}{}
}

func (r *room) push(c *conn, ops []pushedOp) {
	stored, err := r.store.appendOps(r.id, r.lastSeq, ops)
	if err != nil {
		// Nothing was stored, so there is no ack. Dropping the sender makes
		// it reconnect and send the push again.
		log.Printf("room %s: append: %v", r.id, err)
		c.drop()
		return
	}
	if len(stored) > 0 {
		r.lastSeq = stored[len(stored)-1].Seq
		if r.afterCommit != nil {
			r.afterCommit()
		}
	}

	opIDs := make([]string, len(ops))
	for i, op := range ops {
		opIDs[i] = op.id
	}
	c.send(encode(serverMessage{Type: typeAck, OpIDs: opIDs}))

	if len(stored) > 0 {
		r.broadcast(encode(serverMessage{Type: typeOps, Ops: stored}))
	}
}

func (r *room) broadcast(msg []byte) {
	for c := range r.clients {
		if !c.send(msg) {
			delete(r.clients, c)
		}
	}
}

// encode cannot fail for the messages built here: operation payloads were
// parsed as JSON before they were stored.
func encode(msg serverMessage) []byte {
	data, err := json.Marshal(msg)
	if err != nil {
		panic("encode server message: " + err.Error())
	}
	return data
}
