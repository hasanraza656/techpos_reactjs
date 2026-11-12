import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Banknote,
  ChartNoAxesCombined,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import { useOperations } from "../hooks/useOperations";
import { ops, query } from "../lib/operations";
import { ErrorBox } from "./ui";
type Summary = {
  sales_count: number;
  net_receipts: string;
  cash_refunds: string;
  gross_profit?: string;
  tax_net: string;
  currency: string;
  timezone: string;
};
export function TodayOverview() {
  const o = useOperations();
  const [chosen, setChosen] = useState("");
  const reportBranches =
    o.setup.data?.branches.filter((b) =>
      b.permissions.includes("reports.view"),
    ) ?? [];
  const reportingBranch =
    reportBranches.find((b) => b.public_id === chosen)?.public_id ??
    reportBranches[0]?.public_id ??
    "";
  const permitted = !!reportingBranch;
  const summary = useQuery({
    queryKey: ["overview-today", o.business.tenant.public_id, reportingBranch],
    queryFn: () =>
      ops<Summary>(`reports/summary?${query({ branch: reportingBranch })}`),
    enabled: o.ready && permitted,
  });
  if (!permitted) return null;
  const number = (value: string) =>
    new Intl.NumberFormat(
      o.business.tenant.locale === "ur-Latn"
        ? "en-PK"
        : o.business.tenant.locale,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    ).format(Number(value));
  return (
    <section className="today-overview" aria-label="Today's business summary">
      <header className="today-overview-heading">
        <div>
          <p className="eyebrow">FROM YOUR RECORDED TRANSACTIONS</p>
          <h2>Today, at a glance.</h2>
          <small className="muted">
            {o.business.tenant.timezone} · refunds follow their posting date
          </small>
        </div>
        {o.setup.data && reportBranches.length > 1 && (
          <label>
            Reporting branch
            <select
              value={reportingBranch}
              onChange={(e) => setChosen(e.target.value)}
            >
              {o.setup.data.branches
                .filter((b) => b.permissions.includes("reports.view"))
                .map((b) => (
                  <option key={b.public_id} value={b.public_id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </header>
      <ErrorBox error={summary.error} />
      {summary.error ? (
        <button className="text-button" onClick={() => void summary.refetch()}>
          Retry summary
        </button>
      ) : (
        <div className="today-metric-grid">
          {[
            {
              title: "Net receipts",
              value: summary.data
                ? `${summary.data.currency} ${number(summary.data.net_receipts)}`
                : null,
              help: "Recorded sales less cash refunds",
              Icon: Banknote,
            },
            {
              title: "Completed sales",
              value: summary.data?.sales_count.toLocaleString() ?? null,
              help: "Finalized in this branch today",
              Icon: ReceiptText,
            },
            {
              title:
                summary.data?.gross_profit !== undefined
                  ? "Gross profit"
                  : "Tax total",
              value: summary.data
                ? `${summary.data.currency} ${number(summary.data.gross_profit ?? summary.data.tax_net)}`
                : null,
              help:
                summary.data?.gross_profit !== undefined
                  ? "After recorded inventory cost; before expenses"
                  : "Sales tax less refunded tax",
              Icon: TrendingUp,
            },
            {
              title: "Cash refunds",
              value: summary.data
                ? `${summary.data.currency} ${number(summary.data.cash_refunds)}`
                : null,
              help: "Refunds posted today",
              Icon: ChartNoAxesCombined,
            },
          ].map(({ title, value, help, Icon }) => (
            <article className="today-metric" key={title}>
              <div className="row between">
                <span>{title}</span>
                <Icon size={18} />
              </div>
              {value !== null ? (
                <strong>{value}</strong>
              ) : (
                <span className="metric-skeleton" aria-label="Loading metric" />
              )}
              <small>{help}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
