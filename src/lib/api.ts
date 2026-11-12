import { create } from "zustand";

type ClientState = {
  tenant: string;
  setTenant: (tenant: string) => void;
  notice: string;
  notify: (notice: string) => void;
};
export const useClient = create<ClientState>((set) => ({
  tenant: "",
  setTenant: (tenant) => set({ tenant }),
  notice: "",
  notify: (notice) => set({ notice }),
}));

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  retryAfterMs?: number;
  constructor(
    message: string,
    status: number,
    errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
function csrfToken() {
  return decodeURIComponent(
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("XSRF-TOKEN="))
      ?.split("=")
      .slice(1)
      .join("=") ?? "",
  );
}
let sessionBootstrap: Promise<void> | null = null;
export async function csrf(refresh = false) {
  if (refresh) sessionBootstrap = null;
  if (!sessionBootstrap)
    sessionBootstrap = (async () => {
      const r = await fetch("/sanctum/csrf-cookie", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error("Could not initialize secure session.");
    })().catch((error) => {
      sessionBootstrap = null;
      throw error;
    });
  await sessionBootstrap;
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  csrfRetried = false,
): Promise<T> {
  const tenant = useClient.getState().tenant;
  // Establish one session before parallel first-page reads can issue competing cookies.
  await csrf();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "XMLHttpRequest");
  if (tenant && !headers.has("X-Tenant-ID")) headers.set("X-Tenant-ID", tenant);
  if (init.method && init.method !== "GET") {
    headers.set("X-XSRF-TOKEN", csrfToken());
    if (!(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
  }
  const r = await fetch(`/api/v1/${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  // 419 is rejected before application mutation; refreshing once is safe.
  if (r.status === 419 && !csrfRetried) {
    await csrf(true);
    return api<T>(path, { ...init, headers }, true);
  }
  if (r.status === 204) return undefined as T;
  const data = await r
    .json()
    .catch(() => ({ message: "The server returned an unexpected response." }));
  if (!r.ok) {
    const error = new ApiError(
      data.message ?? "Request failed.",
      r.status,
      data.errors ?? {},
    );
    const retry = r.headers.get("Retry-After");
    if (retry) {
      const seconds = Number(retry);
      error.retryAfterMs = Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000)
        : Math.max(0, Date.parse(retry) - Date.now());
    }
    throw error;
  }
  return data as T;
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export const errorText = (e: unknown) =>
  e instanceof ApiError
    ? Object.values(e.errors).flat().join(" ") || e.message
    : e instanceof Error
      ? e.message
      : "Something went wrong. Please try again.";
