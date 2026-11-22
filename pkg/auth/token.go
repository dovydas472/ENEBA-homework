package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"time"
)

// SessionTTL is how long a session (and its cookie, Max-Age) lives: 7 days (owner decision A3).
// It is not extended on use, so a stolen cookie stops working after at most a week.
const SessionTTL = 7 * 24 * time.Hour

// tokenBytes is the size of a session token: 32 random bytes = 256 bits.
// Guessing one is hopeless (there are 2^256 possibilities).
const tokenBytes = 32

// tokenEncoding writes the token into the cookie: URL-safe base64 without padding
// (43 characters, only A-Z a-z 0-9 - _), so it needs no escaping in a cookie.
var tokenEncoding = base64.RawURLEncoding

// NewSessionToken makes a new session token from crypto/rand (the operating
// system's secure random source - never math/rand, which is predictable).
// It returns the token for the cookie and the SHA-256 for the database.
func NewSessionToken() (token string, hash []byte, err error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("auth: read token: %w", err)
	}
	sum := sha256.Sum256(raw)
	return tokenEncoding.EncodeToString(raw), sum[:], nil
}

// HashSessionToken turns the token from a cookie into the value stored in
// sessions.token_hash. ok is false for anything that is not a token we could
// have issued (wrong length, not base64): such a cookie is ignored without
// asking the database.
//
// Why the database keeps only the hash: if the sessions table leaks (a backup,
// a log, an SQL injection somewhere), the attacker gets hashes, and a hash
// cannot be put into a cookie. A plain SHA-256 is enough here (no salt, no
// argon2): the token is 256 random bits, not a human password, so there is
// nothing to guess, and the lookup needs the same input to give the same hash.
func HashSessionToken(token string) (hash []byte, ok bool) {
	raw, err := tokenEncoding.Strict().DecodeString(token)
	if err != nil || len(raw) != tokenBytes {
		return nil, false
	}
	sum := sha256.Sum256(raw)
	return sum[:], true
}
