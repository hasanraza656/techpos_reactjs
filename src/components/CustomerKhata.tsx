import { useRef, useState, useSyncExternalStore } from "react";
import type { Ref } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Printer, Wallet } from "lucide-react";
import { json, useClient } from "../lib/api";
import {
  attemptKey,
  creditState,
  ledgerLabels,
  methodLabel,
  ops,
  query,
} from "../lib/operations";
import type {
  CollectionMethod,
  Customer,
  CustomerPayment,
  CustomerStatement,
  LedgerEntry,
  OpsSetup,
} from "../lib/operations";
import { formatted, scaled } from "../lib/decimal";
import { printElement } from "../lib/printing";
import { ErrorBox, Loading } from "./ui";
import { PaymentReceipt } from "./Receipt";

type Business = { name: string; currency: string; timezone: string };
type Attempt = { fingerprint: string; key: string } | null;

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}
/** Today's calendar date (YYYY-MM-DD) in the business time zone. */
function businessToday(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function entryTime(value: string, timeZone: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, {
        timeZone,
        dateStyle: "medium",
        timeStyle: "short",
      });
}
/** Canonical 2-dp amount for the wire, or a readable error. */
function money(value: string, label: string, allowNegative = false) {
  const text = value.trim();
  let amount: bigint;
  try {
    amount = scaled(text || "x");
  } catch {
    throw new Error(`${label}: enter an amount like 1500 or 1500.50.`);
  }
  if (!allowNegative && amount < 0n)
    throw new Error(`${label} cannot be negative.`);
  if ((amount < 0n ? -amount : amount) >= 10n ** 14n)
    throw new Error(`${label} is outside the supported range.`);
  return amount;
}
function signed(amount: string) {
  try {
    const v = scaled(amount);
    return v > 0n ? `+${amount}` : v < 0n ? `−${formatted(-v)}` : amount;
  } catch {
    return amount;
  }
}

export function CustomerKhata({
  customer,
  setup,
  branch,
  business,
  canCollect,
  canManage,
  onChanged,
}: {
  customer: Customer;
  setup: OpsSetup;
  branch: string;
  business: Business;
  canCollect: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const tenant = useClient((s) => s.tenant);
  const [tab, setTab] = useState<"statement" | "collect" | "settings">(
    "statement",
  );
  const [to, setTo] = useState(() => businessToday(business.timezone));
  const [from, setFrom] = useState(() => addDays(to, -29));
  const [page, setPage] = useState(1);
  const statementRef = useRef<HTMLDivElement>(null);
  // The server accepts at most 366 days per statement.
  const rangeOk =
    !!from && !!to && from <= to && addDays(from, 365) >= to;
  const [printError, setPrintError] = useState<unknown>();
  const statement = useQuery({
    queryKey: ["customer-ledger", tenant, customer.public_id, from, to, page],
    queryFn: ({ signal }) =>
      ops<CustomerStatement>(
        `customers/${customer.public_id}/ledger?` + query({ from, to, page }),
        { signal },
      ),
    enabled: rangeOk,
    placeholderData: (previous) => previous,
  });
  const live = statement.data?.customer;
  const credit = creditState(live ?? customer);
  const balance = live?.balance ?? customer.balance ?? "0.00";
  const limit = live?.credit_limit ?? customer.credit_limit ?? "0.00";
  // Opening balance is allowed only before the first ledger entry; the server enforces it.
  const looksUnused =
    !!statement.data &&
    !statement.data.entries.length &&
    scaled(statement.data.opening_balance) === 0n &&
    credit.balance === 0n;
  const tabs = [
    ["statement", "Statement"],
    ...(canCollect ? [["collect", "Receive payment"]] : []),
    ...(canManage ? [["settings", "Credit settings"]] : []),
  ] as [typeof tab, string][];
  return (
    <>
      <div className="khata-summary">
        <article className="stat">
          <span>Balance owed</span>
          <strong className="stat-small">
            {business.currency} {balance}
          </strong>
        </article>
        <article className="stat">
          <span>Credit limit</span>
          <strong className="stat-small">
            {credit.enabled ? `${business.currency} ${limit}` : "Credit off"}
          </strong>
        </article>
        <article className="stat">
          <span>Available credit</span>
          <strong className="stat-small">
            {business.currency} {formatted(credit.available)}
          </strong>
        </article>
      </div>
      <div className="tabs" role="tablist" aria-label="Khata sections">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "statement" && (
        <section aria-label="Statement">
          <div className="khata-filters">
            <label>
              From date
              <input
                type="date"
                value={from}
                max={to}
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
                min={from}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={!statement.data}
              onClick={() => {
                setPrintError(undefined);
                try {
                  printElement(statementRef.current, "a4");
                } catch (e) {
                  setPrintError(e);
                }
              }}
            >
              <Printer size={16} />
              Print statement
            </button>
          </div>
          {!rangeOk && (
            <div className="alert warn compact" role="status">
              Choose a start date on or before the end date, at most 366 days
              apart.
            </div>
          )}
          <ErrorBox error={statement.error ?? printError} />
          {statement.isPending ? (
            <Loading message="Loading statement…" />
          ) : (
            statement.data && (
              <Statement
                ref={statementRef}
                data={statement.data}
                business={business}
              />
            )
          )}
          {statement.data && statement.data.last_page > 1 && (
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page <= 1 || statement.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {statement.data.current_page} of{" "}
                {statement.data.last_page}
              </span>
              <button
                className="button secondary"
                disabled={
                  page >= statement.data.last_page || statement.isFetching
                }
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
      {tab === "collect" && canCollect && (
        <CollectForm
          key={customer.public_id}
          customer={customer}
          balance={balance}
          setup={setup}
          branch={branch}
          business={business}
          onSaved={onChanged}
        />
      )}
      {tab === "settings" && canManage && (
        <CreditSettings
          customer={customer}
          limit={limit}
          balance={balance}
          branch={branch}
          allowOpening={looksUnused}
          onSaved={onChanged}
        />
      )}
    </>
  );
}

function Statement({
  ref,
  data,
  business,
}: {
  ref: Ref<HTMLDivElement>;
  data: CustomerStatement;
  business: Business;
}) {
  return (
    <div className="khata-statement" ref={ref}>
      <h2>
        {business.name} · Customer statement
      </h2>
      <p className="muted">
        {data.customer.name}
        {data.customer.phone ? ` · ${data.customer.phone}` : ""} · {data.from}{" "}
        to {data.to}
      </p>
      <div className="khata-statement-totals">
        <span>
          Opening balance: {business.currency} {data.opening_balance}
        </span>
        <span>
          Closing balance: {business.currency} {data.closing_balance}
        </span>
      </div>
      {!data.entries.length ? (
        <p className="empty">No khata entries in this date range.</p>
      ) : (
        <div className="responsive-table">
          <table className="khata-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th className="num">Amount</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.public_id}>
                  <td>{entryTime(e.created_at, business.timezone)}</td>
                  <td>
                    {ledgerLabels[e.type] ?? e.type}
                    {e.method && <small>{methodLabel(e.method)}</small>}
                  </td>
                  <td className="wrap">
                    {entryReference(e)}
                    {(e.note || e.branch || e.actor) && (
                      <small>
                        {[
                          e.note,
                          e.override_reason
                            ? `Over-limit approval: ${e.override_reason}`
                            : null,
                          e.branch,
                          e.actor,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    )}
                  </td>
                  <td
                    className={`num ${scaled(e.amount) > 0n ? "amount-up" : "amount-down"}`}
                  >
                    {signed(e.amount)}
                  </td>
                  <td className="num">{e.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function entryReference(e: LedgerEntry) {
  if (e.sale) return `Sale ${e.sale.receipt_number}`;
  if (e.type === "credit_return") return "Sale return";
  return e.reference ?? "—";
}

function CollectForm({
  customer,
  balance,
  setup,
  branch,
  business,
  onSaved,
}: {
  customer: Customer;
  balance: string;
  setup: OpsSetup;
  branch: string;
  business: Business;
  onSaved: () => void;
}) {
  const online = useOnline();
  const [method, setMethod] = useState<CollectionMethod>("cash");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<CustomerPayment | null>(null);
  const attempt = useRef<Attempt>(null);
  const lock = useRef(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const shift = setup.shift?.branch === branch ? setup.shift : null;
  const owed = (() => {
    try {
      return scaled(balance);
    } catch {
      return 0n;
    }
  })();
  const branchName =
    setup.branches.find((b) => b.public_id === branch)?.name ?? "this branch";
  async function submit() {
    if (lock.current) return;
    setError(undefined);
    try {
      if (!online)
        throw new Error("Receiving a payment needs a connection.");
      const value = money(amount, "Amount");
      if (value <= 0n) throw new Error("Enter an amount greater than zero.");
      if (value > owed)
        throw new Error(
          `The amount is more than the balance owed (${business.currency} ${formatted(owed)}). Advances are not recorded on the khata.`,
        );
      if (method === "cash" && !shift)
        throw new Error(
          `Cash goes into your register drawer. Open your shift for ${branchName} in Cashier first.`,
        );
      const ref = reference.trim();
      if (method !== "cash" && (ref.length < 4 || ref.length > 120))
        throw new Error(
          "Enter the bank or card terminal reference (4–120 characters).",
        );
      const body = {
        branch,
        ...(method === "cash" ? { shift: shift!.public_id } : {}),
        method,
        amount: formatted(value),
        ...(method !== "cash" ? { reference: ref } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      lock.current = true;
      setBusy(true);
      const result = await ops<{ payment: CustomerPayment }>(
        `customers/${customer.public_id}/payments`,
        json("POST", { ...body, idempotency_key: attemptKey(attempt, body) }),
      );
      attempt.current = null;
      setReceipt(result.payment);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (receipt)
    return (
      <section aria-label="Payment receipt">
        <div className="alert compact" role="status">
          Payment recorded. New balance {business.currency}{" "}
          {receipt.balance_after}.
        </div>
        <ErrorBox error={error} />
        <PaymentReceipt
          ref={receiptRef}
          payment={receipt}
          businessName={business.name}
          currency={business.currency}
        />
        <div className="row mt">
          <button
            className="button secondary"
            onClick={() => {
              try {
                printElement(receiptRef.current, "80");
              } catch (e) {
                setError(e);
              }
            }}
          >
            <Printer size={16} />
            Print payment receipt
          </button>
          <button
            className="button"
            onClick={() => {
              setReceipt(null);
              setAmount("");
              setReference("");
              setNote("");
              setError(undefined);
            }}
          >
            Done
          </button>
        </div>
      </section>
    );
  return (
    <form
      aria-label="Receive payment"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ErrorBox error={error} />
      {owed <= 0n && (
        <div className="alert compact" role="status">
          This customer has no balance to collect.
        </div>
      )}
      {!online && (
        <div className="alert warn compact" role="status">
          Receiving a payment needs a connection.
        </div>
      )}
      <div className="form-grid">
        <label>
          Payment method
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as CollectionMethod)}
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="external_card">Card (external terminal)</option>
          </select>
        </label>
        <label>
          Amount received
          <input
            inputMode="decimal"
            required
            value={amount}
            placeholder={`Up to ${formatted(owed)}`}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
      </div>
      {method === "cash" && !shift && (
        <div className="alert warn compact" role="status">
          <Wallet size={18} />
          <span>
            Cash collections go into your own open register shift for{" "}
            {branchName}. <Link to="/pos">Open a shift in Cashier</Link>, or
            choose bank transfer or card.
          </span>
        </div>
      )}
      {method !== "cash" && (
        <label>
          Transaction reference
          <input
            required
            minLength={4}
            maxLength={120}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <small className="muted">
            Confirm the money on the bank account or card terminal first. Tech
            POS records it; it does not authorize it.
          </small>
        </label>
      )}
      <label>
        Note (optional)
        <input
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="row mt">
        <button
          type="button"
          className="button secondary"
          disabled={owed <= 0n}
          onClick={() => setAmount(formatted(owed))}
        >
          Full balance
        </button>
        <button
          className="button"
          disabled={
            busy || !online || owed <= 0n || (method === "cash" && !shift)
          }
        >
          {busy ? "Recording…" : "Record payment"}
        </button>
      </div>
    </form>
  );
}

function CreditSettings({
  customer,
  limit,
  balance,
  branch,
  allowOpening,
  onSaved,
}: {
  customer: Customer;
  limit: string;
  balance: string;
  branch: string;
  allowOpening: boolean;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [newLimit, setNewLimit] = useState(limit);
  const [kind, setKind] = useState<"adjustment" | "opening_balance">(
    "adjustment",
  );
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<unknown>();
  const attempt = useRef<Attempt>(null);
  const saveLimit = useMutation({
    mutationFn: (value: string) =>
      ops(
        `customers/${customer.public_id}`,
        json("PUT", {
          branch,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          price_tier: customer.price_tier,
          // Required by the save endpoint; rows without it fail with a clear 422.
          ...(customer.marketing_consent !== undefined
            ? { marketing_consent: customer.marketing_consent }
            : {}),
          credit_limit: value,
        }),
      ),
    onSuccess: () => {
      notify("Credit limit saved.");
      onSaved();
    },
  });
  const entry = useMutation({
    mutationFn: (body: {
      type: "opening_balance" | "adjustment";
      amount: string;
      note: string;
    }) =>
      ops<{ balance: string }>(
        `customers/${customer.public_id}/ledger-adjustments`,
        json("POST", { ...body, idempotency_key: attemptKey(attempt, body) }),
      ),
    onSuccess: (r) => {
      attempt.current = null;
      setAmount("");
      setNote("");
      notify(`Khata updated. Balance is now ${r.balance}.`);
      client.invalidateQueries({ queryKey: ["customer-ledger"] });
      onSaved();
    },
  });
  const opening = allowOpening && kind === "opening_balance";
  return (
    <>
      <form
        aria-label="Credit limit"
        onSubmit={(e) => {
          e.preventDefault();
          setLocalError(undefined);
          try {
            saveLimit.mutate(formatted(money(newLimit, "Credit limit")));
          } catch (err) {
            setLocalError(err);
          }
        }}
      >
        <h3>Credit limit</h3>
        <p className="muted">
          0 turns credit off for this customer. Sales above the limit are
          blocked unless a credit manager approves them with a reason.
        </p>
        <ErrorBox error={saveLimit.error} />
        <div className="khata-filters">
          <label>
            Credit limit
            <input
              inputMode="decimal"
              required
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
            />
          </label>
          <button className="button" disabled={saveLimit.isPending}>
            {saveLimit.isPending ? "Saving…" : "Save limit"}
          </button>
        </div>
      </form>
      <form
        className="mt"
        aria-label="Khata entry"
        onSubmit={(e) => {
          e.preventDefault();
          setLocalError(undefined);
          try {
            const value = money(amount, "Amount");
            if (value <= 0n)
              throw new Error("Enter an amount greater than zero.");
            const text = note.trim();
            if (text.length < 5 || text.length > 500)
              throw new Error("Write a note of 5–500 characters.");
            let signedValue = value;
            if (!opening && direction === "down") {
              signedValue = -value;
              if (scaled(balance) + signedValue < 0n)
                throw new Error(
                  `A decrease cannot exceed the balance owed (${balance}).`,
                );
            }
            entry.mutate({
              type: opening ? "opening_balance" : "adjustment",
              amount: formatted(signedValue),
              note: text,
            });
          } catch (err) {
            setLocalError(err);
          }
        }}
      >
        <h3>{opening ? "Opening balance" : "Adjust balance"}</h3>
        <p className="muted">
          Entries are permanent and audited. Correct a mistake with another
          adjustment.
        </p>
        <ErrorBox error={entry.error ?? localError} />
        <div className="form-grid">
          {allowOpening && (
            <label>
              Entry type
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="adjustment">Adjustment</option>
                <option value="opening_balance">
                  Opening balance (first entry only)
                </option>
              </select>
            </label>
          )}
          {!opening && (
            <label>
              Direction
              <select
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as typeof direction)
                }
              >
                <option value="up">Increase balance owed (+)</option>
                <option value="down">Decrease balance owed (−)</option>
              </select>
            </label>
          )}
          <label>
            Amount
            <input
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </div>
        <label>
          {opening ? "Note" : "Reason for adjustment"}
          <input
            required
            minLength={5}
            maxLength={500}
            value={note}
            placeholder={
              opening ? "Balance carried over from the old register" : ""
            }
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="button full mt" disabled={entry.isPending}>
          {entry.isPending
            ? "Saving…"
            : opening
              ? "Record opening balance"
              : "Record adjustment"}
        </button>
      </form>
    </>
  );
}
