import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useOperations } from "../hooks/useOperations";
import { ops, query } from "../lib/operations";
import type { Page, SaleDocument } from "../lib/operations";
import type { Module } from "../lib/types";
import { api, json } from "../lib/api";
import { scaled, formatted } from "../lib/decimal";
import { printElement } from "../lib/printing";
import { ErrorBox, Loading, Modal, PageTitle } from "../components/ui";
import { OperationLocation } from "../components/OperationLocation";
import { Receipt } from "../components/Receipt";

function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function SalesPage() {
  const o = useOperations();
  const [from, setFrom] = useState(() => localDate(o.business.tenant.timezone));
  const [to, setTo] = useState(from);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const list = useQuery({
    queryKey: [
      "sale-history",
      o.business.tenant.public_id,
      o.branch,
      from,
      to,
      page,
    ],
    queryFn: () =>
      ops<
        Page<
          Pick<
            SaleDocument,
            | "public_id"
            | "receipt_number"
            | "total"
            | "currency"
            | "finalized_at"
          >
        >
      >("sales?" + query({ branch: o.branch, from, to, page })),
    enabled: o.ready,
  });
  if (o.setup.error) return <ErrorBox error={o.setup.error} />;
  if (o.setup.isPending) return <Loading />;
  return (
    <>
      <PageTitle
        title="Sales, with a clear record."
        description="Finalized sales remain unchanged. Returns create separate cash credit notes."
      />
      {o.setup.data && (
        <OperationLocation
          setup={o.setup.data}
          branch={o.branch}
          warehouse={o.warehouse}
          onBranch={o.setBranch}
          onWarehouse={o.setWarehouse}
        />
      )}
      <div className="form-grid">
        <label>
          From date
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Through date
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <ErrorBox error={list.error} />
      <section className="panel mt">
        {list.isPending ? (
          <Loading />
        ) : !list.data?.data.length ? (
          <div className="empty">No finalized sales in this date range.</div>
        ) : (
          <>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Posted</th>
                    <th>Total</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((s) => (
                    <tr key={s.public_id}>
                      <td>
                        <small>{s.receipt_number}</small>
                      </td>
                      <td>
                        {new Date(s.finalized_at + "Z").toLocaleString(
                          undefined,
                          { timeZone: o.business.tenant.timezone },
                        )}
                      </td>
                      <td>
                        {s.currency} {s.total}
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setSelected(s.public_id)}
                        >
                          View sale
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {list.data.last_page}
              </span>
              <button
                className="button secondary"
                disabled={page >= list.data.last_page}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
      <Modal
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected("");
        }}
        title="Sale record"
        description="The original receipt is preserved when a cash return is recorded."
      >
        {selected && (
          <SaleDetail
            key={selected}
            id={selected}
            shift={
              o.setup.data?.shift?.branch === o.branch
                ? o.setup.data.shift.public_id
                : undefined
            }
            canReturn={o.permissions.includes("sales.refund")}
          />
        )}
      </Modal>
    </>
  );
}
function SaleDetail({
  id,
  shift,
  canReturn,
}: {
  id: string;
  shift?: string;
  canReturn: boolean;
}) {
  const client = useQueryClient();
  const sale = useQuery({
    queryKey: ["sale-document", id],
    queryFn: () => ops<SaleDocument>(`sales/${id}`),
  });
  const modules = useQuery({
    queryKey: ["return-entitlement"],
    queryFn: () => api<Module[]>("modules"),
    enabled: canReturn,
  });
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<unknown>();
  const [returning, setReturning] = useState(false);
  const [credit, setCredit] = useState<{
    receipt_number: string;
    total: string;
  } | null>(null);
  if (sale.error) return <ErrorBox error={sale.error} />;
  if (!sale.data) return <Loading />;
  const document = sale.data;
  const cashOnly = document.payments.every((p) => p.method === "cash");
  return (
    <>
      <ErrorBox error={error} />
      <Receipt ref={ref} sale={document} />
      <button
        className="button secondary full mt"
        onClick={() => {
          try {
            printElement(ref.current, "80");
          } catch (e) {
            setError(e);
          }
        }}
      >
        <Printer size={16} />
        Print original receipt
      </button>
      {credit && (
        <div className="alert mt" role="status">
          Cash credit note {credit.receipt_number} · {document.currency}{" "}
          {credit.total}. Return recorded once.
        </div>
      )}
      {canReturn && (
        <section className="mt">
          <h3>Cash return</h3>
          <ErrorBox error={modules.error} />
          {!cashOnly ? (
            <p className="muted">
              This source sale has an external payment. External/split-method
              refund reconciliation is not available yet.
            </p>
          ) : !modules.data?.find((m) => m.key === "returns")?.enabled ? (
            <p className="muted">
              Enable Returns in <Link to="/modules">Modules</Link> on an
              eligible plan to record a cash return.
            </p>
          ) : !shift ? (
            <p className="muted">
              Open your assigned shift in <Link to="/pos">Cashier</Link> before
              refunding cash.
            </p>
          ) : returning ? (
            <ReturnForm
              sale={document}
              shift={shift}
              onSaved={async (r) => {
                setReturning(false);
                setCredit(r);
                await Promise.all([
                  client.invalidateQueries({ queryKey: ["sale-document", id] }),
                  client.invalidateQueries({
                    queryKey: ["operations-bootstrap"],
                  }),
                  client.invalidateQueries({ queryKey: ["report-summary"] }),
                  client.invalidateQueries({ queryKey: ["products"] }),
                  client.invalidateQueries({ queryKey: ["pos-products"] }),
                ]);
              }}
            />
          ) : (
            <button
              className="button secondary full mt"
              onClick={() => setReturning(true)}
            >
              Record cash return
            </button>
          )}
        </section>
      )}
    </>
  );
}
function ReturnForm({
  sale,
  shift,
  onSaved,
}: {
  sale: SaleDocument;
  shift: string;
  onSaved: (r: { receipt_number: string; total: string }) => void;
}) {
  const [key] = useState(crypto.randomUUID());
  const [reason, setReason] = useState("");
  const [values, setValues] = useState(() =>
    sale.lines.map(() => ({ quantity: "0.000", restock: true })),
  );
  const [localError, setLocalError] = useState<unknown>();
  const save = useMutation({
    mutationFn: async () => {
      const lines = sale.lines.flatMap((l, i) =>
        scaled(values[i].quantity, 3) > 0n
          ? [
              {
                product: l.product,
                quantity: values[i].quantity,
                restock: values[i].restock,
              },
            ]
          : [],
      );
      return ops<{ receipt_number: string; total: string }>(
        `sales/${sale.public_id}/returns`,
        json("POST", { idempotency_key: key, shift, reason, lines }),
      );
    },
    onSuccess: onSaved,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setLocalError(undefined);
        try {
          const quantities = values.map((v) => scaled(v.quantity, 3));
          if (!quantities.some((q) => q > 0n))
            throw new Error("Enter a return quantity for at least one line.");
          save.mutate();
        } catch (err) {
          setLocalError(err);
        }
      }}
    >
      <ErrorBox error={save.error ?? localError} />
      {sale.lines.map((l, i) => (
        <div className="tender-row" key={l.product ?? i}>
          <label>
            Return quantity · {l.name}
            <input
              aria-label={`Return quantity for ${l.name}`}
              inputMode="decimal"
              required
              value={values[i].quantity}
              onChange={(e) =>
                setValues((items) =>
                  items.map((v, j) =>
                    j === i ? { ...v, quantity: e.target.value } : v,
                  ),
                )
              }
            />
            <small className="muted">
              Unreturned:{" "}
              {formatted(
                scaled(l.quantity, 3) - scaled(l.returned_quantity ?? "0", 3),
                3,
              )}
            </small>
          </label>
          {!!l.stock_tracked && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={values[i].restock}
                onChange={(e) =>
                  setValues((items) =>
                    items.map((v, j) =>
                      j === i ? { ...v, restock: e.target.checked } : v,
                    ),
                  )
                }
              />
              Goods are sellable and returned to stock
            </label>
          )}
        </div>
      ))}
      <label>
        Return reason
        <input
          required
          minLength={3}
          maxLength={255}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <p className="muted">
        The server calculates the refund from original quantities, discounts and
        tax. Unrestocked goods keep their original cost expense. This records
        cash paid out from your open shift.
      </p>
      <button className="button full mt" disabled={save.isPending}>
        {save.isPending ? "Recording…" : "Confirm cash refund"}
      </button>
    </form>
  );
}
type Summary = {
  currency: string;
  timezone: string;
  sales_count: number;
  returns_count: number;
  gross_receipts: string;
  cash_refunds: string;
  net_receipts: string;
  tax_net: string;
  revenue_ex_tax: string;
  sale_discounts: string;
  cost_of_goods_sold?: string;
  gross_profit?: string;
  payments_net: Record<string, string>;
  note: string;
};
export function ReportsPage() {
  const o = useOperations();
  const [from, setFrom] = useState(() => localDate(o.business.tenant.timezone));
  const [to, setTo] = useState(from);
  const summary = useQuery({
    queryKey: [
      "report-summary",
      o.business.tenant.public_id,
      o.branch,
      from,
      to,
    ],
    queryFn: () =>
      ops<Summary>("reports/summary?" + query({ branch: o.branch, from, to })),
    enabled: o.ready,
  });
  if (o.setup.error) return <ErrorBox error={o.setup.error} />;
  if (o.setup.isPending) return <Loading />;
  const r = summary.data;
  return (
    <>
      <PageTitle
        title="Numbers you can trace."
        description="Branch sales and cash returns reconcile to immutable source documents."
      />
      {o.setup.data && (
        <OperationLocation
          setup={o.setup.data}
          branch={o.branch}
          warehouse={o.warehouse}
          onBranch={o.setBranch}
          onWarehouse={o.setWarehouse}
        />
      )}
      <div className="form-grid">
        <label>
          From date
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through date
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        Business time zone: {o.business.tenant.timezone}. Longer date ranges
        require Advanced reporting to be included and enabled.
      </p>
      <ErrorBox error={summary.error} />
      {summary.isPending ? (
        <Loading />
      ) : (
        r && (
          <>
            <div className="stats-grid mt">
              {[
                ["Gross receipts", r.gross_receipts],
                ["Cash refunds", r.cash_refunds],
                ["Net receipts", r.net_receipts],
                ["Net tax", r.tax_net],
                ["Revenue excluding tax", r.revenue_ex_tax],
                ...(r.gross_profit !== undefined
                  ? [
                      ["Recorded cost of goods", r.cost_of_goods_sold!],
                      ["Gross profit", r.gross_profit],
                    ]
                  : []),
              ].map(([label, value]) => (
                <article className="stat" key={label}>
                  <span>{label}</span>
                  <strong className="stat-small">
                    {r.currency} {value}
                  </strong>
                </article>
              ))}
            </div>
            <section className="panel mt">
              <h2>Reconciliation</h2>
              <div className="detail-row">
                <span>Finalized sales</span>
                <strong>{r.sales_count}</strong>
              </div>
              <div className="detail-row">
                <span>Cash credit notes</span>
                <strong>{r.returns_count}</strong>
              </div>
              <div className="detail-row">
                <span>Discounts on posted sales</span>
                <strong>{r.sale_discounts}</strong>
              </div>
              {Object.entries(r.payments_net).map(([method, value]) => (
                <div className="detail-row" key={method}>
                  <span>{method.replaceAll("_", " ")} · net recorded</span>
                  <strong>{value}</strong>
                </div>
              ))}
              <p className="muted mt">{r.note}</p>
            </section>
          </>
        )
      )}
    </>
  );
}
