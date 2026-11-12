import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  Lightbulb,
  Settings2,
  Send,
  PackageSearch,
  TrendingUp,
} from "lucide-react";
import { useOperations } from "../hooks/useOperations";
import { api, json } from "../lib/api";
import { query } from "../lib/operations";
import type { Module } from "../lib/types";
import { OperationLocation } from "../components/OperationLocation";
import { PageTitle, Loading, ErrorBox, Modal } from "../components/ui";
type Suggestion = {
  product: string;
  name: string;
  sku: string;
  unit: string;
  available: string;
  reorder_level: string;
  low_stock: boolean;
  observed_days?: number;
  daily_velocity?: string;
  forecast_next_7_days?: string;
  days_of_stock?: number | null;
  safety_stock?: string;
  calculated_reorder_point?: string;
  recommended_quantity?: string;
  proposal_key?: string;
  stockout_risk?: boolean;
  excess_stock?: boolean;
  dead_stock?: boolean;
  explanation: string;
  review?: { decision: string; note: string } | null;
};
type InventoryResult = {
  data: Suggestion[];
  current_page: number;
  last_page: number;
  total: number;
  mode: string;
  from: string;
  until_exclusive: string;
  timezone: string;
  limitations: string[];
};
type Parameters = {
  lookback_days: number;
  lead_time_days: number;
  safety_days: number;
  review_days: number;
  overstock_days: number;
  dead_stock_days: number;
  service_factor: number;
  alpha: number;
  method: "moving_average" | "exponential_smoothing";
};
export function IntelligencePage() {
  const o = useOperations();
  const client = useQueryClient();
  const tenant = o.business.tenant.public_id;
  const [advanced, setAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"inventory" | "assistant">("inventory");
  const [settings, setSettings] = useState(false);
  const [review, setReview] = useState<Suggestion | null>(null);
  const modules = useQuery({
    queryKey: ["modules", tenant],
    queryFn: () => api<Module[]>("modules"),
  });
  const forecast = modules.data?.find((m) => m.key === "forecasting");
  const inventory = useQuery({
    queryKey: [
      "intelligence-inventory",
      tenant,
      o.branch,
      o.warehouse,
      advanced,
      page,
    ],
    queryFn: () =>
      api<InventoryResult>(
        "intelligence/inventory?" +
          query({
            branch: o.branch,
            warehouse: o.warehouse,
            advanced: advanced ? 1 : 0,
            page,
          }),
      ),
    enabled: o.ready && tab === "inventory",
    retry: false,
  });
  if (o.setup.error) return <ErrorBox error={o.setup.error} />;
  if (o.setup.isPending) return <Loading />;
  return (
    <>
      <PageTitle
        eyebrow="BUILT-IN INTELLIGENCE"
        title="Know what needs your attention."
        description="Explainable reports and stock recommendations from your own business records. No external model or API key is used."
        action={
          o.business.permissions.includes("settings.manage") &&
          forecast?.enabled ? (
            <button
              className="button secondary"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={17} />
              Calculation settings
            </button>
          ) : undefined
        }
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
      <div className="tabs mt">
        <button
          className={tab === "inventory" ? "active" : ""}
          onClick={() => setTab("inventory")}
        >
          <PackageSearch size={16} />
          Stock intelligence
        </button>
        <button
          className={tab === "assistant" ? "active" : ""}
          onClick={() => setTab("assistant")}
        >
          <Lightbulb size={16} />
          Built-in assistant
        </button>
      </div>
      {tab === "assistant" ? (
        <BuiltinAssistant
          branch={o.branch}
          warehouse={o.warehouse}
          timezone={o.business.tenant.timezone}
        />
      ) : (
        <>
          <ErrorBox error={modules.error} />
          <section className="panel mt">
            <div className="section-heading">
              <div>
                <h2>
                  {advanced
                    ? "Demand and reorder recommendations"
                    : "Low-stock products"}
                </h2>
                <p className="muted">
                  {advanced
                    ? `${inventory.data?.from ?? "…"} to ${inventory.data?.until_exclusive ?? "…"} (exclusive), ${o.business.tenant.timezone}. Completed days only.`
                    : "Current available stock compared with each product’s configured reorder level."}
                </p>
              </div>
              {forecast?.enabled ? (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={advanced}
                    onChange={(e) => {
                      setAdvanced(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Statistical forecasts
                </label>
              ) : (
                <Link className="text-button" to="/modules">
                  {forecast?.included
                    ? "Enable forecasting modules"
                    : "Compare forecasting availability"}
                </Link>
              )}
            </div>
            <ErrorBox error={inventory.error} />
            {inventory.isPending ? (
              <Loading />
            ) : !inventory.data?.data.length ? (
              <div className="empty">
                <PackageSearch size={32} />
                <h3>No matching stock items.</h3>
                <p>
                  {advanced
                    ? "Add tracked products to begin collecting demand history."
                    : "No active tracked product is at or below its reorder level in this stockroom."}
                </p>
              </div>
            ) : (
              <>
                <div className="responsive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Available</th>
                        {advanced ? (
                          <>
                            <th>Demand / day</th>
                            <th>Estimated coverage</th>
                            <th>Suggested quantity</th>
                          </>
                        ) : (
                          <th>Reorder level</th>
                        )}
                        <th>Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.data.data.map((item) => (
                        <tr key={item.product}>
                          <td>
                            <strong>{item.name}</strong>
                            <small className="table-subtext">
                              {item.sku} · {item.unit}
                            </small>
                            {item.low_stock && (
                              <span className="neutral-pill">Low stock</span>
                            )}
                          </td>
                          <td>{item.available}</td>
                          {advanced ? (
                            <>
                              <td>
                                {item.daily_velocity}
                                <small className="table-subtext">
                                  {item.observed_days} observed days
                                </small>
                              </td>
                              <td>
                                {item.days_of_stock === null
                                  ? "No observed demand"
                                  : `${item.days_of_stock} days`}
                                {item.stockout_risk && (
                                  <small className="danger-text table-subtext">
                                    Below calculated reorder point
                                  </small>
                                )}
                                {item.excess_stock && (
                                  <small className="table-subtext">
                                    Review excess coverage
                                  </small>
                                )}
                                {item.dead_stock && (
                                  <small className="table-subtext">
                                    No demand in configured dead-stock window
                                  </small>
                                )}
                              </td>
                              <td>
                                {item.recommended_quantity}
                                {item.review ? (
                                  <small className="table-subtext">
                                    Review: {item.review.decision}
                                  </small>
                                ) : (
                                  o.permissions.includes("inventory.adjust") &&
                                  Number(item.recommended_quantity) > 0 && (
                                    <button
                                      className="text-button"
                                      onClick={() => setReview(item)}
                                    >
                                      Review recommendation
                                    </button>
                                  )
                                )}
                              </td>
                            </>
                          ) : (
                            <td>{item.reorder_level}</td>
                          )}
                          <td>
                            <details>
                              <summary>Why this result?</summary>
                              <p className="intelligence-explanation">
                                {item.explanation}
                              </p>
                              {advanced && (
                                <p className="muted">
                                  Safety stock: {item.safety_stock}
                                  <br />
                                  Calculated reorder point:{" "}
                                  {item.calculated_reorder_point}
                                  <br />
                                  Next seven days: {
                                    item.forecast_next_7_days
                                  }{" "}
                                  units
                                </p>
                              )}
                            </details>
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
                    Page {page} of {inventory.data.last_page} ·{" "}
                    {inventory.data.total} products
                  </span>
                  <button
                    className="button secondary"
                    disabled={page >= inventory.data.last_page}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
            {advanced && (
              <aside className="alert mt">
                <TrendingUp size={18} />
                <div>
                  {inventory.data?.limitations.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </aside>
            )}
          </section>
        </>
      )}
      <Modal
        open={settings}
        onOpenChange={setSettings}
        title="Calculation parameters"
        description="Configure business assumptions. Supplier lead times here are estimates, not measured supplier performance."
      >
        {settings && (
          <CalculationSettings
            onSaved={() => {
              setSettings(false);
              client.invalidateQueries({
                queryKey: ["intelligence-inventory"],
              });
            }}
          />
        )}
      </Modal>
      <Modal
        open={!!review}
        onOpenChange={(v) => {
          if (!v) setReview(null);
        }}
        title="Review replenishment recommendation"
        description="This records a human review and evidence. It does not create or authorize a binding purchase order."
      >
        {review && (
          <RecommendationReview
            key={review.proposal_key}
            item={review}
            branch={o.branch}
            warehouse={o.warehouse}
            onSaved={() => {
              setReview(null);
              client.invalidateQueries({
                queryKey: ["intelligence-inventory"],
              });
            }}
          />
        )}
      </Modal>
    </>
  );
}
function CalculationSettings({ onSaved }: { onSaved: () => void }) {
  const form = useForm<Parameters>();
  const [version, setVersion] = useState<number | null>(null);
  const current = useQuery({
    queryKey: ["intelligence-settings"],
    queryFn: async () => {
      const result = await api<{ version: number; parameters: Parameters }>(
        "intelligence/settings",
      );
      form.reset(result.parameters);
      setVersion(result.version);
      return result;
    },
  });
  const save = useMutation({
    mutationFn: (parameters: Parameters) =>
      api("intelligence/settings", json("PUT", { version, parameters })),
    onSuccess: onSaved,
  });
  if (current.error) return <ErrorBox error={current.error} />;
  if (version === null) return <Loading />;
  const fields: [keyof Parameters, string, number, number, number][] = [
    ["lookback_days", "Completed observation days", 7, 90, 1],
    ["lead_time_days", "Assumed supplier lead days", 0, 180, 1],
    ["safety_days", "Minimum safety days", 0, 180, 1],
    ["review_days", "Review interval days", 1, 90, 1],
    ["overstock_days", "Excess coverage threshold days", 1, 365, 1],
    ["dead_stock_days", "No-demand window days", 7, 90, 1],
    ["service_factor", "Safety service factor", 0, 4, 0.01],
    ["alpha", "Smoothing alpha", 0.01, 1, 0.01],
  ];
  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <ErrorBox error={save.error} />
      <div className="form-grid">
        {fields.map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              required
              min={min}
              max={max}
              step={step}
              {...form.register(key, { valueAsNumber: true })}
            />
          </label>
        ))}
      </div>
      <label>
        Forecast method
        <select {...form.register("method")}>
          <option value="moving_average">Moving average</option>
          <option value="exponential_smoothing">Exponential smoothing</option>
        </select>
      </label>
      <p className="muted">
        Safety stock is the greater of demand × safety days and service factor ×
        observed daily deviation × √lead time. These assumptions are not a
        guarantee of service level.
      </p>
      <button className="button full mt" disabled={save.isPending}>
        Save calculation settings
      </button>
    </form>
  );
}
function RecommendationReview({
  item,
  branch,
  warehouse,
  onSaved,
}: {
  item: Suggestion;
  branch: string;
  warehouse: string;
  onSaved: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID());
  const [decision, setDecision] = useState("approved");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api(
        "intelligence/reorder-reviews",
        json("POST", {
          idempotency_key: key,
          branch,
          warehouse,
          product: item.product,
          proposal_key: item.proposal_key,
          decision,
          note,
        }),
      ),
    onSuccess: onSaved,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <ErrorBox error={save.error} />
      <h3>
        {item.name} · {item.recommended_quantity} {item.unit}
      </h3>
      <p className="muted mt">{item.explanation}</p>
      <label>
        Decision
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="approved">Approve recommendation for planning</option>
          <option value="rejected">Reject recommendation</option>
        </select>
      </label>
      <label>
        Review note
        <textarea
          required
          minLength={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button className="button full mt" disabled={save.isPending}>
        Record review · no purchase order
      </button>
    </form>
  );
}
const reports = [
  ["today_sales", "Sales summary"],
  ["low_stock", "Low stock"],
  ["reorder", "Reorder recommendations"],
  ["top_products", "Top ten products"],
  ["peak_hours", "Peak shopping hours"],
  ["sales_comparison", "Compare periods"],
] as const;
type Answer = {
  tool: string;
  explanation: string;
  data: Record<string, unknown>;
  external_provider_used: false;
};
function BuiltinAssistant({
  branch,
  warehouse,
  timezone,
}: {
  branch: string;
  warehouse: string;
  timezone: string;
}) {
  const [question, setQuestion] = useState("");
  const [tool, setTool] = useState<string>("today_sales");
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const result = useMutation({
    mutationFn: (natural: boolean) =>
      api<Answer>(
        "intelligence/assistant",
        json("POST", {
          ...(natural ? { question } : { tool }),
          arguments: { branch, warehouse, ...(custom ? { from, to } : {}) },
        }),
      ),
  });
  return (
    <section className="panel mt">
      <h2>Ask a supported business question.</h2>
      <p className="muted">
        This mode selects authorized reports using deterministic rules. It
        cannot run arbitrary SQL, make purchases or use an external AI provider.
        Date context: {timezone}.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          result.mutate(true);
        }}
      >
        <label>
          Your question
          <input
            required
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Show low-stock products"
          />
        </label>
        <button className="button mt" disabled={result.isPending}>
          <Send size={16} />
          Ask built-in assistant
        </button>
      </form>
      <div className="form-grid mt">
        <label>
          Or select a report
          <select value={tool} onChange={(e) => setTool(e.target.value)}>
            {reports.map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary report-run"
          disabled={result.isPending || !branch}
          onClick={() => result.mutate(false)}
        >
          Run selected report
        </button>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={custom}
          onChange={(e) => setCustom(e.target.checked)}
        />
        Choose explicit report dates
      </label>
      {custom && (
        <div className="form-grid">
          <label>
            From date
            <input
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Through date
            <input
              type="date"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      )}
      <ErrorBox error={result.error} />
      {result.isPending ? (
        <Loading />
      ) : (
        result.data && (
          <div
            className="intelligence-answer mt"
            role="region"
            aria-label="Built-in assistant answer"
          >
            <span className="badge">BUILT-IN · NO EXTERNAL PROVIDER</span>
            <p className="mt">{result.data.explanation}</p>
            <AnswerView answer={result.data} />
          </div>
        )
      )}
    </section>
  );
}
function AnswerView({ answer }: { answer: Answer }) {
  const data = answer.data;
  if (answer.tool === "sales_comparison") {
    const current = data.current as Record<string, unknown>;
    const previous = data.previous as Record<string, unknown>;
    return (
      <div className="stats-grid mt">
        {[
          ["Current net receipts", current.net_receipts],
          ["Previous net receipts", previous.net_receipts],
          ["Change", data.net_receipts_change],
          [
            "Change percentage",
            data.change_percent === null
              ? "Not comparable"
              : String(data.change_percent) + "%",
          ],
        ].map(([label, value]) => (
          <article className="stat" key={String(label)}>
            <span>{String(label)}</span>
            <strong className="stat-small">{String(value)}</strong>
          </article>
        ))}
      </div>
    );
  }
  const rows = (
    Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.data)
        ? data.data
        : null
  ) as Record<string, unknown>[] | null;
  if (rows) {
    if (!rows.length)
      return <p className="empty">No matching records in this scope.</p>;
    const fields =
      answer.tool === "peak_hours"
        ? ["hour", "sales_count", "gross_receipts"]
        : answer.tool === "top_products"
          ? ["name", "quantity", "gross_receipts"]
          : [
              "name",
              "sku",
              "available",
              ...(answer.tool === "reorder"
                ? ["daily_velocity", "recommended_quantity"]
                : ["reorder_level"]),
            ];
    return (
      <div className="responsive-table mt">
        <table>
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field}>{field.replaceAll("_", " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {fields.map((field) => (
                  <td key={field}>{String(row[field] ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <>
      <p className="muted mt">
        {String(data.currency ?? "")} · {String(data.from_utc ?? "")} to{" "}
        {String(data.until_utc ?? "")} (exclusive)
      </p>
      <div className="stats-grid mt">
        {[
          ["Finalized sales", "sales_count"],
          ["Cash credit notes", "returns_count"],
          ["Net receipts", "net_receipts"],
          ["Net tax", "tax_net"],
          ["Gross profit", "gross_profit"],
        ]
          .filter(([, key]) => data[key] !== undefined)
          .map(([label, key]) => (
            <article className="stat" key={key}>
              <span>{label}</span>
              <strong className="stat-small">{String(data[key])}</strong>
            </article>
          ))}
      </div>
      <p className="muted mt">{String(data.note ?? "")}</p>
    </>
  );
}
