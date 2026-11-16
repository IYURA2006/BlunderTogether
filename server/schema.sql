-- One append-only log per room.
CREATE TABLE IF NOT EXISTS ops (
  room_id TEXT    NOT NULL,
  seq     INTEGER NOT NULL,
  op_id   TEXT    NOT NULL,
  payload TEXT    NOT NULL,
  PRIMARY KEY (room_id, seq)
);

-- A resent operation hits this index and is skipped.
CREATE UNIQUE INDEX IF NOT EXISTS ops_room_op ON ops (room_id, op_id);
