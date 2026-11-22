package auth

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
)

func TestNewSessionToken(t *testing.T) {
	token, hash, err := NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	// 32 bytes in unpadded URL-safe base64 = 43 characters.
	if len(token) != 43 || strings.ContainsAny(token, "+/=") {
		t.Fatalf("token %q: want 43 URL-safe characters", token)
	}
	raw, _ := base64.RawURLEncoding.DecodeString(token)
	want := sha256.Sum256(raw)
	if !bytes.Equal(hash, want[:]) {
		t.Fatal("hash is not the SHA-256 of the token bytes")
	}
	// The cookie value must hash to exactly what was stored.
	got, ok := HashSessionToken(token)
	if !ok || !bytes.Equal(got, hash) {
		t.Fatalf("HashSessionToken(token) = %x, %v; want the stored hash", got, ok)
	}

	token2, hash2, _ := NewSessionToken()
	if token2 == token || bytes.Equal(hash2, hash) {
		t.Fatal("two tokens are equal: not random")
	}
}

func TestHashSessionToken_rejectsWhatWeNeverIssue(t *testing.T) {
	token, _, _ := NewSessionToken()
	for name, value := range map[string]string{
		"empty":          "",
		"short":          "abc",
		"one char more":  token + "A",
		"one char less":  token[:42],
		"padded":         token + "=",
		"std base64 +/":  "++++++++++++++++++++++++++++++++++++++++++/",
		"spaces":         strings.Repeat(" ", 43),
		"16 bytes token": base64.RawURLEncoding.EncodeToString(make([]byte, 16)),
	} {
		t.Run(name, func(t *testing.T) {
			if hash, ok := HashSessionToken(value); ok || hash != nil {
				t.Fatalf("HashSessionToken(%q) = %x, %v; want nil, false", value, hash, ok)
			}
		})
	}
}
