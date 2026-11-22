package auth

import (
	"net/mail"
	"strings"
	"unicode/utf8"
)

// Limits of the sign-up form (owner decision A1).
const (
	MinPasswordLen = 8   // characters (not bytes): "ąčęėįšųūž" counts as 9
	MaxPasswordLen = 128 // an upper bound keeps one hash cheap enough and stops huge bodies
	maxEmailLen    = 254 // the longest address the e-mail standards allow
)

// DemoEmailDomain is the reserved domain of the generated demo accounts.
// ".invalid" is reserved by RFC 2606: no real address can ever end with it,
// so a demo email never collides with a real person's email.
const DemoEmailDomain = "demo.invalid"

// ValidationError is an input problem with a message written for the user.
// The handlers return its text as-is with HTTP 400.
type ValidationError struct{ Message string }

func (e *ValidationError) Error() string { return e.Message }

func invalid(msg string) error { return &ValidationError{Message: msg} }

// NormalizeEmail trims the spaces around an email and checks its shape.
// It returns the email to use (case is kept: the citext column compares
// without case anyway). Used by both sign-up and sign-in.
func NormalizeEmail(raw string) (string, error) {
	email := strings.TrimSpace(raw)
	if email == "" {
		return "", invalid("Enter your email")
	}
	if len(email) > maxEmailLen {
		return "", invalid("Email is too long")
	}
	// net/mail understands the full address syntax. We accept only a bare
	// address ("a@b.c"), not "Name <a@b.c>", and the domain must have a dot.
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return "", invalid("Enter a valid email address")
	}
	at := strings.LastIndexByte(email, '@')
	if !strings.Contains(email[at+1:], ".") {
		return "", invalid("Enter a valid email address")
	}
	return email, nil
}

// ValidateNewEmail is NormalizeEmail plus the sign-up only rule: the demo
// domain is reserved for generated demo accounts.
func ValidateNewEmail(raw string) (string, error) {
	email, err := NormalizeEmail(raw)
	if err != nil {
		return "", err
	}
	if strings.HasSuffix(strings.ToLower(email), "@"+DemoEmailDomain) {
		return "", invalid("This email domain is reserved")
	}
	return email, nil
}

// ValidateNewPassword checks the sign-up password: 8-128 characters.
// The password is never trimmed or changed - spaces are allowed and count.
func ValidateNewPassword(password string) error {
	n := utf8.RuneCountInString(password)
	if n < MinPasswordLen {
		return invalid("Password must be at least 8 characters")
	}
	if n > MaxPasswordLen {
		return invalid("Password must be at most 128 characters")
	}
	return nil
}

// ValidateLoginPassword checks the sign-in password only for presence and the
// upper bound. The 8-character minimum is NOT checked here: a short password
// simply cannot match, and the generic "Invalid email or password" covers it.
func ValidateLoginPassword(password string) error {
	if password == "" {
		return invalid("Enter your password")
	}
	if utf8.RuneCountInString(password) > MaxPasswordLen {
		return invalid("Password must be at most 128 characters")
	}
	return nil
}
