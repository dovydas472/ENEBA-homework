import { useEffect, useState } from "react";

type Status = "loading" | "ok" | "error";

export default function App() {
  const [status, setStatus] = useState<Status>("loading");

  // On load, ask the API if it is alive.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { status?: string }) => setStatus(d.status === "ok" ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, []);

  return <p>API: {status === "loading" ? "..." : status}</p>;
}
