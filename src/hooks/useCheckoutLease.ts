import { useEffect, useState } from "react";

type LeaseStatus = "checking" | "held" | "blocked" | "unsupported" | "error";

// Wait in the exclusive browser queue; acquisition/reload is normal loading.
export function useCheckoutLease(scope: string) {
  const supported = !!navigator.locks;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ scope: string; status: LeaseStatus }>(
    () => ({ scope, status: supported ? "checking" : "unsupported" }),
  );
  useEffect(() => {
    if (!navigator.locks) {
      setState({ scope, status: "unsupported" });
      return;
    }
    setState({ scope, status: "checking" });
    const controller = new AbortController();
    let cancelled = false;
    let acquired = false;
    let release: (() => void) | undefined;
    const name = `techpos:checkout:${scope}`;
    // Give the departing document/StrictMode mount time to release on reload.
    const notice = setTimeout(() => {
      void navigator.locks
        .query()
        .then((snapshot) => {
          if (
            !cancelled &&
            !acquired &&
            snapshot.held?.some((lock) => lock.name === name)
          )
            setState({ scope, status: "blocked" });
        })
        .catch(() => {
          /* An inspection error is not proof of a competing tab. */
        });
    }, 600);
    void navigator.locks
      .request(name, { signal: controller.signal }, async () => {
        if (cancelled) return;
        acquired = true;
        clearTimeout(notice);
        setState({ scope, status: "held" });
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {
        if (!cancelled) setState({ scope, status: "error" });
      });
    return () => {
      cancelled = true;
      clearTimeout(notice);
      if (!acquired) controller.abort();
      release?.();
    };
  }, [scope, attempt]);
  // Never borrow a held flag from the previous business/user during a switch.
  const status: LeaseStatus =
    state.scope === scope
      ? state.status
      : supported
        ? "checking"
        : "unsupported";
  return {
    held: status === "held",
    supported,
    status,
    retry: () => setAttempt((n) => n + 1),
  };
}
