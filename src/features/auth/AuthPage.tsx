import { useId, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { authErrorMessage, displayName, type User } from "../../api/auth.ts";
import { Button } from "../../components/Button.tsx";
import { TextField } from "../../components/TextField.tsx";
import { safeNextPath, authPageLink } from "../../lib/safeNext.ts";
import { showToast } from "../../lib/toast.ts";
import { useDocumentTitle } from "../../lib/useDocumentTitle.ts";
import styles from "./AuthPage.module.css";
import { PasswordField } from "./PasswordField.tsx";
import { useAuthMutations, useCurrentUser } from "./useCurrentUser.ts";
import { emailError, loginPasswordError, newPasswordError } from "./validation.ts";

type Mode = "login" | "register";

/** What differs between the two pages. Everything else (layout, fields, demo button, errors) is shared. */
const PAGES = {
  login: {
    title: "Sign in",
    submit: "Sign in",
    passwordAutoComplete: "current-password",
    passwordHint: undefined,
    passwordError: loginPasswordError,
    switchText: "New here?",
    switchLink: "Create an account",
    switchTo: "/register",
    done: (user: User) => `Signed in as ${displayName(user)}`,
  },
  register: {
    title: "Create account",
    submit: "Create account",
    passwordAutoComplete: "new-password",
    passwordHint: "8–128 characters",
    passwordError: newPasswordError,
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchTo: "/login",
    done: () => "Account created – you are signed in",
  },
} as const;

/**
 * The sign-in page (/login) and the sign-up page (/register) - one component, because they are the same form
 * with different texts and rules (Task 14, A8).
 *
 * - `?next=/orders` says where to go after signing in. It is checked by safeNextPath (only same-site paths),
 *   so a crafted link cannot send the user to another website after they sign in.
 * - Already signed in (or just signed in): <Navigate> goes to `next`. The mutations write the new user into the
 *   query cache, this component re-renders with a user and the redirect happens - one mechanism for both cases.
 * - Errors: each field shows its own message after the user leaves it or presses Submit (inline validation);
 *   a server answer (wrong password, taken email, too many attempts, server down) is shown above the form.
 */
export function AuthPage({ mode }: { mode: Mode }) {
  const page = PAGES[mode];
  useDocumentTitle(page.title);
  const titleId = useId();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));

  const { user } = useCurrentUser();
  const mutations = useAuthMutations();
  const submit = mutations[mode];
  const demo = mutations.demo;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // A field's error is shown only after the user has left it once (or pressed Submit): no red text while typing.
  const [touched, setTouched] = useState({ email: false, password: false });
  const [serverError, setServerError] = useState<string>();
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  if (user) return <Navigate to={next} replace />;

  const errors = { email: emailError(email), password: page.passwordError(password) };
  const busy = submit.isPending || demo.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setTouched({ email: true, password: true });
    // Focus the first wrong field, so keyboard and screen reader users land on the problem.
    if (errors.email || errors.password) {
      (errors.email ? emailInput : passwordInput).current?.focus();
      return;
    }

    setServerError(undefined);
    submit.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (signedIn) => showToast({ kind: "success", message: page.done(signedIn) }),
        onError: (err) => setServerError(authErrorMessage(err)),
      },
    );
  }

  function handleDemo() {
    if (busy) return;
    setServerError(undefined);
    demo.mutate(undefined, {
      onSuccess: () => showToast({ kind: "success", message: "Signed in as Demo user" }),
      onError: (err) => setServerError(authErrorMessage(err)),
    });
  }

  const demoBlock = (
    <div className={styles.demo}>
      <Button variant="secondary" className={styles.wide} loading={demo.isPending} onClick={handleDemo}>
        Sign in as demo user
      </Button>
      <p className={styles.demoNote}>A new temporary account just for you. No email or password needed.</p>
    </div>
  );

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-labelledby={titleId}>
        {/* Like Eneba: the way to the other page sits right under the title ("New user? Create account"). */}
        <div className={styles.heading}>
          <h1 id={titleId} className={styles.title}>
            {page.title}
          </h1>
          <p className={styles.switch}>
            {page.switchText} <Link to={authPageLink(page.switchTo, next)}>{page.switchLink}</Link>
          </p>
        </div>

        {/* Sign-in page: the demo button comes first, so a reviewer finds it at once. */}
        {mode === "login" && (
          <>
            {demoBlock}
            <p className={styles.divider}>or sign in with email</p>
          </>
        )}

        {serverError && (
          <p role="alert" className={styles.formError}>
            {serverError}
          </p>
        )}

        {/* noValidate: our own messages instead of the browser's bubbles (they would differ per browser). */}
        <form className={styles.form} noValidate onSubmit={handleSubmit} aria-labelledby={titleId}>
          <TextField
            ref={emailInput}
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            error={touched.email ? errors.email : undefined}
          />
          <PasswordField
            ref={passwordInput}
            label="Password"
            name="password"
            autoComplete={page.passwordAutoComplete}
            hint={page.passwordHint}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            error={touched.password ? errors.password : undefined}
          />
          <Button type="submit" className={styles.wide} loading={submit.isPending}>
            {page.submit}
          </Button>
        </form>

        {mode === "register" && (
          <>
            <p className={styles.divider}>or</p>
            {demoBlock}
          </>
        )}

      </section>
    </div>
  );
}
