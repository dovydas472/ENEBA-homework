package auth

import (
	"errors"
	"strings"
	"testing"
)

func TestHashPassword_formatAndRoundTrip(t *testing.T) {
	encoded, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	// PHC string with the OWASP parameters (A2).
	if !strings.HasPrefix(encoded, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("encoded = %q, want the argon2id PHC prefix with m=19456,t=2,p=1", encoded)
	}
	p, salt, key, err := decodeHash(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if p != defaultParams.withoutLengths() || len(salt) != 16 || len(key) != 32 {
		t.Fatalf("params %+v, salt %d bytes, key %d bytes", p, len(salt), len(key))
	}

	if ok, err := VerifyPassword(encoded, "correct horse battery"); err != nil || !ok {
		t.Fatalf("right password: ok=%v err=%v", ok, err)
	}
	if ok, err := VerifyPassword(encoded, "correct horse batterY"); err != nil || ok {
		t.Fatalf("wrong password: ok=%v err=%v, want false, nil", ok, err)
	}
	if ok, _ := VerifyPassword(encoded, ""); ok {
		t.Fatal("empty password matched")
	}
}

// withoutLengths is the part of params that decodeHash reads from the string.
func (p params) withoutLengths() params {
	return params{memoryKiB: p.memoryKiB, time: p.time, threads: p.threads}
}

func TestHashPassword_saltMakesEqualPasswordsDiffer(t *testing.T) {
	a, _ := HashPassword("same password")
	b, _ := HashPassword("same password")
	if a == b {
		t.Fatal("two hashes of the same password are equal: the salt is not random")
	}
}

// A changed hash or salt byte is a plain non-match (not an error).
func TestVerifyPassword_tamperedHashDoesNotMatch(t *testing.T) {
	encoded, _ := HashPassword("my password 1")
	parts := strings.Split(encoded, "$")
	flip := func(s string) string { // change the first character to another valid base64 one
		if s[0] == 'A' {
			return "B" + s[1:]
		}
		return "A" + s[1:]
	}
	for name, tampered := range map[string]string{
		"hash changed": strings.Join(append(parts[:5:5], flip(parts[5])), "$"),
		"salt changed": strings.Join(append(parts[:4:4], flip(parts[4]), parts[5]), "$"),
		"t changed":    strings.Replace(encoded, "t=2", "t=3", 1),
	} {
		t.Run(name, func(t *testing.T) {
			ok, err := VerifyPassword(tampered, "my password 1")
			if err != nil || ok {
				t.Fatalf("ok=%v err=%v, want false, nil", ok, err)
			}
		})
	}
}

// Broken or dangerous strings are rejected before any hashing.
func TestVerifyPassword_malformedHash(t *testing.T) {
	good, _ := HashPassword("my password 1")
	salt := strings.Split(good, "$")[4]
	key := strings.Split(good, "$")[5]
	for name, encoded := range map[string]string{
		"empty":              "",
		"bcrypt":             "$2a$10$abcdefghijklmnopqrstuv",
		"argon2i":            "$argon2i$v=19$m=19456,t=2,p=1$" + salt + "$" + key,
		"wrong version":      "$argon2id$v=16$m=19456,t=2,p=1$" + salt + "$" + key,
		"missing part":       "$argon2id$v=19$m=19456,t=2,p=1$" + salt,
		"extra part":         good + "$x",
		"junk after params":  "$argon2id$v=19$m=19456,t=2,p=1x$" + salt + "$" + key,
		"params reordered":   "$argon2id$v=19$t=2,m=19456,p=1$" + salt + "$" + key,
		"memory 4 GiB (DoS)": "$argon2id$v=19$m=4194304,t=2,p=1$" + salt + "$" + key,
		"time 1000":          "$argon2id$v=19$m=19456,t=1000,p=1$" + salt + "$" + key,
		"threads 0":          "$argon2id$v=19$m=19456,t=2,p=0$" + salt + "$" + key,
		"threads 300":        "$argon2id$v=19$m=19456,t=2,p=300$" + salt + "$" + key,
		"negative memory":    "$argon2id$v=19$m=-1,t=2,p=1$" + salt + "$" + key,
		"salt not base64":    "$argon2id$v=19$m=19456,t=2,p=1$!!!$" + key,
		"salt too short":     "$argon2id$v=19$m=19456,t=2,p=1$YWJj$" + key,
		"hash too short":     "$argon2id$v=19$m=19456,t=2,p=1$" + salt + "$YWJj",
		"padded base64":      "$argon2id$v=19$m=19456,t=2,p=1$" + salt + "==$" + key,
	} {
		t.Run(name, func(t *testing.T) {
			ok, err := VerifyPassword(encoded, "my password 1")
			if ok || !errors.Is(err, ErrMalformedHash) {
				t.Fatalf("ok=%v err=%v, want false, ErrMalformedHash", ok, err)
			}
		})
	}
}

// The dummy hash used for unknown emails must cost the same as a real check:
// same parameters as new hashes, and nothing matches it.
func TestDummyHash_sameCostAsARealHash(t *testing.T) {
	p, salt, key, err := decodeHash(dummyHash)
	if err != nil {
		t.Fatalf("dummy hash does not parse: %v", err)
	}
	if p != defaultParams.withoutLengths() || len(salt) != defaultParams.saltLen || len(key) != defaultParams.keyLen {
		t.Fatalf("dummy hash params %+v (salt %d, key %d) differ from defaultParams %+v", p, len(salt), len(key), defaultParams)
	}
	for _, pw := range []string{"", "password", "12345678"} {
		if ok, _ := VerifyPassword(dummyHash, pw); ok {
			t.Fatalf("dummy hash matched %q", pw)
		}
	}
	BurnPasswordCheck("anything") // must not panic
}
