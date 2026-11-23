// "Reserved for mm:ss" on the payment page, corrected for a wrong clock on the user's computer.
//
// The reservation ends at `reservedUntil`, a time on the SERVER's clock. If the user's clock is 5 minutes fast,
// "reservedUntil - Date.now()" would show 5 minutes too little (or "expired" while the keys are still reserved).
// So the server also sends `serverTime` ("now" on its clock). When that answer arrives we compute
//   offset = serverTime - (the browser's time at that moment)
// and from then on "server now" = Date.now() + offset. Only the DIFFERENCE between the two clocks matters, and it
// does not change while the page is open. (The few milliseconds the answer travelled are ignored.)

/** How far the server's clock is ahead of this browser's clock (negative = behind). */
export function clockOffsetMs(serverTime: string, receivedAtMs: number): number {
  const server = Date.parse(serverTime);
  return Number.isNaN(server) ? 0 : server - receivedAtMs;
}

/** Milliseconds left until `reservedUntil` (server clock), never below 0. */
export function remainingMs(reservedUntil: string, offsetMs: number, nowMs: number): number {
  const end = Date.parse(reservedUntil);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - (nowMs + offsetMs));
}

/**
 * 125_000 → "02:05". Seconds are rounded UP: "00:01" is shown until the very end, and "00:00" means it is over.
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
