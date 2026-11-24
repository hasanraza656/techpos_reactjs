import { useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { api, json } from "../lib/api";
import { ErrorBox } from "../components/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Me } from "../lib/types";
const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().optional(),
  password_confirmation: z.string().optional(),
  name: z.string().optional(),
  business_name: z.string().optional(),
  remember: z.boolean().optional(),
});
type Fields = z.infer<typeof schema>;
export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "forgot-password" | "reset-password";
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState("");
  const [challenge, setChallenge] = useState(false);
  const [code, setCode] = useState("");
  const [challenging, setChallenging] = useState(false);
  // The API refuses a second login on an authenticated session ("Sign out
  // before signing in…") and this page offers no sign-out, so send an
  // already signed-in visitor on to the workspace instead.
  const session = useQuery({
    queryKey: ["auth-page-session"],
    queryFn: () => api<Me>("auth/me"),
    enabled: mode === "login" || mode === "register",
    retry: false,
    gcTime: 0,
  });
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { email: params.get("email") ?? "", remember: false },
  });
  const titles = {
    login: "Welcome back.",
    register: "A fresh start for your business.",
    "forgot-password": "Let’s get you back in.",
    "reset-password": "Choose a new password.",
  };
  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    try {
      const result = await api<{
        message?: string;
        two_factor_required?: boolean;
        user?: { is_superadmin: boolean; platform_access?: boolean };
      }>(
        `auth/${mode === "forgot-password" ? "forgot-password" : mode === "reset-password" ? "reset-password" : mode}`,
        json("POST", {
          ...values,
          ...(mode === "reset-password" ? { token: params.get("token") } : {}),
        }),
      );
      if (mode === "login" || mode === "register") {
        if (result.two_factor_required) {
          setChallenge(true);
          return;
        }
        client.clear();
        const next = params.get("next");
        const destination =
          next && /^\/invitations\/[a-zA-Z0-9]{64}$/.test(next)
            ? next
            : result.user?.is_superadmin || result.user?.platform_access
              ? "/platform"
              : mode === "register" ? "/onboarding" : "/";
        navigate(destination, {
          replace: true,
        });
      } else setMessage(result.message ?? "Done.");
    } catch (e) {
      setError(e);
    }
  });
  async function completeChallenge() {
    setChallenging(true);
    setError(undefined);
    try {
      const result = await api<{ user: { is_superadmin: boolean; platform_access?: boolean } }>(
        "auth/two-factor-challenge",
        json("POST", { code }),
      );
      client.clear();
      const next = params.get("next");
      navigate(
        next && /^\/invitations\/[a-zA-Z0-9]{64}$/.test(next)
          ? next
          : result.user.is_superadmin || result.user.platform_access
            ? "/platform"
            : "/",
        { replace: true },
      );
    } catch (e) {
      setError(e);
    } finally {
      setChallenging(false);
    }
  }
  if (session.data && !challenge) {
    const next = params.get("next");
    return (
      <Navigate
        replace
        to={
          next && /^\/invitations\/[a-zA-Z0-9]{64}$/.test(next)
            ? next
            : session.data.user.is_superadmin ||
                session.data.user.platform_access
              ? "/platform"
              : "/"
        }
      />
    );
  }
  if (challenge)
    return (
      <main className="standalone panel">
        <span className="badge">ONE MORE SECURITY CHECK</span>
        <h1 className="mt">Check your authenticator.</h1>
        <p className="muted mt">
          Enter a fresh six-digit code or an unused recovery code. This sign-in
          challenge expires in five minutes.
        </p>
        <ErrorBox error={error} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            completeChallenge();
          }}
        >
          <label>
            Authentication or recovery code
            <input
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <button className="button full mt" disabled={challenging || !code}>
            Complete sign in
          </button>
        </form>
        <button
          className="text-button mt"
          onClick={() => {
            setChallenge(false);
            setCode("");
            setError(undefined);
          }}
        >
          Start sign in again
        </button>
      </main>
    );
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <a
          className="brand"
          href={import.meta.env.VITE_MARKETING_URL ?? "http://127.0.0.1:8000"}
        >
          <span className="brand-mark">
            T<span>•</span>
          </span>
          tech<span className="brand-light">pos</span>
        </a>
        <div>
          <p className="eyebrow">MADE FOR YOUR EVERYDAY</p>
          <h1>
            More clarity.
            <br />
            More possibility.
          </h1>
          <p>One thoughtful workspace for the business you’re building.</p>
          <div className="story-card">
            <ShieldCheck size={30} />
            <h3>Your business. Your space.</h3>
            <p>
              Separate business workspaces, permission controls, and transparent
              subscription choices.
            </p>
          </div>
        </div>
        <small>Built with growing businesses in mind.</small>
      </aside>
      <main className="auth-main">
        <div className="auth-form">
          <div className="badge">LET’S BUILD SOMETHING GOOD</div>
          <h1>{titles[mode]}</h1>
          <p className="muted">
            {mode === "register"
              ? "Create your account. Personalize the details as you go."
              : mode === "login"
                ? "Sign in to your Tech POS workspace."
                : "We’ll help you securely recover your account."}
          </p>
          {message ? (
            <div className="alert">
              <CheckCircle2 size={22} />
              {message}
              <Link to="/login">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <ErrorBox error={error} />
              {mode === "register" && (
                <>
                  <label>
                    Your name
                    <input
                      autoComplete="name"
                      required
                      {...form.register("name")}
                    />
                  </label>
                  <label>
                    Business name
                    <input
                      required
                      maxLength={150}
                      {...form.register("business_name")}
                    />
                  </label>
                </>
              )}
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <small className="field-error">
                    {form.formState.errors.email.message}
                  </small>
                )}
              </label>
              {mode !== "forgot-password" && (
                <label>
                  Password
                  <input
                    aria-label="Password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={mode === "login" ? 1 : 12}
                    {...form.register("password")}
                  />
                  {mode !== "login" && (
                    <small className="muted">
                      At least 12 characters, including letters and numbers.
                    </small>
                  )}
                </label>
              )}
              {(mode === "register" || mode === "reset-password") && (
                <label>
                  Confirm password
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    {...form.register("password_confirmation")}
                  />
                </label>
              )}
              {mode === "login" && (
                <div className="row between">
                  <label className="check-label">
                    <input type="checkbox" {...form.register("remember")} />
                    Remember me
                  </label>
                  <Link to="/forgot-password">Forgot password?</Link>
                </div>
              )}
              <button
                className="button full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Please wait…"
                  : mode === "register"
                    ? "Create your workspace"
                    : mode === "login"
                      ? "Sign in"
                      : mode === "forgot-password"
                        ? "Send reset link"
                        : "Reset password"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          <p className="auth-footer">
            {mode === "login" ? (
              <>
                New to Tech POS? <Link to="/register">Create an account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
