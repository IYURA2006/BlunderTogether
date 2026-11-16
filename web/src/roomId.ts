import { ROOM_ID_PATTERN } from "./sync/messages";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ROOM_ID_LENGTH = 22;

// The id is the only thing protecting a room, so it must be unguessable:
// 22 characters of 6 random bits each. 64 divides 256, so taking the low
// six bits of a random byte favours no character.
export function newRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_ID_LENGTH));
  return Array.from(bytes, (byte) => ALPHABET[byte % 64]).join("");
}

// Reads the room id from a URL hash such as "#k3J9xQ2mVb7LpR4t".
// Returns null when the hash is empty or is not a valid room id.
export function roomIdFromHash(hash: string): string | null {
  const id = hash.replace(/^#/, "");
  return ROOM_ID_PATTERN.test(id) ? id : null;
}
