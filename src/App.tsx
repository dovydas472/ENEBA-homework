import { ApiError } from "./api/client.ts";
import { useApi } from "./api/useApi.ts";

type Health = { status: string; db: string; dbLatencyMs?: number };

// The health endpoint answers 503 with {"db":"error"} when only the DB is down.
// That means the API itself is reachable, which is different from "API: error".
function isDbError(error: ApiError): boolean {
  const body = error.body as Partial<Health> | undefined;
  return error.status === 503 && body?.db === "error";
}

export default function App() {
  const { data, error, loading, slow, retry } = useApi<Health>("/api/health");

  if (loading) {
    return <p>{slow ? "Waking up the server, this can take a few seconds…" : "Checking…"}</p>;
  }

  if (data) {
    return <p>API: ok · DB: ok ({data.dbLatencyMs} ms)</p>;
  }

  return (
    <>
      <p>{error && isDbError(error) ? "API: ok · DB: error" : "API: error"}</p>
      <button onClick={retry}>Retry</button>
    </>
  );
}
