import { useNavigate } from "react-router";
import { showToast } from "../../lib/toast.ts";
import { useAuthMutations } from "./useCurrentUser.ts";

/**
 * Sign out, shared by the header account menu and the phone menu.
 * It goes to the home page FIRST and then signs out: if the user is on a protected page (/orders), leaving it
 * before the user becomes null means RequireAuth never sees "signed out" and never sends them to /login.
 * `flushSync: true` makes that order real: normally React Router applies a navigation as a low-priority React
 * transition, and the "user = null" update (urgent) could be drawn first, while /orders is still on screen.
 * With flushSync the home page is on screen before the sign-out request even starts.
 */
export function useSignOut() {
  const { logout } = useAuthMutations();
  const navigate = useNavigate();
  return {
    signOut() {
      void navigate("/", { flushSync: true });
      logout.mutate(undefined, { onSettled: () => showToast({ kind: "info", message: "You are signed out" }) });
    },
    pending: logout.isPending,
  };
}
