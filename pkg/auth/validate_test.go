package auth

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeEmail(t *testing.T) {
	valid := map[string]string{
		"jon@example.com":         "jon@example.com",
		"  Jon.Doe@Example.COM  ": "Jon.Doe@Example.COM", // trimmed; case kept (citext compares without case)
		"a+tag@sub.example.lt":    "a+tag@sub.example.lt",
	}
	for in, want := range valid {
		got, err := NormalizeEmail(in)
		if err != nil || got != want {
			t.Errorf("NormalizeEmail(%q) = %q, %v; want %q", in, got, err, want)
		}
	}

	invalidInputs := map[string]string{
		"empty":          "",
		"spaces":         "   ",
		"no at":          "jon.example.com",
		"no domain dot":  "jon@localhost",
		"two ats":        "jon@@example.com",
		"display name":   "Jon <jon@example.com>",
		"space inside":   "jon doe@example.com",
		"too long (255)": strings.Repeat("a", 243) + "@example.com",
	}
	for name, in := range invalidInputs {
		t.Run(name, func(t *testing.T) {
			_, err := NormalizeEmail(in)
			var ve *ValidationError
			if !errors.As(err, &ve) || ve.Message == "" {
				t.Fatalf("NormalizeEmail(%q) err = %v, want a ValidationError", in, err)
			}
		})
	}
}

func TestValidateNewEmail_demoDomainIsReserved(t *testing.T) {
	for _, email := range []string{"demo-1@demo.invalid", "X@DEMO.INVALID"} {
		if _, err := ValidateNewEmail(email); err == nil {
			t.Errorf("ValidateNewEmail(%q) accepted the reserved demo domain", email)
		}
	}
	if _, err := ValidateNewEmail("me@notdemo.invalid.example.com"); err != nil {
		t.Errorf("a domain that only contains the text was rejected: %v", err)
	}
}

func TestValidateNewPassword(t *testing.T) {
	cases := map[string]bool{
		"":                        false,
		"1234567":                 false, // 7
		"12345678":                true,  // 8
		"ąčęėįšųū":                true,  // 8 characters (16 bytes): characters are counted, not bytes
		"ąčęėįšų":                 false, // 7 characters (14 bytes)
		"        ":                true,  // spaces count and are not trimmed
		strings.Repeat("x", 128):  true,
		strings.Repeat("x", 129):  false,
		strings.Repeat("ž", 128):  true, // 256 bytes, 128 characters
		strings.Repeat("ž", 129):  false,
		"password with spaces 12": true,
	}
	for pw, wantOK := range cases {
		err := ValidateNewPassword(pw)
		if (err == nil) != wantOK {
			t.Errorf("ValidateNewPassword(%d chars %q) err = %v, want ok=%v", len([]rune(pw)), pw, err, wantOK)
		}
	}
}

func TestValidateLoginPassword(t *testing.T) {
	if ValidateLoginPassword("") == nil {
		t.Error("empty password accepted")
	}
	if ValidateLoginPassword("short") != nil {
		t.Error("a short password must not be a 400 on sign-in (it is just a wrong password)")
	}
	if ValidateLoginPassword(strings.Repeat("x", 129)) == nil {
		t.Error("129 characters accepted")
	}
}
