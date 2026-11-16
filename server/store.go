package main

import (
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

// pushedOp is one operation from a push: its id and the JSON exactly as sent.
type pushedOp struct {
	id      string
	payload json.RawMessage
}

type store struct {
	db *sql.DB
}

func openStore(path string) (*store, error) {
	// The pragmas go in the DSN so that every connection the pool opens gets
	// them. synchronous=FULL makes a commit wait for the disk, which is what
	// lets an ack mean "stored".
	dsn := path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(FULL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite takes one writer at a time. With a single connection the rooms
	// queue up inside database/sql instead of failing with SQLITE_BUSY.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &store{db: db}, nil
}

func (s *store) close() error {
	return s.db.Close()
}

// maxSeq returns the highest seq stored for the room, or 0 for an empty room.
func (s *store) maxSeq(roomID string) (int64, error) {
	var seq int64
	err := s.db.QueryRow(`SELECT COALESCE(MAX(seq), 0) FROM ops WHERE room_id = ?`, roomID).Scan(&seq)
	return seq, err
}

// appendOps stores the operations the room does not have yet, numbering them
// from lastSeq+1, in one transaction. It returns only the newly stored ones.
func (s *store) appendOps(roomID string, lastSeq int64, ops []pushedOp) ([]seqOp, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// The conflict target names only the op_id index. A clash on (room_id, seq)
	// would mean two writers for one room, and must fail loudly.
	const insert = `INSERT INTO ops (room_id, seq, op_id, payload) VALUES (?, ?, ?, ?)
		ON CONFLICT (room_id, op_id) DO NOTHING`

	var stored []seqOp
	seq := lastSeq
	for _, op := range ops {
		res, err := tx.Exec(insert, roomID, seq+1, op.id, string(op.payload))
		if err != nil {
			return nil, err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return nil, err
		}
		if n == 0 {
			continue
		}
		seq++
		stored = append(stored, seqOp{Seq: seq, Op: op.payload})
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return stored, nil
}

// opsAfter returns the room's operations with seq > since, in seq order.
func (s *store) opsAfter(roomID string, since int64) ([]seqOp, error) {
	rows, err := s.db.Query(`SELECT seq, payload FROM ops WHERE room_id = ? AND seq > ? ORDER BY seq`, roomID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ops []seqOp
	for rows.Next() {
		var seq int64
		var payload string
		if err := rows.Scan(&seq, &payload); err != nil {
			return nil, err
		}
		ops = append(ops, seqOp{Seq: seq, Op: json.RawMessage(payload)})
	}
	return ops, rows.Err()
}
