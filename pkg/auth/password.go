// Package auth holds everything about accounts and sign-in that does not
// depend on HTTP: password hashing, session tokens, input validation and the
// database store (users, sessions, failed sign-ins). The HTTP handlers that use
// it are in pkg/server.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argon2id parameters (owner decision A2 = the OWASP Password Storage Cheat
// Sheet minimum for argon2id): 19 MiB of memory, 2 passes, 1 thread.
//
// Why argon2id and not SHA-256: SHA-256 is built to be FAST - a graphics card
// tries billions of guesses per second against a leaked hash. argon2id is built
// to be SLOW and MEMORY-HUNGRY on purpose: every guess needs 19 MiB of RAM and
// two passes over it, so guessing in parallel on a GPU becomes expensive.
// The salt (random per password) makes equal passwords get different hashes,
// so one precomputed table cannot crack every account at once.
type params struct {
	memoryKiB uint32 // m
	time      uint32 // t (passes over the memory)
	threads   uint8  // p
	saltLen   int
	keyLen    int
}

var defaultParams = params{memoryKiB: 19 * 1024, time: 2, threads: 1, saltLen: 16, keyLen: 32}

// Upper bounds for a STORED hash. The parameters are read from the encoded
// string, so a tampered string with m=4 GiB must not be able to make the server
// allocate 4 GiB. Anything outside these bounds is rejected before hashing.
const (
	maxMemoryKiB = 64 * 1024 // 64 MiB
	maxTime      = 10
	maxThreads   = 4
	minSaltLen   = 8
	maxSaltLen   = 64
	minKeyLen    = 16
	maxKeyLen    = 64
)

// ErrMalformedHash means a stored hash is not a valid argon2id PHC string
// (or its parameters are out of bounds). Verify treats it as "wrong password".
var ErrMalformedHash = errors.New("auth: malformed password hash")

// b64 is the encoding the PHC string format uses: standard base64 without "=" padding.
var b64 = base64.RawStdEncoding

// HashPassword returns the PHC-style string that is stored in users.password_hash:
//
//	$argon2id$v=19$m=19456,t=2,p=1$<salt, base64>$<hash, base64>
//
// The parameters travel inside the string, so they can be raised later
// without breaking the hashes that are already stored.
func HashPassword(password string) (string, error) {
	salt := make([]byte, defaultParams.saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: read salt: %w", err)
	}
	p := defaultParams
	key := argon2.IDKey([]byte(password), salt, p.time, p.memoryKiB, p.threads, uint32(p.keyLen))
	return encodeHash(p, salt, key), nil
}

func encodeHash(p params, salt, key []byte) string {
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, p.memoryKiB, p.time, p.threads, b64.EncodeToString(salt), b64.EncodeToString(key))
}

// VerifyPassword reports whether password matches the stored PHC string.
// It re-hashes the password with the salt and parameters from the string and
// compares the two hashes in CONSTANT TIME (subtle.ConstantTimeCompare): a normal
// == stops at the first different byte, and that timing difference could leak
// how many leading bytes of a guess were right.
// A malformed string is a non-match (and ErrMalformedHash), never a panic.
func VerifyPassword(encoded, password string) (bool, error) {
	p, salt, want, err := decodeHash(encoded)
	if err != nil {
		return false, err
	}
	got := argon2.IDKey([]byte(password), salt, p.time, p.memoryKiB, p.threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// decodeHash parses and bounds-checks "$argon2id$v=19$m=..,t=..,p=..$salt$hash".
func decodeHash(encoded string) (params, []byte, []byte, error) {
	// "" / "argon2id" / "v=19" / "m=..,t=..,p=.." / salt / hash
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return params{}, nil, nil, ErrMalformedHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return params{}, nil, nil, ErrMalformedHash
	}
	var p params
	if n, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memoryKiB, &p.time, &p.threads); err != nil || n != 3 {
		return params{}, nil, nil, ErrMalformedHash
	}
	// Re-encoding must give back exactly the same text: this rejects leftovers
	// such as "m=19456,t=2,p=1x" that Sscanf would silently ignore.
	if fmt.Sprintf("m=%d,t=%d,p=%d", p.memoryKiB, p.time, p.threads) != parts[3] {
		return params{}, nil, nil, ErrMalformedHash
	}
	if p.memoryKiB < 8*uint32(p.threads) || p.memoryKiB > maxMemoryKiB ||
		p.time < 1 || p.time > maxTime || p.threads < 1 || p.threads > maxThreads {
		return params{}, nil, nil, ErrMalformedHash
	}
	salt, err := b64.Strict().DecodeString(parts[4])
	if err != nil || len(salt) < minSaltLen || len(salt) > maxSaltLen {
		return params{}, nil, nil, ErrMalformedHash
	}
	key, err := b64.Strict().DecodeString(parts[5])
	if err != nil || len(key) < minKeyLen || len(key) > maxKeyLen {
		return params{}, nil, nil, ErrMalformedHash
	}
	return p, salt, key, nil
}

// dummyHash is a well-formed hash with the CURRENT parameters that no password
// matches (its hash part is all zero bytes). Sign-in verifies against it when
// the email is unknown (or belongs to a demo account), so that case costs the
// same argon2id work as a wrong password for a real account: the response time
// does not reveal which emails are registered (owner decision A2).
// Building it is only string formatting - no hashing at start-up.
var dummyHash = encodeHash(defaultParams, make([]byte, defaultParams.saltLen), make([]byte, defaultParams.keyLen))

// BurnPasswordCheck does the work of one password check and throws the result
// away. Call it on every sign-in path that has no real hash to check.
func BurnPasswordCheck(password string) {
	_, _ = VerifyPassword(dummyHash, password)
}
