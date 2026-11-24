import type { Row, Action } from "./shared";
import { value, choices, title } from "./shared";
export function reviewAction(row: Row): Action {
  return {
    title: `Review ${value(row, "business_name", "payment")}`,
    endpoint: `payments/${row.public_id}/review`,
    submit: "Save review",
    reason: "Review manual subscription payment",
    description:
      "Check the actual transfer in your bank or wallet. Proof upload alone never activates a plan.",
    initial: { decision: "approved", note: "" },
    proofUrl: row.has_proof
      ? `/api/v1/platform/payments/${row.public_id}/proof`
      : undefined,
    fields: [
      {
        key: "decision",
        label: "Decision",
        type: "select",
        options: ["approved", "rejected", "needs_information"].map((v) => ({
          value: v,
          label: title(v),
        })),
      },
      { key: "note", label: "Review note", type: "textarea" },
    ],
  };
}
export function clientAction(lookup: { users: Row[] }, r?: Row): Action {
  return r
    ? {
        title: "Edit client profile",
        endpoint: `clients/${r.public_id}`,
        method: "PUT",
        fields: [
          { key: "name", label: "Business name", required: true },
          { key: "country", label: "Country code", required: true },
          { key: "timezone", label: "Time zone", required: true },
          { key: "email", label: "Contact email", type: "email" },
          { key: "phone", label: "Phone" },
          { key: "address", label: "Billing address", type: "textarea" },
          {
            key: "platform_notes",
            label: "Internal platform notes",
            type: "textarea",
          },
        ],
        initial: { ...r, ...((r.contact as Row) ?? {}) },
      }
    : {
        title: "Add a client",
        endpoint: "clients",
        description:
          "Create a Free business with an existing owner, or create a new owner account. New owner sign-in requires email verification.",
        fields: [
          { key: "name", label: "Business name", required: true },
          {
            key: "owner",
            label: "Existing owner (optional)",
            type: "user-select",
            options: choices(lookup.users, "email"),
          },
          { key: "owner_name", label: "New owner name" },
          { key: "owner_email", label: "New owner email", type: "email" },
          {
            key: "owner_password",
            label: "New owner password",
            type: "password",
          },
          { key: "country", label: "Country code", required: true },
          {
            key: "currency",
            label: "Currency",
            type: "select",
            options: ["PKR", "USD", "GBP", "EUR", "AED", "SAR", "INR"].map(
              (v) => ({ value: v, label: v }),
            ),
          },
          { key: "timezone", label: "Time zone", required: true },
        ],
        initial: { country: "PK", currency: "PKR", timezone: "Asia/Karachi" },
      };
}
export function userAction(r?: Row): Action {
  return {
    title: r ? "Edit user" : "Create user",
    endpoint: r ? `users/${r.public_id}` : "users",
    method: r ? "PUT" : "POST",
    fields: [
      { key: "name", label: "Full name", required: true },
      { key: "email", label: "Email address", required: true, type: "email" },
      {
        key: "new_password",
        label: r ? "New password (leave blank to keep)" : "New password",
        required: !r,
        type: "password",
      },
    ],
    initial: r ?? {},
  };
}
export function invoiceAction(
  lookup: { clients: Row[]; plans: Row[] },
  client: string,
): Action {
  return {
    title: "Issue subscription invoice",
    endpoint: "invoices",
    fields: [
      {
        key: "client",
        label: "Client",
        type: "select",
        required: true,
        options: choices(lookup.clients),
      },
      {
        key: "plan_key",
        label: "Plan",
        type: "select",
        required: true,
        options: choices(
          lookup.plans.filter((p) => p.key !== "free"),
          "name",
          "key",
        ),
      },
      { key: "due_on", label: "Due date", type: "date", required: true },
    ],
    initial: { client, due_on: new Date().toISOString().slice(0, 10) },
    description:
      "The monthly catalog price is snapshotted. Issuing an invoice does not activate paid access.",
  };
}
export function subscriptionAction(r: Row, lookup: { plans: Row[] }): Action {
  return {
    title: `Manage ${value(r, "name")} subscription`,
    endpoint: `clients/${r.public_id}/subscription`,
    fields: [
      {
        key: "action",
        label: "Subscription action",
        type: "select",
        options: [
          "suspend",
          "resume",
          "cancel",
          "free",
          "grace",
          "downgrade",
        ].map((v) => ({
          value: v,
          label:
            (
              {
                free: "Move to permanent Free",
                grace: "Grant a short grace period",
                downgrade: "Downgrade within paid term",
              } as Record<string, string>
            )[v] ?? title(v),
        })),
      },
      { key: "days", label: "Grace days (1–30)", type: "number" },
      {
        key: "plan_key",
        label: "Downgrade target",
        type: "select",
        options: choices(lookup.plans, "name", "key"),
      },
    ],
    initial: {
      action: r.subscription_status === "suspended" ? "resume" : "suspend",
    },
    description:
      "No paid upgrade is granted here. Upgrades and renewals use verified payment approval; downgrade preserves data.",
  };
}
