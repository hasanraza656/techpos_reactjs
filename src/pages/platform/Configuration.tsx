import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ErrorBox } from "../../components/ui";
import type { Row } from "./shared";
import { Head, Status, usePortal, value, title, money } from "./shared";
export function PlansPage() {
  const p = usePortal();
  const q = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => api<Row[]>("platform/plans"),
  });
  const registry = useQuery({
    queryKey: ["platform-entitlements"],
    queryFn: () =>
      api<{
        features: Row[];
        entitlements: { plan: string; feature: string }[];
      }>("platform/entitlements"),
  });
  return (
    <>
      <Head
        title="Plans, limits & entitlements."
        description="Maintain catalog prices, fair-use limits and dependency-safe feature sets."
      />
      <ErrorBox error={q.error ?? registry.error} />
      <div className="platform-role-grid">
        {q.data?.map((plan) => {
          const limits = (plan.limits ?? {}) as Row;
          const prices = (plan.prices ?? []) as Row[];
          // The editor and backend update the monthly PKR price specifically.
          const price =
            prices.find((x) => x.currency === "PKR" && x.interval === "month") ??
            prices[0];
          return (
            <article className="panel" key={value(plan, "key")}>
              <span className="eyebrow">{value(plan, "key")}</span>
              <h2>{value(plan, "name")}</h2>
              <strong className="platform-plan-price">
                {money(price?.amount)}
                <small>/ month</small>
              </strong>
              <p className="muted">{value(plan, "description")}</p>
              <ul className="platform-plan-limits">
                {Object.entries(limits).map(([key, n]) => (
                  <li key={key}>
                    <span>{title(key)}</span>
                    <strong>{String(n)}</strong>
                  </li>
                ))}
              </ul>
              {p.identity.permissions.includes("plans.manage") && (
                <div className="row platform-wrap">
                  <button
                    className="button secondary"
                    onClick={() =>
                      p.open({
                        title: "Edit plan",
                        endpoint: `plans/${plan.key}`,
                        method: "PUT",
                        initial: {
                          name: plan.name,
                          description: plan.description,
                          amount: price?.amount ?? "0",
                          ...Object.fromEntries(
                            Object.entries(limits).map(([k, v]) => [
                              "limits." + k,
                              v,
                            ]),
                          ),
                        },
                        fields: [
                          { key: "name", label: "Plan name", required: true },
                          {
                            key: "description",
                            label: "Description",
                            type: "textarea",
                            required: true,
                          },
                          {
                            key: "amount",
                            label: "Monthly price (PKR)",
                            required: true,
                          },
                          ...Object.keys(limits).map((k) => ({
                            key: "limits." + k,
                            label: title(k),
                            type: "number",
                            required: true,
                          })),
                        ],
                      })
                    }
                  >
                    Edit plan
                  </button>
                  <button
                    className="text-button"
                    disabled={!registry.data}
                    onClick={() =>
                      p.open({
                        title: `Edit ${plan.name} features`,
                        endpoint: `plans/${plan.key}/features`,
                        method: "PUT",
                        initial: {
                          features:
                            registry.data?.entitlements
                              .filter((e) => e.plan === plan.key)
                              .map((e) => e.feature) ?? [],
                        },
                        fields: [
                          {
                            key: "features",
                            label: "Included features",
                            type: "permissions",
                            permissions: registry.data?.features.map((f) => ({
                              key: value(f, "key"),
                              name: value(f, "name"),
                              module: value(f, "category"),
                              description: value(f, "description"),
                            })),
                          },
                        ],
                      })
                    }
                  >
                    Edit features
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
export function SettingsPage() {
  const p = usePortal();
  const q = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => api<{ billing_profile: Row }>("platform/settings"),
  });
  const methods = useQuery({
    queryKey: ["platform-methods"],
    queryFn: () => api<Row[]>("platform/payment-methods"),
  });
  const can = p.identity.permissions.includes("settings.manage");
  return (
    <>
      <Head
        title="Platform configuration."
        description="Billing identity and manual-payment instructions. Issued invoices retain their original details."
      />
      <ErrorBox error={q.error ?? methods.error} />
      <section className="panel">
        <h2>Billing identity</h2>
        <p>{value(q.data?.billing_profile ?? {}, "name", "Tech POS")}</p>
        <p className="muted">
          {value(
            q.data?.billing_profile ?? {},
            "email",
            "Set the business contact and address used on future invoices.",
          )}
        </p>
        {can && (
          <button
            className="button secondary"
            onClick={() =>
              p.open({
                title: "Update billing identity",
                endpoint: "settings",
                method: "PUT",
                initial: q.data?.billing_profile ?? {},
                fields: [
                  {
                    key: "name",
                    label: "Business / legal name",
                    required: true,
                  },
                  { key: "email", label: "Billing email", type: "email" },
                  {
                    key: "address",
                    label: "Business address",
                    type: "textarea",
                  },
                  { key: "registration_number", label: "Registration number" },
                ],
              })
            }
          >
            Edit billing identity
          </button>
        )}
      </section>
      <div className="platform-role-grid mt">
        {methods.data?.map((m) => (
          <article key={String(m.id)} className="panel">
            <h3>{value(m, "name")}</h3>
            <Status status={m.active ? "active" : "inactive"} />
            {Object.entries((m.details ?? {}) as Row).map(([k, v]) => (
              <p key={k}>
                <small>{title(k)}</small>
                <strong className="table-subtext">{String(v)}</strong>
              </p>
            ))}
            {can && (
              <button
                className="button secondary mt"
                onClick={() =>
                  p.open({
                    title: "Edit payment instructions",
                    endpoint: `payment-methods/${m.id}`,
                    method: "PUT",
                    initial: {
                      name: m.name,
                      active: !!m.active,
                      ...Object.fromEntries(
                        Object.entries((m.details ?? {}) as Row).map(([k, v]) => [
                          "details." + k,
                          v,
                        ]),
                      ),
                    },
                    fields: [
                      {
                        key: "name",
                        label: "Payment method name",
                        required: true,
                      },
                      {
                        key: "active",
                        label: "Available to clients",
                        type: "checkbox",
                      },
                      { key: "details.bank", label: "Bank name" },
                      {
                        key: "details.account_number",
                        label: "Account / wallet number",
                        required: true,
                      },
                      {
                        key: "details.account_holder",
                        label: "Account holder",
                      },
                    ],
                  })
                }
              >
                Edit instructions
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
