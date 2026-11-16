package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"
	"unicode/utf8"

	"github.com/coder/websocket"
)

const (
	// defaultSendBuffer is how many messages may wait for one client. A
	// catch-up is queued in one go, so this also caps a catch-up at
	// defaultSendBuffer * maxOpsPerMessage operations.
	defaultSendBuffer = 64

	// rejectTimeout bounds the error message and close handshake sent to a
	// client that broke the protocol and may not be reading.
	rejectTimeout = 5 * time.Second
)

var roomIDRegexp = regexp.MustCompile(roomIDPattern)

// protocolError is a rule the client broke. It is sent as an error message
// before the connection is closed.
type protocolError struct {
	code    string
	message string
}

func (e *protocolError) Error() string {
	return e.code + ": " + e.message
}

func protoErr(code, message string) error {
	return &protocolError{code: code, message: message}
}

// conn is one WebSocket client. The handler goroutine reads from it and a
// second goroutine writes whatever the room queues in out.
type conn struct {
	ws   *websocket.Conn
	out  chan []byte
	drop context.CancelFunc
}

// send queues a message without ever blocking the room. A client whose
// buffer is full is dropped; it reconnects and catches up from its cursor.
func (c *conn) send(msg []byte) bool {
	select {
	case c.out <- msg:
		return true
	default:
		c.drop()
		return false
	}
}

func (s *server) handleWS(w http.ResponseWriter, r *http.Request) {
	s.conns.Add(1)
	defer s.conns.Done()

	// Any origin may connect. There are no cookies or logins, so a page on
	// another site gains nothing a direct connection would not give it.
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{"*"}})
	if err != nil {
		return
	}
	defer ws.CloseNow()
	ws.SetReadLimit(maxMessageBytes)

	ctx, cancel := context.WithCancel(s.ctx)
	defer cancel()
	c := &conn{ws: ws, out: make(chan []byte, s.sendBuffer), drop: cancel}

	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		c.writeLoop(ctx)
	}()

	err = c.readLoop(ctx, s.hub)
	var perr *protocolError
	if errors.As(err, &perr) {
		c.reject(ctx, perr)
	}
	cancel()
	<-writerDone
}

func (c *conn) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.out:
			if err := c.ws.Write(ctx, websocket.MessageText, msg); err != nil {
				c.drop()
				return
			}
		}
	}
}

// readLoop handles client messages until the connection ends or the client
// breaks a rule. It leaves the room before it returns.
func (c *conn) readLoop(ctx context.Context, h *hub) error {
	var joined *room
	defer func() {
		if joined != nil {
			h.leave(joined, c)
		}
	}()

	for {
		msg, err := c.readMessage(ctx)
		if err != nil {
			return err
		}
		switch msg.Type {
		case typeHello:
			if joined != nil {
				return protoErr(codeHelloRequired, "hello was already sent")
			}
			if err := checkHello(msg); err != nil {
				return err
			}
			joined = h.join(msg.RoomID, c, msg.Since)
		case typePush:
			if joined == nil {
				return protoErr(codeHelloRequired, "hello must be the first message")
			}
			ops, err := parsePush(msg.Ops)
			if err != nil {
				return err
			}
			joined.inbox <- pushRequest{c: c, ops: ops}
		default:
			return protoErr(codeBadMessage, fmt.Sprintf("unknown message type %q", msg.Type))
		}
	}
}

func (c *conn) readMessage(ctx context.Context) (clientMessage, error) {
	var msg clientMessage
	kind, data, err := c.ws.Read(ctx)
	if err != nil {
		return msg, err
	}
	// Payloads are relayed to browsers in text frames, and a browser fails a
	// connection that receives invalid UTF-8. One such operation in the log
	// would lock everyone out of the room.
	if kind != websocket.MessageText || !utf8.Valid(data) {
		return msg, protoErr(codeBadMessage, "message must be a UTF-8 text frame")
	}
	if err := json.Unmarshal(data, &msg); err != nil {
		return msg, protoErr(codeBadMessage, "message is not valid JSON of the expected shape")
	}
	return msg, nil
}

func checkHello(msg clientMessage) error {
	if !roomIDRegexp.MatchString(msg.RoomID) {
		return protoErr(codeBadRoom, "room id must match "+roomIDPattern)
	}
	if msg.Since < 0 {
		return protoErr(codeBadMessage, "since must be 0 or more")
	}
	return nil
}

// parsePush checks the shape of a push and pulls out each opId, the only
// part of an operation the server reads.
func parsePush(raw []json.RawMessage) ([]pushedOp, error) {
	if len(raw) == 0 {
		return nil, protoErr(codeBadMessage, "push must carry at least one operation")
	}
	if len(raw) > maxOpsPerPush {
		message := fmt.Sprintf("push carries %d operations, the limit is %d", len(raw), maxOpsPerPush)
		return nil, protoErr(codeTooManyOps, message)
	}
	ops := make([]pushedOp, len(raw))
	for i, payload := range raw {
		var head struct {
			OpID string `json:"opId"`
		}
		if err := json.Unmarshal(payload, &head); err != nil {
			return nil, protoErr(codeBadMessage, "each operation must be an object with a string opId")
		}
		if n := utf8.RuneCountInString(head.OpID); n < 1 || n > maxOpIDLength {
			return nil, protoErr(codeBadMessage, fmt.Sprintf("opId must be 1 to %d characters", maxOpIDLength))
		}
		ops[i] = pushedOp{id: head.OpID, payload: payload}
	}
	return ops, nil
}

// reject tells the client which rule it broke and closes the connection.
func (c *conn) reject(ctx context.Context, perr *protocolError) {
	ctx, cancel := context.WithTimeout(ctx, rejectTimeout)
	defer cancel()
	msg := encode(serverMessage{Type: typeError, Code: perr.code, Message: perr.message})
	if err := c.ws.Write(ctx, websocket.MessageText, msg); err != nil {
		return
	}
	c.ws.Close(websocket.StatusPolicyViolation, perr.code)
}
