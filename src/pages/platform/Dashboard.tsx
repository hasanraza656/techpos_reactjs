import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  ChartNoAxesCombined,
  Check,
  CreditCard,
  FileText,
  Layers,
  Package,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "../../lib/api";
import { Loading, ErrorBox } from "../../components/ui";
import type { Row } from "./shared";
import {
  Head,
  Empty,
  Status,
  useRows,
  usePortal,
  money,
  date,
  value,
} from "./shared";
import { DataTable } from "./Resources";
export function Dashboard() {
  const p = usePortal();
  const q = useQuery({
    queryKey: ["platform-dashboard", p.client],
    queryFn: () =>
      api<Row>(
        `platform/overview?${new URLSearchParams({ client: p.client })}`,
      ),
  });
  const pending = useRows(
    "payments",
    { status: "pending_review", per_page: 5 },
    p.identity.permissions.includes("payments.view"),
  );
  const d = q.data;
  return (
    <>
      <Head
        title="A clear view of the platform."
        description="Clients, cash collections, renewals and the work that needs attention."
        action={
          p.identity.permissions.includes("clients.view") ? (
            <Link className="button secondary" to="/platform/clients">
              Browse clients
              <ArrowUpRight size={16} />
            </Link>
          ) : undefined
        }
      />
      <ErrorBox error={q.error} />
      <div className="platform-kpis">
        {(
          [
            [
              "Clients",
              d?.businesses,
              "Active businesses in this scope",
              Building2,
            ],
            [
              "Active paid clients",
              d?.active_paid,
              "Verified, unexpired paid access",
              Layers,
            ],
            [
              "Monthly run rate",
              d ? money(d.mrr) : null,
              "Current catalog prices · not cash collected",
              Wallet,
            ],
            [
              "Collected this month",
              d ? money(d.collected_this_month) : null,
              "Approved payments by review date",
              CreditCard,
            ],
            [
              "Inventory products",
              d?.products,
              "Active catalog records",
              Package,
            ],
            ["Users", d?.users, "Accounts in the selected scope", Users],
            [
              "Payments to review",
              d?.pending_payments,
              "Waiting for a human decision",
              Check,
            ],
            [
              "Renewals within 14 days",
              d?.renewals_due,
              "Overdue invoices: " + String(d?.overdue_invoices ?? 0),
              FileText,
            ],
          ] as [string, unknown, string, typeof Building2][]
        ).map(([label, note, help, Icon]) => (
          <article className="platform-kpi" key={String(label)}>
            <div>
              <span>{String(label)}</span>
              <Icon size={19} />
            </div>
            <strong>
              {note === undefined || note === null ? "…" : String(note)}
            </strong>
            <small>{String(help)}</small>
          </article>
        ))}
      </div>
      <div className="platform-dashboard-grid">
        <section className="panel">
          <div className="row between">
            <div>
              <h2>Subscription collections</h2>
              <p className="muted">Approved payments · PKR · last six months</p>
            </div>
            <ChartNoAxesCombined size={22} />
          </div>
          <div className="platform-bars">
            {((d?.history ?? []) as Row[]).map((h) => {
              const max = Math.max(
                1,
                ...((d?.history ?? []) as Row[]).map((x) =>
                  Number(x.collected),
                ),
              );
              return (
                <div key={value(h, "month")}>
                  <strong>{money(h.collected)}</strong>
                  <div>
                    <span
                      style={{
                        height: `${Math.max(2, (Number(h.collected) / max) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>{value(h, "month")}</small>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <h2>Client health</h2>
          <div className="platform-health">
            {[
              ["Active", d?.active_clients],
              ["Free", d?.free_clients],
              ["Suspended", d?.suspended_clients],
              ["Overdue invoices", d?.overdue_invoices],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <span>{String(k)}</span>
                <strong>{String(v ?? "…")}</strong>
              </div>
            ))}
          </div>
          <p className="muted">
            Unpaid invoices and pending proofs never count as collected revenue.
          </p>
          {p.identity.permissions.includes("subscriptions.view") && (
            <Link to="/platform/subscriptions" className="text-button">
              Review subscriptions
              <ArrowUpRight size={15} />
            </Link>
          )}
        </section>
      </div>
      {p.identity.permissions.includes("payments.view") && (
        <section className="panel mt">
          <div className="row between">
            <div>
              <h2>Payment approval queue</h2>
              <p className="muted">
                Verify the transaction, then approve, reject or request more
                information.
              </p>
            </div>
            <Link className="text-button" to="/platform/payments">
              All payments
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <ErrorBox error={pending.error} />
          {pending.isPending ? (
            <Loading />
          ) : !pending.data?.data.length ? (
            <Empty>
              No payment proofs are waiting for review. Clients remain on Free
              until a paid transfer is approved.
            </Empty>
          ) : (
            <DataTable section="payments" rows={pending.data.data} />
          )}
        </section>
      )}
      <section className="panel mt">
        <h2>Recently registered clients</h2>
        {((d?.recent_clients ?? []) as Row[]).map((c) => (
          <div className="list-row" key={value(c, "public_id")}>
            <Building2 size={20} />
            <div>
              <strong>{value(c, "name")}</strong>
              <small>{date(c.created_at)}</small>
            </div>
            <Status status={c.status} />
            <button
              className="text-button"
              onClick={() => {
                p.setClient(value(c, "public_id"));
              }}
            >
              Filter client
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
