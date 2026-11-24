import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  CreditCard,
  FileCheck,
  LockKeyhole,
  RefreshCw,
  Upload,
  ArrowRight,
} from "lucide-react";
import { api, json, useClient } from "../lib/api";
import type { Catalog, Payment, Plan, Me } from "../lib/types";
import { useWorkspace } from "../App";
import { ErrorBox, Loading, Modal, PageTitle } from "../components/ui";
export function SubscriptionPage() {
  const { business } = useWorkspace();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [chosen, setChosen] = useState<Plan | null>(null);
  const [method, setMethod] = useState("");
  const [active, setActive] = useState<Payment | null>(null);
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("catalog"),
  });
  const payments = useQuery({
    queryKey: ["payments", business.tenant.public_id],
    queryFn: () => api<Payment[]>("payments"),
    refetchInterval: 15000,
  });
  const create = useMutation({
    mutationFn: () =>
      api<Payment>(
        "payments",
        json("POST", {
          plan_key: chosen?.key,
          payment_method_id: Number(method),
        }),
      ),
    onSuccess: (p) => {
      setChosen(null);
      setActive(p);
      client.invalidateQueries({ queryKey: ["payments"] });
      notify("Payment request created. Your current plan remains active.");
    },
  });
  if (catalog.isPending || payments.isPending) return <Loading />;
  if (catalog.error || payments.error)
    return <ErrorBox error={catalog.error ?? payments.error} />;
  const pending = payments.data?.find((p) => p.status === "pending_review");
  return (
    <>
      <PageTitle
        title="Room to grow. On your terms."
        description={`You’re on ${business.plan.name}. Transparent monthly pricing, in PKR.`}
      />
      {pending && (
        <div className="alert">
          <FileCheck size={20} />
          <span>
            Your{" "}
            {catalog.data?.plans.find((p) => p.id === pending.plan_id)?.name}{" "}
            payment is under review. Your {business.plan.name} plan remains
            active until approval.
          </span>
        </div>
      )}
      <div className="pricing-grid">
        {catalog.data?.plans.map((plan) => (
          <article
            className={`price-card ${plan.key === "standard" ? "featured" : ""}`}
            key={plan.key}
          >
            {plan.key === "standard" && (
              <span className="eyebrow">SPACE TO GROW</span>
            )}
            <h2>{plan.name}</h2>
            <p className="muted">{plan.description}</p>
            <div className="price">
              <small>PKR</small>
              {Number(plan.prices[0]?.amount ?? 0).toLocaleString()}
              <small>/ month</small>
            </div>
            <ul>
              {[
                ["branches", "branches"],
                ["users", "team members"],
                ["active_skus", "active SKUs"],
              ].map(([key, label]) => (
                <li key={key}>
                  <Check size={17} />
                  {plan.limits[key].toLocaleString()} {label}
                </li>
              ))}
            </ul>
            {plan.key === business.plan.key ? (
              <span className="status-pill">Your current plan</span>
            ) : plan.key === "free" ? (
              <p className="muted">
                Expired paid subscriptions return to Free automatically.
              </p>
            ) : (
              <button
                className="button full"
                disabled={
                  !business.permissions.includes("subscriptions.manage")
                }
                onClick={() => {
                  setChosen(plan);
                  setMethod(String(catalog.data?.payment_methods[0]?.id ?? ""));
                  create.reset();
                }}
              >
                Choose {plan.name}
                <ArrowRight size={17} />
              </button>
            )}
          </article>
        ))}
      </div>
      <section className="panel mt">
        <div className="section-heading">
          <div>
            <h2>Payment history</h2>
            <p className="muted">A clear trail, from submission to review.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh payment history"
            onClick={() => payments.refetch()}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        {!payments.data?.length ? (
          <div className="empty">
            <CreditCard size={28} />
            <h3>No payments yet</h3>
            <p>
              Your Free plan is ready to use. Upgrade whenever you’re ready.
            </p>
          </div>
        ) : (
          payments.data.map((p) => (
            <button
              className="list-row payment-row"
              key={p.public_id}
              onClick={() => setActive(p)}
            >
              <FileCheck />
              <div>
                <strong>
                  {
                    catalog.data?.plans.find((plan) => plan.id === p.plan_id)
                      ?.name
                  }{" "}
                  · PKR {Number(p.amount).toLocaleString()}
                </strong>
                <small>
                  {p.transaction_reference ?? "Add your transaction details"}
                </small>
              </div>
              <span className="neutral-pill">{humanize(p.status)}</span>
            </button>
          ))
        )}
      </section>
      <Modal
        open={!!chosen}
        onOpenChange={(v) => {
          if (!v) setChosen(null);
        }}
        title={`Choose ${chosen?.name ?? "a plan"}`}
        description="Pay using one of the available methods, then submit your screenshot. Paid access starts after review."
      >
        <ErrorBox error={create.error} />
        <label>
          Payment method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {catalog.data?.payment_methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Same-plan renewal adds one month. A different plan starts a new
          one-month term on approval; unused time is not credited.
        </p>
        <button
          className="button full"
          disabled={create.isPending || !method}
          onClick={() => create.mutate()}
        >
          Continue to payment instructions
        </button>
      </Modal>
      <Modal
        open={!!active}
        onOpenChange={(v) => {
          if (!v) setActive(null);
        }}
        title="Your payment request"
        description="Your plan changes only after a platform administrator verifies the payment."
      >
        {active && catalog.data && (
          <PaymentDetails
            key={active.public_id}
            payment={
              payments.data?.find((p) => p.public_id === active.public_id) ??
              active
            }
            catalog={catalog.data}
          />
        )}
      </Modal>
    </>
  );
}
function PaymentDetails({
  payment: p,
  catalog,
}: {
  payment: Payment;
  catalog: Catalog;
}) {
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [reference, setReference] = useState(p.transaction_reference ?? "");
  const [date, setDate] = useState(
    p.paid_on?.slice(0, 10) ?? new Date().toLocaleDateString("en-CA"),
  );
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(
    null,
  );
  const [copyError, setCopyError] = useState<unknown>();
  const editable =
    ["draft", "needs_information"].includes(p.status) &&
    new Date(p.expires_at) > new Date();
  const method = catalog.payment_methods.find(
    (m) => m.id === p.payment_method_id,
  );
  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Mirror the server rule (png/jpg/webp, 5 MB) before spending the upload.
      if (
        !/^image\/(png|jpeg|webp)$/.test(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error("Choose a PNG, JPEG or WebP screenshot up to 5 MB.");
      const form = new FormData();
      form.append("proof", file);
      return api(`payments/${p.public_id}/proof`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["payments"] });
      notify("Screenshot uploaded.");
    },
  });
  const submit = useMutation({
    mutationFn: () =>
      api(
        `payments/${p.public_id}/submit`,
        json("POST", {
          transaction_reference: reference,
          paid_on: date,
          amount: p.amount,
        }),
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["payments"] });
      notify("Payment submitted for review.");
    },
  });
  const qr = useMutation({
    mutationFn: () =>
      api<{ url: string; expires_at: string }>(
        `payments/${p.public_id}/upload-link`,
        json("POST", {}),
      ),
    onSuccess: setLink,
  });
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied to clipboard.");
    } catch (e) {
      setCopyError(e);
    }
  }
  return (
    <>
      <div className="payment-amount">
        PKR {Number(p.amount).toLocaleString()}
        <span className="neutral-pill">{humanize(p.status)}</span>
      </div>
      {p.review_note && <div className="alert">{p.review_note}</div>}
      <ErrorBox error={upload.error ?? submit.error ?? qr.error ?? copyError} />
      {editable && (
        <>
          <h3>{method?.name ?? "Payment instructions"}</h3>
          {Object.entries(method?.details ?? {}).map(([key, value]) => (
            <div className="detail-row" key={key}>
              <div>
                <small>{humanize(key)}</small>
                <strong>{value}</strong>
              </div>
              <button
                className="icon-button"
                aria-label={`Copy ${humanize(key)}`}
                onClick={() => copy(value)}
              >
                <Copy size={16} />
              </button>
            </div>
          ))}
          <p className="muted">
            Send the exact amount above, then add your transaction details.
          </p>
          <label>
            Transaction reference
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              minLength={4}
              maxLength={100}
            />
          </label>
          <label>
            Payment date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="upload-zone">
            <Upload size={25} />
            <strong>
              {upload.isPending
                ? "Uploading…"
                : p.has_proof
                  ? "Replace screenshot"
                  : "Choose payment screenshot"}
            </strong>
            <small>PNG, JPEG or WebP · up to 5 MB</small>
            <input
              aria-label="Payment screenshot"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={upload.isPending}
              onChange={(e) => {
                if (e.target.files?.[0]) upload.mutate(e.target.files[0]);
                // Allow choosing the same file again after a failed upload.
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="button secondary full"
            disabled={qr.isPending}
            onClick={() => qr.mutate()}
          >
            Upload from your phone
          </button>
          {link && (
            <div className="qr-card">
              <QRCodeSVG value={link.url} size={180} />
              <p>
                Scan to upload a screenshot. Expires{" "}
                {new Date(link.expires_at).toLocaleTimeString()}.
              </p>
              <p className="muted">
                Your phone must be able to reach this server.
              </p>
              <button className="text-button" onClick={() => copy(link.url)}>
                Copy mobile link
              </button>
            </div>
          )}
          <button
            className="button full mt"
            disabled={!reference || !date || !p.has_proof || submit.isPending}
            onClick={() => submit.mutate()}
          >
            Submit for review
          </button>
        </>
      )}
      {p.events?.length > 0 && (
        <ol className="timeline">
          {p.events.map((e) => (
            <li key={e.id}>
              <span />
              {humanize(e.status)}
              <small>{new Date(e.created_at + "Z").toLocaleString()}</small>
              {e.note && <p>{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
function humanize(s: string) {
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
type QueuePayment = Payment & { business_name: string; plan_name: string };
type Pagination<T> = { data: T[]; current_page: number; last_page: number };
export function PlatformPage() {
  const identity = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("auth/me"),
  });
  const isAdmin = identity.data?.user.is_superadmin ?? false;
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [tab, setTab] = useState("payments");
  const [page, setPage] = useState(1);
  const [review, setReview] = useState<QueuePayment | null>(null);
  const [decision, setDecision] = useState("approved");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const overview = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () =>
      api<{
        businesses: number;
        active_paid: number;
        pending_payments: number;
        mrr: string;
      }>("platform/overview"),
    enabled: isAdmin,
  });
  const queue = useQuery({
    queryKey: ["platform", tab, page],
    queryFn: () =>
      api<Pagination<Record<string, unknown>>>(`platform/${tab}?page=${page}`),
    enabled: isAdmin && tab !== "plans",
  });
  const plans = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => api<Plan[]>("platform/plans"),
    enabled: isAdmin && tab === "plans",
  });
  const approve = useMutation({
    mutationFn: () =>
      api(
        `platform/payments/${review?.public_id}/review`,
        json("POST", { decision, note, password }),
      ),
    onSuccess: () => {
      setReview(null);
      setPassword("");
      client.invalidateQueries({ queryKey: ["platform"] });
      client.invalidateQueries({ queryKey: ["platform-overview"] });
      client.invalidateQueries({ queryKey: ["business"] });
      notify("Review saved.");
    },
  });
  if (identity.isPending) return <Loading />;
  if (!isAdmin)
    return (
      <main className="standalone">
        <ErrorBox
          error={
            new Error(
              "Platform access required. Sign in with a verified platform administrator account.",
            )
          }
        />
        <Link to="/login">Sign in</Link>
      </main>
    );
  return (
    <>
      <PageTitle
        eyebrow="PLATFORM ADMINISTRATION"
        title="A clear view of the platform."
        description="Restricted operations. Every payment review is recorded."
      />
      <ErrorBox error={overview.error} />
      <div className="stats-grid">
        {[
          ["Businesses", overview.data?.businesses],
          ["Active paid subscriptions", overview.data?.active_paid],
          [
            "Monthly recurring revenue",
            overview.data
              ? `PKR ${Number(overview.data.mrr).toLocaleString()}`
              : undefined,
          ],
        ].map(([name, value]) => (
          <article className="stat" key={name}>
            <span>{name}</span>
            <strong>{value ?? "…"}</strong>
          </article>
        ))}
      </div>
      <div className="tabs" role="navigation" aria-label="Platform sections">
        {["payments", "tenants", "plans", "leads", "audit"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {humanize(t)}
          </button>
        ))}
      </div>
      {tab === "plans" ? (
        plans.isPending ? (
          <Loading />
        ) : (
          <>
            <ErrorBox error={plans.error} />
            <div className="cards-grid">
              {plans.data?.map((p) => (
                <article className="panel" key={p.key}>
                  <h3>{p.name}</h3>
                  <p>
                    PKR {Number(p.prices[0]?.amount).toLocaleString()} / month
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => setPlan(p)}
                  >
                    Edit plan
                  </button>
                </article>
              ))}
            </div>
          </>
        )
      ) : (
        <>
          <ErrorBox error={queue.error} />
          {queue.isPending ? (
            <Loading />
          ) : (
            <section className="panel">
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      {(tab === "payments"
                        ? ["Business", "Plan", "Amount", "Status", "Review"]
                        : tab === "tenants"
                          ? ["Business", "Status", "Created"]
                          : tab === "leads"
                            ? ["Name", "Email", "Type", "Status"]
                            : ["Action", "Subject", "Actor", "Created"]
                      ).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queue.data?.data.map((r, i) => (
                      <tr key={String(r.id ?? r.public_id ?? i)}>
                        {tab === "payments" ? (
                          <>
                            <td>{String(r.business_name)}</td>
                            <td>{String(r.plan_name)}</td>
                            <td>PKR {Number(r.amount).toLocaleString()}</td>
                            <td>{humanize(String(r.status))}</td>
                            <td>
                              {["pending_review", "needs_information"].includes(
                                String(r.status),
                              ) ? (
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setReview(r as unknown as QueuePayment);
                                    setPassword("");
                                    setNote("");
                                    setDecision("approved");
                                    approve.reset();
                                  }}
                                >
                                  Review
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                          </>
                        ) : tab === "tenants" ? (
                          <>
                            <td>{String(r.name)}</td>
                            <td>{String(r.status)}</td>
                            <td>{String(r.created_at)}</td>
                          </>
                        ) : tab === "leads" ? (
                          <>
                            <td>{String(r.name ?? "—")}</td>
                            <td>{String(r.email)}</td>
                            <td>{String(r.type)}</td>
                            <td>{String(r.status)}</td>
                          </>
                        ) : (
                          <>
                            <td>{String(r.action)}</td>
                            <td>{String(r.subject ?? "—")}</td>
                            <td>{String(r.actor_id ?? "System")}</td>
                            <td>{String(r.created_at)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!queue.data?.data.length && (
                  <p className="empty">No records to show yet.</p>
                )}
              </div>
              <div className="pagination">
                <button
                  className="button secondary"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {queue.data?.last_page ?? 1}
                </span>
                <button
                  className="button secondary"
                  disabled={page >= (queue.data?.last_page ?? 1)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </section>
          )}
        </>
      )}
      <Modal
        open={!!review}
        onOpenChange={(v) => {
          if (!v) setReview(null);
        }}
        title={`Review ${review?.business_name ?? "payment"}`}
        description="Verify the actual transaction against your account before approving. Uploading a screenshot alone is not verification."
      >
        <ErrorBox error={approve.error} />
        <p>
          PKR {review?.amount} · {review?.transaction_reference}
        </p>
        <a
          className="button secondary"
          href={`/api/v1/platform/payments/${review?.public_id}/proof`}
          target="_blank"
          rel="noreferrer"
        >
          <FileCheck size={17} />
          Download private proof
        </a>
        <label>
          Decision
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="approved">Approve payment</option>
            <option value="rejected">Reject payment</option>
            <option value="needs_information">Request more information</option>
          </select>
        </label>
        <label>
          Review note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required={decision !== "approved"}
          />
        </label>
        <label>
          Confirm your password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          className="button full"
          disabled={
            !password || approve.isPending || (decision !== "approved" && !note)
          }
          onClick={() => approve.mutate()}
        >
          <LockKeyhole size={16} />
          Save review
        </button>
      </Modal>
      <Modal
        open={!!plan}
        onOpenChange={(v) => {
          if (!v) setPlan(null);
        }}
        title="Edit plan"
        description="Changes affect future purchases and current usage limits. Quoted open payments retain their price."
      >
        {plan && (
          <PlanEditor
            key={plan.key}
            plan={plan}
            onSaved={() => setPlan(null)}
          />
        )}
      </Modal>
      <p className="muted mt">
        Access to tenant operational financial data is excluded from this
        overview.
      </p>
      <Link to="/">Return to workspace</Link>
    </>
  );
}
function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description);
  const [amount, setAmount] = useState(plan.prices[0]?.amount ?? "0");
  const [limits, setLimits] = useState(plan.limits);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      api(
        `platform/plans/${plan.key}`,
        json("PUT", { name, description, amount, limits }),
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["platform-plans"] });
      client.invalidateQueries({ queryKey: ["catalog"] });
      onSaved();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <ErrorBox error={save.error} />
      <label>
        Plan name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Description
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Monthly price (PKR)
        <input
          type="number"
          min="0"
          step="0.01"
          required
          disabled={plan.key === "free"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <div className="form-grid">
        {Object.entries(limits).map(([key, value]) => (
          <label key={key}>
            {humanize(key)}
            <input
              type="number"
              min="1"
              required
              value={value}
              onChange={(e) =>
                setLimits({ ...limits, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <button className="button full" disabled={save.isPending}>
        Save plan
      </button>
    </form>
  );
}
