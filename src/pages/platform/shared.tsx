import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { api } from "../../lib/api";
import type { Me } from "../../lib/types";
export type Row = Record<string, unknown>;
export type Page = {
  data: Row[];
  current_page: number;
  last_page: number;
  total: number;
};
export type Permission = {
  key: string;
  name: string;
  module: string;
  description: string;
};
export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  permissions?: Permission[];
  templates?: Record<string, string[]>;
};
export type Action = {
  title: string;
  endpoint: string;
  method?: string;
  fields: Field[];
  initial?: Row;
  submit?: string;
  description?: string;
  reason?: string;
  /** Private proof download shown in the dialog; omitted when no proof is stored. */
  proofUrl?: string;
};
export type Identity = {
  user: Me["user"];
  permissions: string[];
  root: boolean;
};
export const Context = createContext<{
  identity: Identity;
  client: string;
  setClient: (id: string) => void;
  open: (a: Action) => void;
  lookup: {
    clients: Row[];
    plans: Row[];
    users: Row[];
    branches?: Row[];
    warehouses?: Row[];
  };
} | null>(null);
export const usePortal = () => {
  const c = useContext(Context);
  if (!c) throw Error("Missing platform context");
  return c;
};
export const value = (r: Row, key: string, fallback = "—") =>
  r[key] === null || r[key] === undefined || r[key] === ""
    ? fallback
    : String(r[key]);
export const title = (s: string) =>
  s
    .replaceAll("_", " ")
    .replaceAll(".", " · ")
    .replace(/^./, (v) => v.toUpperCase());
export const money = (v: unknown, currency = "PKR") =>
  `${currency} ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const date = (v: unknown) =>
  v ? String(v).replace("T", " ").slice(0, 16) : "—";
export const choices = (rows: Row[], label = "name", id = "public_id") =>
  rows.map((r) => ({
    value: value(r, id, ""),
    label:
      value(r, label) +
      (label === "name" && r.owner_email ? ` · ${r.owner_email}` : ""),
  }));
export function Head({
  title: heading,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="platform-heading">
      <div>
        <p className="eyebrow">PLATFORM ADMINISTRATION</p>
        <h1>{heading}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Empty({ children }: { children?: React.ReactNode }) {
  return (
    <div className="platform-empty">
      <Layers size={30} />
      <h3>No matching records.</h3>
      <p>
        {children ??
          "Try another client or clear the filters. New activity will appear here automatically."}
      </p>
    </div>
  );
}
export function Status({ status }: { status: unknown }) {
  return (
    <span
      className={`platform-pill ${["active", "approved", "paid", "available"].includes(String(status)) ? "positive" : ["suspended", "rejected", "expired", "overdue", "archived"].includes(String(status)) ? "attention" : ""}`}
    >
      {title(String(status ?? "unknown"))}
    </span>
  );
}
export function useRows(endpoint: string, filters: Row = {}, enabled = true) {
  const { client } = usePortal();
  const search = new URLSearchParams();
  Object.entries({ ...filters, client }).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") search.set(k, String(v));
  });
  return useQuery({
    queryKey: ["platform-data", endpoint, search.toString()],
    queryFn: () => api<Page>(`platform/${endpoint}?${search}`),
    enabled,
  });
}
export function Pager({
  data,
  page,
  setPage,
}: {
  data?: Page;
  page: number;
  setPage: (p: number) => void;
}) {
  return (
    <div className="platform-pagination">
      <span>
        {data?.total ?? 0} records · Page {page} of {data?.last_page ?? 1}
      </span>
      <div className="row">
        <button
          className="button secondary"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <button
          className="button secondary"
          disabled={page >= (data?.last_page ?? 1)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
