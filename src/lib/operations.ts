import { api } from "./api";
import { scaled } from "./decimal";
export type Page<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};
export type OpsBranch = {
  public_id: string;
  name: string;
  permissions: string[];
};
export type OpsSetup = {
  branches: OpsBranch[];
  warehouses: { public_id: string; name: string; branch: string }[];
  registers: { public_id: string; name: string; branch: string }[];
  shift: {
    public_id: string;
    branch: string;
    register: string;
    opening_float: string;
    expected_cash: string;
    opened_at: string;
  } | null;
  currency: string;
  timezone: string;
  modules: {
    pos: boolean;
    inventory: boolean;
    offline_basic: boolean;
    /** Customer credit (khata). Absent on servers that predate the feature. */
    customer_credit?: boolean;
  };
};
export type Product = {
  image?: import("../components/ProductImage").MediaImage | null;
  public_id: string;
  name: string;
  alternate_name: string | null;
  sku: string;
  brand: string | null;
  type: "standard" | "weighted" | "service";
  unit: string;
  selling_price: string;
  wholesale_price: string | null;
  cost_price?: string;
  tax_rate: string;
  tax_inclusive: boolean;
  track_stock: boolean;
  active: boolean;
  reorder_level: string;
  stock_quantity: string;
  version: number;
  category: string | null;
  category_name: string | null;
  barcodes: { barcode: string; quantity: string }[];
};
export type Customer = {
  public_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  price_tier: "retail" | "wholesale";
  /** Khata balance the customer owes (decimal string), when credit is supported. */
  balance?: string;
  /** "0.00" means credit is off for this customer. */
  credit_limit?: string;
  marketing_consent?: boolean;
};
export type CartLine = { product: Product; quantity: string; discount: string };
export type PaymentMethod =
  | "cash"
  | "external_card"
  | "bank_transfer"
  | "credit";
export type SalePayload = {
  idempotency_key: string;
  branch: string;
  warehouse: string;
  shift: string;
  customer?: string | null;
  lines: {
    product: string;
    quantity: string;
    discount: string;
    expected_unit_price: string;
  }[];
  cart_discount: string;
  expected_total: string;
  payments: {
    method: PaymentMethod;
    amount: string;
    reference?: string;
  }[];
  /** Over-limit credit sale approved by a `customers.credit_manage` holder (5–500 chars). */
  credit_override_reason?: string;
  channel?: "online" | "offline";
  device_identifier?: string;
  cashier?: string;
  local_sequence?: number;
  payload_version?: 1;
  client_occurred_at?: string;
};
export type SaleDocument = {
  public_id: string;
  receipt_number: string;
  business_name: string;
  branch_name: string;
  currency: string;
  finalized_at: string;
  subtotal: string;
  line_discount: string;
  cart_discount: string;
  tax_total: string;
  total: string;
  change_due: string;
  amount_tendered: string;
  cost_total?: string;
  channel: string;
  /** Null/absent for walk-in sales. Local offline receipts may carry it too. */
  customer?: {
    public_id?: string;
    name: string;
    phone?: string | null;
    /** Khata balance around this sale; only set when it had a credit tender. */
    balance_before?: string | null;
    balance_after?: string | null;
  } | null;
  lines: {
    name: string;
    product?: string;
    returned_quantity?: string;
    stock_tracked?: boolean;
    sku: string;
    quantity: string;
    unit_price: string;
    total: string;
    tax: string;
    line_discount: string;
    cart_discount: string;
  }[];
  payments: {
    method: string;
    amount: string;
    reference: string | null;
    verification: string;
  }[];
};
export type LedgerType =
  | "opening_balance"
  | "credit_sale"
  | "payment"
  | "credit_return"
  | "adjustment";
export type CollectionMethod = "cash" | "bank_transfer" | "external_card";
export type LedgerEntry = {
  public_id: string;
  type: LedgerType;
  /** Signed: + the customer owes more, − the customer owes less. */
  amount: string;
  balance_after: string;
  method: CollectionMethod | null;
  reference: string | null;
  note: string | null;
  /** Reason a credit manager gave for a sale above the credit limit. */
  override_reason?: string | null;
  sale: { public_id: string; receipt_number: string } | null;
  return: { public_id: string } | null;
  branch: string | null;
  actor: string | null;
  created_at: string;
};
export type CreditCustomer = {
  public_id: string;
  name: string;
  phone: string | null;
  balance: string;
  credit_limit: string;
  available: string;
};
export type CustomerStatement = {
  customer: CreditCustomer;
  from: string;
  to: string;
  opening_balance: string;
  closing_balance: string;
  entries: LedgerEntry[];
  current_page: number;
  last_page: number;
  per_page?: number;
  total?: number;
};
export type CustomerPayment = {
  public_id: string;
  amount: string;
  method: CollectionMethod;
  reference: string | null;
  note?: string | null;
  created_at: string;
  balance_before: string;
  balance_after: string;
  customer: { public_id: string; name: string; phone: string | null };
  branch: string;
  receipt_number: string;
};
/** `POST sales/{uuid}/returns` result; the split appears for sales that used credit. */
export type ReturnResult = {
  receipt_number: string;
  total: string;
  credit_amount?: string;
  cash_amount?: string;
};
export const ledgerLabels: Record<LedgerType, string> = {
  opening_balance: "Opening balance",
  credit_sale: "Credit sale",
  payment: "Payment received",
  credit_return: "Return to khata",
  adjustment: "Adjustment",
};
export const methodLabel = (method: string) =>
  method === "credit"
    ? "Credit (khata)"
    : method === "external_card"
      ? "Card (external terminal)"
      : method === "bank_transfer"
        ? "Bank transfer"
        : method === "cash"
          ? "Cash"
          : method.replaceAll("_", " ");
/** Limit, balance and available credit as scaled integers. Missing fields mean credit is off. */
export function creditState(
  c?: { balance?: string; credit_limit?: string } | null,
) {
  try {
    const limit = scaled(c?.credit_limit ?? "0");
    const balance = scaled(c?.balance ?? "0");
    return {
      limit,
      balance,
      available: limit > balance ? limit - balance : 0n,
      enabled: limit > 0n,
    };
  } catch {
    return { limit: 0n, balance: 0n, available: 0n, enabled: false };
  }
}
/**
 * One idempotency key per logical attempt: an unchanged retry (e.g. after a dropped
 * connection) reuses the key so the server replays the original result; any edit to the
 * body starts a new attempt with a fresh key instead of a 409 conflict.
 */
export function attemptKey(
  ref: { current: { fingerprint: string; key: string } | null },
  body: unknown,
) {
  const fingerprint = JSON.stringify(body);
  if (ref.current?.fingerprint !== fingerprint)
    ref.current = { fingerprint, key: crypto.randomUUID() };
  return ref.current.key;
}
/** Khata access for one branch: the plan entitlement plus that branch's grants. */
export function creditAccess(
  setup: OpsSetup | undefined,
  permissions: string[],
) {
  const feature = !!setup?.modules.customer_credit;
  return {
    feature,
    sell: feature && permissions.includes("customers.credit_sell"),
    collect: feature && permissions.includes("customers.collect"),
    manage: feature && permissions.includes("customers.credit_manage"),
  };
}
/** Statements and adjustments are business-level: a grant in any branch is enough. */
export function anyBranchGrant(setup: OpsSetup | undefined, permission: string) {
  return (
    !!setup?.modules.customer_credit &&
    setup.branches.some((b) => b.permissions.includes(permission))
  );
}
export const ops =<T>(path: string, init?: RequestInit) =>
  api<T>(`operations/${path}`, init);
export const query = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
