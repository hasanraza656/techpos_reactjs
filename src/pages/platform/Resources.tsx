import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { Loading, ErrorBox, Modal } from "../../components/ui";
import type { Row, Page } from "./shared";
import {
  Head,
  Empty,
  Status,
  Pager,
  useRows,
  usePortal,
  money,
  date,
  value,
  title,
} from "./shared";
import {
  clientAction,
  userAction,
  invoiceAction,
  subscriptionAction,
  reviewAction,
} from "./commands";
export const resourceMeta: Record<
  string,
  {
    title: string;
    description: string;
    permission: string;
    statuses?: string[];
  }
> = {
  clients: {
    title: "Your clients.",
    description:
      "Business profiles, owners, access state and operational usage.",
    permission: "clients.view",
    statuses: ["active", "suspended", "archived"],
  },
  inventory: {
    title: "Inventory across every client.",
    description:
      "Read-only stock positions by client, branch and warehouse. Cost visibility follows your platform role.",
    permission: "inventory.view",
    statuses: ["low", "out", "inactive"],
  },
  "client-sales": {
    title: "Client sales receipts.",
    description:
      "Read-only finalized records; client currencies remain separate.",
    permission: "client_sales.view",
  },
  payments: {
    title: "Payments & approvals.",
    description:
      "Proofs, references, review decisions and linked subscription invoices.",
    permission: "payments.view",
    statuses: [
      "pending_review",
      "approved",
      "needs_information",
      "rejected",
      "draft",
      "expired",
    ],
  },
  subscriptions: {
    title: "Subscriptions & renewal dates.",
    description:
      "Catalog plan, effective access, term dates and audited lifecycle controls.",
    permission: "subscriptions.view",
    statuses: ["active", "grace", "suspended", "expired", "cancelled"],
  },
  invoices: {
    title: "Subscription billing invoices.",
    description:
      "Issued snapshots, due dates, payment links and printable documents.",
    permission: "billing.view",
    statuses: ["issued", "overdue", "paid", "void"],
  },
  users: {
    title: "People & account access.",
    description:
      "Create accounts, manage profiles, verification, memberships and account state.",
    permission: "users.view",
    statuses: ["active", "suspended", "archived"],
  },
  leads: {
    title: "Business leads.",
    description:
      "Real contact, demo and newsletter submissions from your website.",
    permission: "leads.view",
    statuses: ["new", "contacted", "qualified", "closed", "spam"],
  },
  audit: {
    title: "An accountable platform.",
    description:
      "Filter platform actions and client audit history. Passwords and private proof files are never shown here.",
    permission: "audit.view",
  },
};
export function ResourcePage({ section }: { section: string }) {
  const p = usePortal();
  const meta = resourceMeta[section];
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [due, setDue] = useState("");
  const [branch, setBranch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(1);
    setStatus("");
    setSearch("");
    setDue("");
    setBranch("");
    setWarehouse("");
    setPlan("");
  }, [section, p.client]);
  const has = (key: string) => p.identity.permissions.includes(key);
  const result = useRows(
    section,
    { q: debounced, status, due, page, branch, warehouse, plan },
    !!meta && has(meta.permission),
  );
  if (!meta)
    return <Empty>Choose an administration area from the sidebar.</Empty>;
  if (!has(meta.permission))
    return (
      <ErrorBox
        error={new Error("Your platform role does not permit this section.")}
      />
    );
  return (
    <>
      <Head
        title={meta.title}
        description={meta.description}
        action={
          section === "clients" && has("clients.manage") ? (
            <button
              className="button"
              onClick={() => p.open(clientAction(p.lookup))}
            >
              <Plus size={16} />
              Add client
            </button>
          ) : section === "users" && has("users.manage") ? (
            <button className="button" onClick={() => p.open(userAction())}>
              <Plus size={16} />
              Create user
            </button>
          ) : section === "invoices" && has("billing.manage") ? (
            <button
              className="button"
              disabled={!p.lookup.plans.length || !p.lookup.clients.length}
              onClick={() => p.open(invoiceAction(p.lookup, p.client))}
            >
              <Plus size={16} />
              Issue invoice
            </button>
          ) : undefined
        }
      />
      <div className="platform-filters">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Search platform records"
            placeholder={
              section === "inventory"
                ? "Product, SKU, category or client…"
                : "Search records…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {meta.statuses && (
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {meta.statuses.map((s) => (
              <option key={s} value={s}>
                {title(s)}
              </option>
            ))}
          </select>
        )}
        {["subscriptions", "invoices"].includes(section) && (
          <select
            aria-label="Due date filter"
            value={due}
            onChange={(e) => {
              setDue(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="next7">Next 7 days</option>
            <option value="next30">Next 30 days</option>
          </select>
        )}
        {["clients", "subscriptions", "payments"].includes(section) &&
          p.lookup.plans.length > 0 && (
            <select
              aria-label="Filter plan"
              value={plan}
              onChange={(e) => {
                setPlan(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All plans</option>
              {p.lookup.plans.map((v) => (
                <option key={value(v, "key")} value={value(v, "key")}>
                  {value(v, "name")}
                </option>
              ))}
            </select>
          )}
        {section === "inventory" && p.client && (
          <>
            <select
              aria-label="Filter branch"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setWarehouse("");
                setPage(1);
              }}
            >
              <option value="">All branches</option>
              {p.lookup.branches?.map((v) => (
                <option
                  key={value(v, "public_id")}
                  value={value(v, "public_id")}
                >
                  {value(v, "name")}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter warehouse"
              value={warehouse}
              onChange={(e) => {
                setWarehouse(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All warehouses</option>
              {p.lookup.warehouses?.map((v) => (
                <option
                  key={value(v, "public_id")}
                  value={value(v, "public_id")}
                >
                  {value(v, "name")}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          className="button secondary"
          onClick={() => {
            setSearch("");
            setStatus("");
            setDue("");
            setPlan("");
            setBranch("");
            setWarehouse("");
            setPage(1);
          }}
        >
          Clear filters
        </button>
      </div>
      <section className="panel">
        <ErrorBox error={result.error} />
        {result.isPending ? (
          <Loading />
        ) : result.error ? (
          <button
            className="button secondary"
            onClick={() => void result.refetch()}
          >
            Retry loading
          </button>
        ) : !result.data?.data.length ? (
          <Empty />
        ) : (
          <DataTable section={section} rows={result.data.data} />
        )}
        <Pager data={result.data} page={page} setPage={setPage} />
      </section>
    </>
  );
}
export function DataTable({ section, rows }: { section: string; rows: Row[] }) {
  const p = usePortal();
  const [detail, setDetail] = useState<{ type: string; row: Row } | null>(null);
  const has = (k: string) => p.identity.permissions.includes(k);
  const columns: Record<string, string[]> = {
    clients: ["Client", "Plan / renewal", "Usage", "Status", "Actions"],
    inventory: [
      "Product",
      "Client / location",
      "Price",
      "Available stock",
      ...(has("inventory.cost") ? ["Recorded cost"] : []),
      "Actions",
    ],
    "client-sales": ["Receipt", "Client / branch", "Date", "Total", "Actions"],
    payments: [
      "Business",
      "Plan / method",
      "Amount / reference",
      "Status",
      "Review",
    ],
    subscriptions: [
      "Client",
      "Catalog / effective plan",
      "Renewal / grace",
      "Status",
      "Actions",
    ],
    invoices: ["Invoice / client", "Plan", "Amount", "Due / status", "Actions"],
    users: ["User", "Businesses / last login", "Access", "Status", "Actions"],
    leads: ["Name / email", "Type", "Message", "Status", "Actions"],
    audit: ["Action", "Business / subject", "Actor", "Date", "Details"],
  };
  const openState = (endpoint: string, name: string, action: string) =>
    p.open({
      title: `${title(action)} ${name}`,
      endpoint,
      initial: { action },
      fields: [],
      description:
        "This updates access while preserving all historical transactions.",
    });
  return (
    <>
      <div className="responsive-table">
        <table className="platform-table">
          <thead>
            <tr>
              {(columns[section] ?? []).map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, index) => (
              <tr
                key={
                  value(r, "public_id", String(r.id ?? index)) +
                  String(r.warehouse ?? index)
                }
              >
                {section === "clients" ? (
                  <>
                    <td>
                      <strong>{value(r, "name")}</strong>
                      {!!r.owner_email && (
                        <small>{value(r, "owner_email")}</small>
                      )}
                      <small>
                        {value(r, "industry", "Industry not selected")} ·{" "}
                        {value(r, "currency")}
                      </small>
                    </td>
                    <td>
                      {title(value(r, "effective_plan", "free"))}
                      <small>{date(r.ends_at)}</small>
                    </td>
                    <td>
                      {value(r, "products_count", "0")} products
                      <small>{value(r, "users_count", "0")} users</small>
                    </td>
                    <td>
                      <Status status={r.status} />
                    </td>
                    <td>
                      <div className="platform-row-actions">
                        <button
                          onClick={() => setDetail({ type: "client", row: r })}
                        >
                          Details
                        </button>
                        {has("clients.manage") && (
                          <>
                            <button
                              onClick={() =>
                                // The list row lacks contact/notes; load the
                                // full profile so the form is not blanked.
                                void api<Row>(`platform/clients/${r.public_id}`).then(
                                  (full) => p.open(clientAction(p.lookup, full)),
                                  () => setDetail({ type: "client", row: r }),
                                )
                              }
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                openState(
                                  `clients/${r.public_id}/state`,
                                  value(r, "name"),
                                  r.status === "active"
                                    ? "suspend"
                                    : "activate",
                                )
                              }
                            >
                              {r.status === "active"
                                ? "Suspend"
                                : "Restore access"}
                            </button>
                            <button
                              onClick={() =>
                                openState(
                                  `clients/${r.public_id}/state`,
                                  value(r, "name"),
                                  "archive",
                                )
                              }
                            >
                              Archive
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </>
                ) : section === "inventory" ? (
                  <>
                    <td>
                      <div className="platform-product">
                        {!!r.image && (
                          <img
                            src={(r.image as { url: string }).url}
                            alt={value(r, "name")}
                            loading="lazy"
                          />
                        )}
                        <div>
                          <strong>{value(r, "name")}</strong>
                          <small>
                            {value(r, "sku")} ·{" "}
                            {value(r, "category", value(r, "type"))}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {value(r, "business_name")}
                      <small>
                        {value(r, "branch_name", "Not stocked")} /{" "}
                        {value(r, "warehouse_name", "—")}
                      </small>
                    </td>
                    <td>{money(r.selling_price, value(r, "currency"))}</td>
                    <td>
                      <strong>
                        {value(r, "available", "0")} {value(r, "unit")}
                      </strong>
                      <small>
                        {value(r, "reserved_quantity", "0")} reserved · reorder{" "}
                        {value(r, "reorder_level", "0")}
                      </small>
                    </td>
                    {has("inventory.cost") && (
                      <td>
                        {money(r.stock_value, value(r, "currency"))}
                        <small>Unit default: {value(r, "cost_price")}</small>
                      </td>
                    )}
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setDetail({ type: "movements", row: r })}
                      >
                        Stock history
                      </button>
                    </td>
                  </>
                ) : section === "payments" ? (
                  <>
                    <td>
                      <strong>{value(r, "business_name")}</strong>
                      <small>{date(r.created_at)}</small>
                    </td>
                    <td>
                      {value(r, "plan_name")}
                      <small>{value(r, "method")}</small>
                    </td>
                    <td>
                      {money(r.amount, value(r, "currency", "PKR"))}
                      <small>{value(r, "transaction_reference")}</small>
                    </td>
                    <td>
                      <Status status={r.status} />
                      {!!r.invoice_number && (
                        <small>{value(r, "invoice_number")}</small>
                      )}
                    </td>
                    <td>
                      <div className="platform-row-actions">
                        <button
                          onClick={() => setDetail({ type: "payment", row: r })}
                        >
                          Details
                        </button>
                        {has("payments.review") &&
                        ["pending_review", "needs_information"].includes(
                          String(r.status),
                        ) ? (
                          <button
                            className="text-button"
                            onClick={() => p.open(reviewAction(r))}
                          >
                            Review
                          </button>
                        ) : (
                          <span className="muted">
                            {r.reviewed_at
                              ? date(r.reviewed_at)
                              : "Awaiting submission"}
                          </span>
                        )}
                      </div>
                    </td>
                  </>
                ) : section === "subscriptions" ? (
                  <>
                    <td>
                      <strong>{value(r, "name")}</strong>
                      <small>{date(r.starts_at)}</small>
                    </td>
                    <td>
                      {value(r, "plan_name")}
                      <small>
                        Effective: {title(value(r, "effective_plan"))}
                      </small>
                    </td>
                    <td>
                      {date(r.ends_at)}
                      <small>Grace ends: {date(r.grace_ends_at)}</small>
                    </td>
                    <td>
                      <Status status={r.subscription_status} />
                    </td>
                    <td>
                      <div className="platform-row-actions">
                        <button
                          onClick={() => setDetail({ type: "events", row: r })}
                        >
                          History
                        </button>
                        {has("subscriptions.manage") && (
                          <button
                            onClick={() =>
                              p.open(subscriptionAction(r, p.lookup))
                            }
                          >
                            Manage
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                ) : section === "invoices" ? (
                  <>
                    <td>
                      <strong>{value(r, "number")}</strong>
                      <small>{value(r, "business_name")}</small>
                    </td>
                    <td>
                      {value(r, "plan_name")}
                      <small>{date(r.issued_on)}</small>
                    </td>
                    <td>
                      {money(r.amount, value(r, "currency", "PKR"))}
                      <small>{value(r, "transaction_reference")}</small>
                    </td>
                    <td>
                      {date(r.due_on)}
                      <small>
                        <Status
                          status={
                            r.status === "issued" &&
                            String(r.due_on) <
                              new Date().toISOString().slice(0, 10)
                              ? "overdue"
                              : r.status
                          }
                        />
                      </small>
                    </td>
                    <td>
                      <div className="platform-row-actions">
                        <a
                          href={`/api/v1/platform/invoices/${r.public_id}/document`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View / print
                        </a>
                        {r.status === "issued" && has("billing.manage") && (
                          <button
                            onClick={() =>
                              p.open({
                                title: "Void unpaid invoice",
                                endpoint: `invoices/${r.public_id}/void`,
                                fields: [],
                                description:
                                  "Paid invoices cannot be voided. Linked pending payments must be reviewed first.",
                              })
                            }
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                ) : section === "users" ? (
                  <>
                    <td>
                      <strong>{value(r, "name")}</strong>
                      <small>{value(r, "email")}</small>
                    </td>
                    <td>
                      {value(r, "businesses", "0")} businesses
                      <small>Last login: {date(r.last_login)}</small>
                    </td>
                    <td>
                      {r.is_superadmin ? "Root administrator" : "User / staff"}
                      <small>
                        {r.email_verified_at
                          ? "Email verified"
                          : "Email unverified"}
                      </small>
                    </td>
                    <td>
                      <Status status={r.status} />
                    </td>
                    <td>
                      <div className="platform-row-actions">
                        <button
                          onClick={() => setDetail({ type: "user", row: r })}
                        >
                          Details
                        </button>
                        {has("users.manage") && (
                          <>
                            <button onClick={() => p.open(userAction(r))}>
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                openState(
                                  `users/${r.public_id}/state`,
                                  value(r, "name"),
                                  r.status === "active"
                                    ? "suspend"
                                    : "activate",
                                )
                              }
                            >
                              {r.status === "active" ? "Suspend" : "Activate"}
                            </button>
                            <button
                              onClick={() =>
                                openState(
                                  `users/${r.public_id}/state`,
                                  value(r, "name"),
                                  "archive",
                                )
                              }
                            >
                              Archive
                            </button>
                            {!r.email_verified_at && (
                              <button
                                onClick={() =>
                                  openState(
                                    `users/${r.public_id}/state`,
                                    value(r, "name"),
                                    "verify",
                                  )
                                }
                              >
                                Verify email
                              </button>
                            )}
                            <button
                              onClick={() =>
                                openState(
                                  `users/${r.public_id}/state`,
                                  value(r, "name"),
                                  "revoke_sessions",
                                )
                              }
                            >
                              Revoke sessions
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </>
                ) : section === "client-sales" ? (
                  <>
                    <td>
                      <strong>{value(r, "receipt_number")}</strong>
                      <small>{value(r, "channel")}</small>
                    </td>
                    <td>
                      {value(r, "business_name")}
                      <small>
                        {value(r, "branch_name")} · {value(r, "cashier")}
                      </small>
                    </td>
                    <td>{date(r.finalized_at)}</td>
                    <td>
                      {money(r.total, value(r, "currency"))}
                      <small>
                        Tax: {money(r.tax_total, value(r, "currency"))}
                      </small>
                    </td>
                    <td>
                      <a
                        className="text-button"
                        href={`/api/v1/platform/client-sales/${r.public_id}/document`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View receipt
                      </a>
                    </td>
                  </>
                ) : section === "leads" ? (
                  <>
                    <td>
                      <strong>{value(r, "name")}</strong>
                      <small>{value(r, "email")}</small>
                    </td>
                    <td>{title(value(r, "type"))}</td>
                    <td>
                      <span className="platform-message">
                        {value(r, "message")}
                      </span>
                    </td>
                    <td>
                      <Status status={r.status} />
                    </td>
                    <td>
                      {has("leads.manage") && (
                        <button
                          className="text-button"
                          onClick={() =>
                            p.open({
                              title: "Update lead",
                              endpoint: `leads/${r.id}`,
                              method: "PUT",
                              fields: [
                                {
                                  key: "status",
                                  label: "Follow-up status",
                                  type: "select",
                                  options: [
                                    "new",
                                    "contacted",
                                    "qualified",
                                    "closed",
                                    "spam",
                                  ].map((v) => ({ value: v, label: title(v) })),
                                },
                              ],
                              initial: { status: r.status },
                            })
                          }
                        >
                          Update status
                        </button>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td>{value(r, "action")}</td>
                    <td>
                      {value(r, "business_name")}
                      <small>{value(r, "subject")}</small>
                    </td>
                    <td>{value(r, "actor_name", "System")}</td>
                    <td>{date(r.created_at)}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setDetail({ type: "audit", row: r })}
                      >
                        Details
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <Detail
          type={detail.type}
          row={detail.row}
          close={() => setDetail(null)}
        />
      )}
    </>
  );
}
function auditMetadata(metadata: unknown) {
  // Malformed legacy metadata must not throw during render (no error boundary).
  if (typeof metadata !== "string") return JSON.stringify(metadata, null, 2);
  try {
    return JSON.stringify(JSON.parse(metadata), null, 2);
  } catch {
    return metadata;
  }
}
export function Detail({
  type,
  row,
  close,
}: {
  type: string;
  row: Row;
  close: () => void;
}) {
  const p = usePortal();
  const endpoint =
    type === "client"
      ? `clients/${row.public_id}`
      : type === "user"
        ? `users/${row.public_id}`
        : type === "payment"
          ? `payments/${row.public_id}`
          : type === "events"
            ? `clients/${row.public_id}/subscription-events`
            : `inventory/${row.public_id}/movements`;
  const q = useQuery({
    queryKey: ["platform-detail", endpoint],
    queryFn: () => api<unknown>(`platform/${endpoint}`),
    enabled: type !== "audit",
  });
  const data = q.data as Row | undefined;
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
      title={
        type === "client"
          ? value(row, "name")
          : type === "user"
            ? value(row, "name")
            : title(type)
      }
      description="Authorized platform view. Client operational records remain unchanged."
    >
      <ErrorBox error={q.error} />
      {type === "payment" && data ? (
        <>
          <Status status={data.status} />
          <h3>{money(data.amount, value(data, "currency"))}</h3>
          <p>Reference: {value(data, "transaction_reference")}</p>
          <p>
            Paid on: {date(data.paid_on)} · Reviewed: {date(data.reviewed_at)}
          </p>
          {!!data.review_note && <p>{value(data, "review_note")}</p>}
          {!!data.has_proof && (
            <a
              className="button secondary"
              href={`/api/v1/platform/payments/${row.public_id}/proof`}
              target="_blank"
              rel="noreferrer"
            >
              Download private proof
            </a>
          )}
          <h3>Status timeline</h3>
          <div className="platform-event-list">
            {((data.events ?? []) as Row[]).map((event, i) => (
              <article key={i}>
                <strong>{title(value(event, "status"))}</strong>
                <small>{date(event.created_at)}</small>
                {!!event.note && <p>{value(event, "note")}</p>}
              </article>
            ))}
          </div>
        </>
      ) : type === "audit" ? (
        <pre className="platform-json">
          {auditMetadata(row.metadata)}
        </pre>
      ) : q.isPending ? (
        <Loading />
      ) : type === "client" && data ? (
        <>
          <div className="platform-detail-summary">
            <Status status={data.status} />
            <span>
              {value(data, "currency")} · {value(data, "timezone")}
            </span>
          </div>
          <p>
            {value(data, "industry", "No industry selected")} · Effective plan{" "}
            {title(value(data, "effective_plan"))}
          </p>
          <h3>Owners</h3>
          {((data.owners ?? []) as Row[]).map((u) => (
            <p key={value(u, "public_id")}>
              {value(u, "name")} · {value(u, "email")}
            </p>
          ))}
          <h3>Usage</h3>
          <div className="platform-detail-summary">
            {Object.entries((data.usage ?? {}) as Row).map(([key, count]) => (
              <div key={key}>
                <strong>{String(count)}</strong>
                <small className="table-subtext">{title(key)}</small>
              </div>
            ))}
          </div>
          <div className="row platform-wrap">
            {p.identity.permissions.includes("clients.manage") && (
              <button
                className="button"
                onClick={() => {
                  close();
                  p.open(clientAction(p.lookup, data));
                }}
              >
                Edit client profile
              </button>
            )}
            {p.identity.permissions.includes("inventory.view") && (
              <Link
                className="button secondary"
                to={`/platform/inventory?client=${data.public_id}`}
                onClick={close}
              >
                Client inventory
              </Link>
            )}
            {p.identity.permissions.includes("client_access.view") && (
              <Link
                className="button secondary"
                to={`/platform/client-access?client=${data.public_id}`}
                onClick={close}
              >
                Team permissions
              </Link>
            )}
            {p.identity.permissions.includes("subscriptions.view") && (
              <Link
                className="button secondary"
                to={`/platform/subscriptions?client=${data.public_id}`}
                onClick={close}
              >
                Subscription
              </Link>
            )}
          </div>
        </>
      ) : type === "user" && data ? (
        <>
          <p>{value(data, "email")}</p>
          <h3>Business memberships</h3>
          {((data.memberships ?? []) as Row[]).map((m) => (
            <div className="list-row" key={value(m, "public_id")}>
              <strong>{value(m, "name")}</strong>
              <span>{m.is_owner ? "Owner" : "Employee"}</span>
            </div>
          ))}
          <h3>Platform staff roles</h3>
          {((data.platform_roles ?? []) as Row[]).map((m) => (
            <p key={value(m, "public_id")}>{value(m, "name")}</p>
          ))}
          {p.identity.permissions.includes("access.manage") &&
            !data.is_superadmin && (
              <button
                className="button"
                onClick={() => {
                  close();
                  p.open({
                    title: "Assign platform staff roles",
                    endpoint: `users/${data.public_id}/platform-roles`,
                    fields: [
                      {
                        key: "roles",
                        label: "Platform roles",
                        type: "role-list",
                      },
                    ],
                    initial: {
                      roles: ((data.platform_roles ?? []) as Row[]).map(
                        (r) => r.public_id,
                      ),
                    },
                  });
                }}
              >
                Assign platform roles
              </button>
            )}
        </>
      ) : (
        <div className="platform-event-list">
          {(Array.isArray(q.data)
            ? q.data
            : ((q.data as Page | undefined)?.data ?? [])
          ).map((r: Row, i: number) => (
            <article key={i}>
              <strong>{title(value(r, "action", value(r, "type")))}</strong>
              <small>
                {date(r.created_at)} ·{" "}
                {value(r, "actor", value(r, "user_name", "System"))}
              </small>
              <p>{value(r, "reason")}</p>
              {!!r.quantity && (
                <p>
                  Quantity: {value(r, "quantity")} · {value(r, "branch_name")}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}
