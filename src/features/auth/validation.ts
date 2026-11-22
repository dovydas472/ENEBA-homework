// Inline validation of the sign-in and sign-up forms. It mirrors the server's rules (pkg/auth/validate.go)
// so most mistakes are shown at once, without a request. The server still checks everything again:
// these functions are for a friendly form, not for security.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 254;

/** something@something.something, no spaces. The server's net/mail check is stricter; this catches typos. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Characters, not UTF-16 units: "ž" is 1, and an emoji is 1 too (the server counts the same way). */
const length = (text: string) => [...text].length;

/** Error text for the email field, or undefined when it is fine. */
export function emailError(value: string): string | undefined {
  const email = value.trim();
  if (email === "") return "Enter your email";
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) return "Enter a valid email address";
  return undefined;
}

/** Sign-up password: 8-128 characters. Spaces count and are kept. */
export function newPasswordError(value: string): string | undefined {
  if (length(value) < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (length(value) > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  return undefined;
}

/**
 * Sign-in password: only "not empty". The 8-character rule is NOT checked here: a short password is simply
 * wrong, and the server answers that with the same "Invalid email or password" as any other mistake.
 */
export function loginPasswordError(value: string): string | undefined {
  return value === "" ? "Enter your password" : undefined;
}
