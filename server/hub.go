package main

import "sync"

// hub is the registry of running rooms.
//
// How a room stopping cannot race with a client joining it: the hub counts
// the connections that hold each room, and that count is the only thing that
// starts or stops a room. Both changes happen under mu. A connection sends to
// a room only between its own join and leave, so when leave brings the count
// to zero no sender is left and closing the inbox is safe. A hello that
// arrives at that moment waits for mu, finds no entry and starts a new room.
// The old room has already received every request sent to it, so no commit is
// in flight when the new one reads its starting seq from the database.
type hub struct {
	store       *store
	afterCommit func()

	mu    sync.Mutex
	rooms map[string]*entry
}

type entry struct {
	room  *room
	conns int
}

func newHub(st *store) *hub {
	return &hub{store: st, rooms: make(map[string]*entry)}
}

// join adds the connection to the room, starting the room if it is not
// running, and returns the room for later pushes.
func (h *hub) join(roomID string, c *conn, since int64) *room {
	h.mu.Lock()
	e := h.rooms[roomID]
	if e == nil {
		e = &entry{room: newRoom(roomID, h.store, h.afterCommit)}
		h.rooms[roomID] = e
		go e.room.run()
	}
	e.conns++
	h.mu.Unlock()

	e.room.inbox <- joinRequest{c: c, since: since}
	return e.room
}

// leave removes the connection from the room and stops the room if that was
// its last connection.
func (h *hub) leave(r *room, c *conn) {
	r.inbox <- leaveRequest{c: c}

	h.mu.Lock()
	defer h.mu.Unlock()
	e := h.rooms[r.id]
	e.conns--
	if e.conns == 0 {
		delete(h.rooms, r.id)
		close(r.inbox)
	}
}
