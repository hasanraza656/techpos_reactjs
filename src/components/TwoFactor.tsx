import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, Download } from "lucide-react";
import { api, json, useClient } from "../lib/api";
import { ErrorBox, Modal, Loading } from "./ui";
export function TwoFactorSettings({ verified }: { verified: boolean }) {
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"setup" | "disable" | "regenerate">("setup");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qr_url: string } | null>(
    null,
  );
  const [recovery, setRecovery] = useState<string[]>([]);
  const state = useQuery({
    queryKey: ["two-factor"],
    queryFn: () =>
      api<{ enabled: boolean; remaining_recovery_codes: number }>(
        "account/two-factor",
      ),
  });
  const start = useMutation({
    mutationFn: () =>
      api<{ secret: string; qr_url: string }>(
        "account/two-factor/setup",
        json("POST", { password }),
      ),
    onSuccess: (r) => {
      setSetup(r);
      setPassword("");
    },
  });
  const finish = useMutation({
    mutationFn: () =>
      api<{ recovery_codes?: string[]; message?: string }>(
        `account/two-factor/${mode === "setup" ? "confirm" : mode === "disable" ? "disable" : "recovery-codes"}`,
        json("POST", { password, code }),
      ),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["two-factor"] });
      client.invalidateQueries({ queryKey: ["me"] });
      setCode("");
      setPassword("");
      setSetup(null);
      if (r.recovery_codes) setRecovery(r.recovery_codes);
      else {
        setOpen(false);
        notify(r.message ?? "Security settings updated.");
      }
    },
  });
  function choose(action: typeof mode) {
    setMode(action);
    setPassword("");
    setCode("");
    setSetup(null);
    setRecovery([]);
    start.reset();
    finish.reset();
    setOpen(true);
  }
  function download() {
    const blob = new Blob(
      [
        "Tech POS recovery codes\nKeep these private. Each code works once.\n\n" +
          recovery.join("\n"),
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "techpos-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (state.isPending) return <Loading />;
  return (
    <section className="panel mt">
      <div className="section-heading">
        <div>
          <h2>Two-factor authentication</h2>
          <p className="muted">Add an authenticator code to protect sign-in.</p>
        </div>
        <span className={state.data?.enabled ? "status-pill" : "neutral-pill"}>
          {state.data?.enabled ? "Enabled" : "Not enabled"}
        </span>
      </div>
      <ErrorBox error={state.error} />
      {state.data?.enabled ? (
        <>
          <p className="muted">
            {state.data.remaining_recovery_codes} unused recovery codes remain.
            Recovery codes should be stored privately, separate from your
            password.
          </p>
          <div className="row mt">
            <button
              className="button secondary"
              onClick={() => choose("regenerate")}
            >
              Replace recovery codes
            </button>
            <button
              className="text-button danger-text"
              onClick={() => choose("disable")}
            >
              Disable two-factor authentication
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Use a compatible authenticator app. No paid service is required.
            Verify your email before enabling.
          </p>
          <button
            className="button mt"
            disabled={!verified}
            onClick={() => choose("setup")}
          >
            <ShieldCheck size={17} />
            Set up authenticator
          </button>
        </>
      )}
      <Modal
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setSetup(null);
            setRecovery([]);
            setPassword("");
            setCode("");
          }
        }}
        title={
          recovery.length
            ? "Save your recovery codes"
            : mode === "setup"
              ? "Set up your authenticator"
              : mode === "disable"
                ? "Disable two-factor authentication?"
                : "Replace your recovery codes"
        }
        description={
          recovery.length
            ? "These codes are displayed once. Keep them private and available if you lose your authenticator."
            : "Confirm your identity before changing this security setting."
        }
      >
        <ErrorBox error={start.error ?? finish.error} />
        {recovery.length ? (
          <>
            <div className="recovery-codes">
              {recovery.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </div>
            <button className="button full mt" onClick={download}>
              <Download size={17} />
              Download recovery codes
            </button>
            <button
              className="button secondary full mt"
              onClick={() => {
                setRecovery([]);
                setOpen(false);
              }}
            >
              I’ve saved my recovery codes
            </button>
          </>
        ) : mode === "setup" && !setup ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate();
            }}
          >
            <label>
              Confirm your password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button
              className="button full mt"
              disabled={!password || start.isPending}
            >
              Continue to authenticator setup
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              finish.mutate();
            }}
          >
            {setup && (
              <>
                <div className="qr-card">
                  <QRCodeSVG value={setup.qr_url} size={190} />
                  <p>
                    Scan with your authenticator. Or enter this setup key
                    manually:
                  </p>
                  <code data-testid="authenticator-secret">{setup.secret}</code>
                </div>
                <p className="muted mt">
                  Enter a code from the app to confirm. Setup expires after 10
                  minutes.
                </p>
              </>
            )}
            {mode !== "setup" && (
              <label>
                Confirm your password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            <label>
              {mode === "setup"
                ? "Authenticator code"
                : "Authentication or recovery code"}
              <input
                autoComplete="one-time-code"
                required
                maxLength={100}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            {mode === "regenerate" && (
              <p className="muted">
                All previous recovery codes will stop working.
              </p>
            )}
            <button
              className="button full mt"
              disabled={
                finish.isPending || !code || (mode !== "setup" && !password)
              }
            >
              {mode === "setup"
                ? "Enable two-factor authentication"
                : mode === "disable"
                  ? "Disable two-factor authentication"
                  : "Replace recovery codes"}
            </button>
          </form>
        )}
      </Modal>
    </section>
  );
}
