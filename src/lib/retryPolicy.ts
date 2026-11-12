export function retryDelay(
  attempt: number,
  retryAfterMs = 0,
  random = Math.random(),
): number {
  const base = Math.min(
    5 * 60 * 1000,
    1000 * 2 ** Math.min(18, Math.max(0, attempt - 1)),
  );
  return Math.max(
    Math.min(60 * 60 * 1000, Number.isFinite(retryAfterMs) ? retryAfterMs : 0),
    Math.round(base * (0.8 + Math.min(1, Math.max(0, random)) * 0.4)),
  );
}
