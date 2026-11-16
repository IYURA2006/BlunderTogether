package main

// Mirrors docs/PROTOCOL.md and web/src/sync/messages.ts.

import "encoding/json"

const (
	maxOpsPerPush    = 200
	maxOpsPerMessage = 500
	maxMessageBytes  = 4 << 20
	maxOpIDLength    = 64
	roomIDPattern    = `^[A-Za-z0-9_-]{16,64}$`
)

const (
	typeHello = "hello"
	typePush  = "push"
	typeOps   = "ops"
	typeAck   = "ack"
	typeError = "error"
)

const (
	codeBadMessage    = "bad_message"
	codeBadRoom       = "bad_room"
	codeHelloRequired = "hello_required"
	codeTooManyOps    = "too_many_ops"
)

// clientMessage is a hello or a push. Operations stay as raw JSON because
// the server stores and relays them without reading anything but opId.
type clientMessage struct {
	Type   string            `json:"type"`
	RoomID string            `json:"roomId,omitempty"`
	Since  int64             `json:"since,omitempty"`
	Ops    []json.RawMessage `json:"ops,omitempty"`
}

type seqOp struct {
	Seq int64           `json:"seq"`
	Op  json.RawMessage `json:"op"`
}

// serverMessage is an ops, ack or error message, depending on Type.
type serverMessage struct {
	Type    string   `json:"type"`
	Ops     []seqOp  `json:"ops,omitempty"`
	OpIDs   []string `json:"opIds,omitempty"`
	Code    string   `json:"code,omitempty"`
	Message string   `json:"message,omitempty"`
}
