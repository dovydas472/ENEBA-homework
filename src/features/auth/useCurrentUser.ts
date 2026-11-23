// "Who is signed in" for the whole app, plus the actions that change it (Task 14).
// All of it lives in the ONE TanStack Query cache entry queryKeys.currentUser:
//   - useCurrentUser reads it (GET /api/auth/me once, then from the cache),
//   - sign in / register / demo write the returned user into it,
//   - sign out writes null into it.
// So the header, the phone menu and RequireAuth all switch at the same moment, without extra requests.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { login, logout, register, signInAsDemo, type Credentials, type User } from "../../api/auth.ts";
import { currentUserQuery, queryKeys } from "../../api/queries.ts";

export interface CurrentUser {
  /** The signed-in user; null = signed out; undefined = not known yet (loading or error). */
  user: User | null | undefined;
  /** The first answer has not arrived yet. */
  isPending: boolean;
  /** The server could not be asked (network / 5xx). Not the same as "signed out". */
  isError: boolean;
  refetch: () => void;
}

/** The signed-in user. A 401 from the server is "signed out" (null), not an error (see getCurrentUser). */
export function useCurrentUser(): CurrentUser {
  const query = useQuery(currentUserQuery());
  return {
    user: query.data,
    isPending: query.isPending,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/**
 * The mutations that sign in or out. Each one writes its result into the currentUser cache entry
 * (setQueryData), so every component that shows the user updates at once.
 * The cart is not touched: it stays in localStorage across sign-in and sign-out (owner decision).
 * Cached orders ARE dropped (Task 16b): they belong to the previous user and must never flash for the next one.
 */
export function useAuthMutations() {
  const queryClient = useQueryClient();
  const dropOrders = () => queryClient.removeQueries({ queryKey: queryKeys.orders });
  const signedIn = (user: User) => {
    dropOrders();
    queryClient.setQueryData(queryKeys.currentUser, user);
  };

  const loginMutation = useMutation({ mutationFn: (c: Credentials) => login(c), onSuccess: signedIn });
  const registerMutation = useMutation({ mutationFn: (c: Credentials) => register(c), onSuccess: signedIn });
  const demoMutation = useMutation({ mutationFn: signInAsDemo, onSuccess: signedIn });
  const logoutMutation = useMutation({
    mutationFn: logout,
    // Settled = success OR error: the server clears the cookie even when it answers 503, so the UI shows
    // "signed out" either way, then asks the server again to be sure.
    onSettled: async () => {
      dropOrders();
      queryClient.setQueryData(queryKeys.currentUser, null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
    },
  });

  return { login: loginMutation, register: registerMutation, demo: demoMutation, logout: logoutMutation };
}
