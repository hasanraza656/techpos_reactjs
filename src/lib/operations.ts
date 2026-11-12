import { api } from "./api";
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
  modules: { pos: boolean; inventory: boolean; offline_basic: boolean };
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
};
export type CartLine = { product: Product; quantity: string; discount: string };
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
    method: "cash" | "external_card" | "bank_transfer";
    amount: string;
    reference?: string;
  }[];
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
export const ops = <T>(path: string, init?: RequestInit) =>
  api<T>(`operations/${path}`, init);
export const query = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
