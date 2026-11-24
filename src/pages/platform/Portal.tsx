import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Building2,
  ChevronRight,
  CreditCard,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  Settings2,
  Shield,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { api, ApiError, json, useClient } from "../../lib/api";
import { assertNoPendingSales, clearBusinessData } from "../../lib/offline";
import { ErrorBox, Loading, Modal } from "../../components/ui";
import type { Me } from "../../lib/types";
import type { Action, Identity, Row } from "./shared";
import { Context, value } from "./shared";
import { Dashboard } from "./Dashboard";
import { ResourcePage } from "./Resources";
import { AccessPage } from "./Access";
import { PlansPage, SettingsPage } from "./Configuration";
import { ActionDialog } from "./ActionDialog";
const items = [
  ["", "Overview", "overview.view", LayoutDashboard],
  ["clients", "Clients", "clients.view", Building2],
  ["inventory", "All client inventory", "inventory.view", Package],
  ["client-sales", "Client sales receipts", "client_sales.view", FileText],
  ["payments", "Payments & approvals", "payments.view", CreditCard],
  ["subscriptions", "Subscriptions & due dates", "subscriptions.view", Layers],
  ["invoices", "Billing invoices", "billing.view", FileText],
  ["users", "Users", "users.view", Users],
  ["access", "Roles & permissions", "access.view", Shield],
  ["client-access", "Client team access", "client_access.view", Users],
  ["plans", "Plans & features", "plans.view", Wallet],
  ["settings", "Platform settings", "settings.view", Settings2],
  ["leads", "Business leads", "leads.view", Building2],
  ["audit", "Audit trail", "audit.view", Shield],
] as const;
// Sections filtered by client; mirrors ReadController::CLIENT_SCOPED on the server.
const clientScoped = [
  "clients.view",
  "client_access.view",
  "inventory.view",
  "client_sales.view",
  "subscriptions.view",
  "payments.view",
  "billing.view",
  "audit.view",
];

export function PlatformPage() {
  const identity = useQuery({
    queryKey: ["platform-identity"],
    queryFn: () => api<Identity>("platform/me"),
    retry: false,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("auth/me") });
  const [params] = useSearchParams();
  const client = params.get("client") ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  const section = location.pathname.split("/")[2] ?? "";
  const [clientSearch, setClientSearch] = useState("");
  // Debounced copy used for the lookup request, so typing does not send one request per key.
  const [clientQuery, setClientQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setClientQuery(clientSearch), 250);
    return () => window.clearTimeout(timer);
  }, [clientSearch]);
  const [mobile, setMobile] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [logoutError, setLogoutError] = useState<unknown>();
  const cache = useQueryClient();
  const lookup = useQuery({
    queryKey: ["platform-lookup", clientQuery, client],
    queryFn: () =>
      api<{
        clients: Row[];
        plans: Row[];
        users: Row[];
        selected_client?: Row;
        branches?: Row[];
        warehouses?: Row[];
      }>(`platform/lookup?${new URLSearchParams({ q: clientQuery, client })}`),
    enabled: !!identity.data,
    placeholderData: (previous) => previous,
  });
  function setClient(id: string) {
    // Keep a fast filter change on the route just opened, even while its
    // concurrent React navigation is still rendering the previous controls.
    navigate({
      pathname: window.location.pathname,
      search: id ? `?${new URLSearchParams({ client: id })}` : "",
    });
  }
  async function logout() {
    try {
      if (me.data) await assertNoPendingSales(me.data.user.public_id);
      await api("auth/logout", json("POST", {}));
      if (me.data) await clearBusinessData(me.data.user.public_id);
      cache.clear();
      useClient.getState().setTenant("");
      navigate("/login");
    } catch (e) {
      setLogoutError(e);
    }
  }
  if (identity.error instanceof ApiError && identity.error.status === 401)
    return <Navigate to="/login" replace />;
  if (identity.isPending)
    return <Loading message="Opening platform administration…" />;
  if (identity.error || !identity.data)
    return (
      <main className="standalone">
        <ErrorBox error={identity.error} />
        <Link to="/login">Sign in with a platform account</Link>
      </main>
    );
  const id = identity.data;
  const has = (p: string) => id.permissions.includes(p);
  if (!section && !has("overview.view")) {
    const first = items.find((i) => has(i[2]));
    if (first) return <Navigate to={`/platform/${first[0]}`} replace />;
  }
  const selected =
    lookup.data?.clients.find((c) => c.public_id === client) ??
    lookup.data?.selected_client;
  const nav = (
    <>
      <Link className="brand" to="/platform">
        <span className="brand-mark">
          T<span>•</span>
        </span>
        tech<span className="brand-light">pos</span>
      </Link>
      <div className="platform-identity-badge">
        <Shield size={16} />
        <div>
          <strong>Platform administration</strong>
          <small>
            {id.root ? "Root administrator" : "Restricted staff access"}
          </small>
        </div>
      </div>
      <nav aria-label="Platform navigation">
        {items
          .filter((i) => has(i[2]))
          .map(([path, label, , Icon]) => (
            <Link
              key={path}
              className={section === path ? "active" : ""}
              to={`/platform${path ? "/" + path : ""}${client ? "?client=" + client : ""}`}
              onClick={() => setMobile(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {path === section && <ChevronRight size={14} />}
            </Link>
          ))}
      </nav>
      <footer>
        <span className="platform-avatar">{id.user.name.slice(0, 1)}</span>
        <div>
          <strong>{id.user.name}</strong>
          <small>{id.user.email}</small>
        </div>
        <button
          className="icon-button"
          aria-label="Sign out of platform"
          onClick={() => void logout()}
        >
          <LogOut size={18} />
        </button>
      </footer>
    </>
  );
  return (
    <Context.Provider
      value={{
        identity: id,
        client,
        setClient,
        open: setAction,
        lookup: lookup.data
          ? {
              ...lookup.data,
              clients:
                selected &&
                !lookup.data.clients.some(
                  (c) => c.public_id === selected.public_id,
                )
                  ? [selected, ...lookup.data.clients]
                  : lookup.data.clients,
            }
          : { clients: [], plans: [], users: [] },
      }}
    >
      <div className="platform-portal">
        <aside className="platform-sidebar">{nav}</aside>
        <Modal
          open={mobile}
          onOpenChange={setMobile}
          title="Platform navigation"
          description="Choose an administration area."
        >
          <div className="platform-mobile-nav">{nav}</div>
        </Modal>
        <div className="platform-body">
          <header className="platform-topbar">
            <div className="row">
              <button
                className="icon-button platform-menu"
                aria-label="Open platform navigation"
                onClick={() => setMobile(true)}
              >
                <Menu />
              </button>
              <span>
                Platform <ChevronRight size={13} />{" "}
                {items.find((i) => i[0] === section)?.[1] ?? "Overview"}
              </span>
            </div>
            <div className="row">
              <Link to="/account" className="text-button">
                <Shield size={15} />
                Account security
              </Link>
              <span className="platform-status-dot">Live data</span>
            </div>
          </header>
          <main className="platform-main">
            <ErrorBox error={logoutError} />
            {clientScoped.some(has) && (
              <div className="platform-scope">
                <div>
                  <span className="eyebrow">CLIENT SCOPE</span>
                  <strong>
                    {client
                      ? value(selected ?? {}, "name", "Selected client")
                      : "All clients"}
                  </strong>
                  <small>
                    Applies to client data, payments, subscriptions and
                    invoices.
                  </small>
                </div>
                <div className="platform-scope-controls">
                  <div className="input-icon">
                    <Search size={15} />
                    <input
                      aria-label="Find a client"
                      placeholder="Find a client…"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Filter by client"
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                  >
                    <option value="">All clients</option>
                    {selected &&
                      !lookup.data?.clients.some(
                        (c) => c.public_id === client,
                      ) && (
                        <option value={client}>
                          {value(selected, "name")}
                        </option>
                      )}
                    {lookup.data?.clients.map((c) => (
                      <option
                        key={value(c, "public_id")}
                        value={value(c, "public_id")}
                      >
                        {value(c, "name")}
                        {c.owner_email ? ` · ${c.owner_email}` : ""}
                      </option>
                    ))}
                  </select>
                  {client && (
                    <button
                      className="icon-button"
                      aria-label="Clear client filter"
                      onClick={() => setClient("")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {section === "" ? (
              <Dashboard />
            ) : section === "access" ? (
              <AccessPage tenant={false} />
            ) : section === "client-access" ? (
              <AccessPage tenant />
            ) : section === "plans" ? (
              <PlansPage />
            ) : section === "settings" ? (
              <SettingsPage />
            ) : (
              // Remount per section so filters from the previous section are
              // never sent (and briefly rendered) with the new section's query.
              <ResourcePage key={section} section={section} />
            )}
          </main>
          <footer className="platform-footer">
            Tech POS administration{" "}
            <span>Client data access and sensitive changes are audited.</span>
          </footer>
        </div>
      </div>
      {action && (
        <ActionDialog
          key={action.endpoint + action.title}
          action={action}
          close={() => setAction(null)}
        />
      )}
    </Context.Provider>
  );
}
