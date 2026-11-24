import {
  createContext,
  useContext,
  useEffect,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
  Link,
} from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  SlidersHorizontal,
  Languages,
  Users,
  CreditCard,
  Shield,
  Menu,
  Search,
  Bell,
  LogOut,
  Wifi,
  WifiOff,
  ChevronRight,
  Store,
  CheckCircle2,
  ArrowUpRight,
  Sun,
  Moon,
  ScanBarcode,
  Package,
  ClipboardList,
  RefreshCw,
  ReceiptText,
  ChartColumn,
  Lightbulb,
} from "lucide-react";
const IntelligencePage = lazy(() =>
  import("./pages/Intelligence").then((m) => ({ default: m.IntelligencePage })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
import { SetupChecklist } from "./components/SetupChecklist";
import { TodayOverview } from "./components/TodayOverview";
const SalesPage = lazy(() =>
  import("./pages/Sales").then((m) => ({ default: m.SalesPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/Sales").then((m) => ({ default: m.ReportsPage })),
);
const CashierPage = lazy(() =>
  import("./pages/Cashier").then((m) => ({ default: m.CashierPage })),
);
const CatalogPage = lazy(() =>
  import("./pages/Catalog").then((m) => ({ default: m.CatalogPage })),
);
const InventoryPage = lazy(() =>
  import("./pages/Catalog").then((m) => ({ default: m.InventoryPage })),
);
const CustomersPage = lazy(() =>
  import("./pages/Operations").then((m) => ({ default: m.CustomersPage })),
);
const SyncPage = lazy(() =>
  import("./pages/Operations").then((m) => ({ default: m.SyncPage })),
);
const AuthPage = lazy(() =>
  import("./pages/Auth").then((m) => ({ default: m.AuthPage })),
);
const OnboardingPage = lazy(() =>
  import("./pages/Configuration").then((m) => ({ default: m.OnboardingPage })),
);
const ModulesPage = lazy(() =>
  import("./pages/Configuration").then((m) => ({ default: m.ModulesPage })),
);
const LabelsPage = lazy(() =>
  import("./pages/Configuration").then((m) => ({ default: m.LabelsPage })),
);
const RolesPage = lazy(() =>
  import("./pages/Configuration").then((m) => ({ default: m.RolesPage })),
);
const SubscriptionPage = lazy(() =>
  import("./pages/Subscriptions").then((m) => ({
    default: m.SubscriptionPage,
  })),
);
const PlatformPage = lazy(() =>
  import("./pages/platform/Portal").then((m) => ({ default: m.PlatformPage })),
);
const TeamPage = lazy(() =>
  import("./pages/Identity").then((m) => ({ default: m.TeamPage })),
);
const InvitationPage = lazy(() =>
  import("./pages/Identity").then((m) => ({ default: m.InvitationPage })),
);
const AccountPage = lazy(() =>
  import("./pages/Identity").then((m) => ({ default: m.AccountPage })),
);
import { api, json, useClient, ApiError } from "./lib/api";
import { liveQuery } from "dexie";
import { businessStore, clearBusinessData, deviceId } from "./lib/offline";
import { assertNoPendingSales } from "./lib/offline";
import { cachedMe, cachedBusiness } from "./lib/sessionCache";
import type { Business, Me } from "./lib/types";
import { ErrorBox, Loading, Modal, PageTitle } from "./components/ui";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
      staleTime: 15000,
      refetchOnWindowFocus: false,
    },
  },
});
const Workspace = createContext<{ me: Me; business: Business } | null>(null);
export const useWorkspace = () => {
  const c = useContext(Workspace);
  if (!c) throw new Error("Missing workspace");
  return c;
};
// `permission` hides pages whose data endpoints require a business-wide
// permission; branch-scoped operational pages stay visible and self-gate.
const nav: {
  to: string;
  name: string;
  icon: typeof LayoutDashboard;
  permission?: string;
}[] = [
  { to: "/", name: "Overview", icon: LayoutDashboard },
  { to: "/pos", name: "Cashier", icon: ScanBarcode },
  { to: "/catalog", name: "Product catalog", icon: Package },
  { to: "/inventory", name: "Stock movements", icon: ClipboardList },
  { to: "/customers", name: "Customers", icon: Users },
  { to: "/sales", name: "Sales & cash returns", icon: ReceiptText },
  { to: "/reports", name: "Sales summary", icon: ChartColumn },
  { to: "/intelligence", name: "Built-in intelligence", icon: Lightbulb },
  { to: "/sync", name: "Sync & local receipts", icon: RefreshCw },
  {
    to: "/onboarding",
    name: "Business setup",
    icon: Sparkles,
    permission: "onboarding.manage",
  },
  { to: "/settings", name: "Settings", icon: SlidersHorizontal },
  { to: "/modules", name: "Modules", icon: SlidersHorizontal },
  { to: "/labels", name: "Language & labels", icon: Languages },
  {
    to: "/roles",
    name: "Roles & permissions",
    icon: Users,
    permission: "roles.manage",
  },
  {
    to: "/team",
    name: "Team members",
    icon: Users,
    permission: "employees.view",
  },
  { to: "/account", name: "Account security", icon: Shield },
  {
    to: "/subscription",
    name: "Subscription",
    icon: CreditCard,
    permission: "subscriptions.view",
  },
];
function Shell() {
  const location = useLocation();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: cachedMe,
    networkMode: "always",
  });
  const client = useQueryClient();
  const navigate = useNavigate();
  const { tenant, setTenant, notify } = useClient();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [dark, setDark] = useState(
    localStorage.getItem("techpos:theme") === "dark",
  );
  const [logoutError, setLogoutError] = useState<unknown>();
  const business = useQuery({
    queryKey: ["business", tenant],
    queryFn: () => cachedBusiness(me.data!, tenant),
    networkMode: "always",
    enabled: !!tenant && !!me.data,
  });
  useEffect(() => {
    if (
      me.data &&
      !me.data.tenants.some(
        (t) => t.public_id === tenant && t.status === "active",
      )
    ) {
      const saved = localStorage.getItem(
        `techpos:active-business:${me.data.user.public_id}`,
      );
      setTenant(
        me.data.tenants.find(
          (t) => t.public_id === saved && t.status === "active",
        )?.public_id ??
          me.data.tenants.find((t) => t.status === "active")?.public_id ??
          "",
      );
    }
    if (
      me.data &&
      tenant &&
      me.data.tenants.some(
        (t) => t.public_id === tenant && t.status === "active",
      )
    )
      localStorage.setItem(
        `techpos:active-business:${me.data.user.public_id}`,
        tenant,
      );
  }, [me.data, tenant, setTenant]);
  useEffect(() => {
    const listener = () => setOnline(navigator.onLine);
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("techpos:theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!tenant || !me.data) return;
    const db = businessStore(tenant, me.data.user.public_id);
    const subscription = liveQuery(() => db.outbox.count()).subscribe({
      next: setPending,
      error: () => setPending(0),
    });
    api(
      "devices",
      json("POST", {
        device_identifier: deviceId(),
        name: navigator.userAgent.slice(0, 90),
        schema_version: 1,
      }),
    ).catch(() => {});
    return () => {
      subscription.unsubscribe();
      db.close();
    };
  }, [tenant, me.data]);
  async function switchTenant(value: string) {
    try {
      await client.cancelQueries();
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      setTenant(value);
      await api("business/switch", json("POST", {}));
      navigate("/");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not switch business.");
    }
  }
  async function logout() {
    try {
      if (me.data) await assertNoPendingSales(me.data.user.public_id);
      await api("auth/logout", json("POST", {}));
      if (me.data) await clearBusinessData(me.data.user.public_id);
      client.clear();
      setTenant("");
      navigate("/login");
    } catch (e) {
      setLogoutError(e);
    }
  }
  if (me.error instanceof ApiError && me.error.status === 401)
    return <Navigate to="/login" replace />;
  const activeTenants =
    me.data?.tenants.filter((t) => t.status === "active") ?? [];
  if (me.isPending || (!tenant && activeTenants.length)) return <Loading />;
  if (me.error)
    return (
      <main className="standalone">
        <ErrorBox error={me.error} />
        <button className="button" onClick={() => me.refetch()}>
          Try again
        </button>
      </main>
    );
  if (!me.data) return null;
  // Memberships of suspended/closed businesses never become the active tenant,
  // so treat "none active" like "none" instead of spinning forever.
  if (!activeTenants.length)
    return (
      <main className="standalone">
        <ErrorBox error={logoutError} />
        <h1>No active business membership</h1>
        <p>Contact your business owner to restore access.</p>
        <button className="button" onClick={logout}>
          Sign out
        </button>
      </main>
    );
  if (
    location.pathname === "/" &&
    business.data &&
    !business.data.onboarding.completed_at &&
    !business.data.onboarding.deferred_at &&
    business.data.permissions.includes("onboarding.manage")
  )
    return <Navigate to="/onboarding" replace />;
  const visibleNav = nav.filter(
    (n) =>
      !n.permission ||
      !business.data ||
      business.data.permissions.includes(n.permission),
  );
  const menu = (
    <>
      <Link to="/" className="brand">
        <span className="brand-mark">
          T<span>•</span>
        </span>
        tech<span className="brand-light">pos</span>
      </Link>
      <div className="business-select">
        <label>YOUR BUSINESS</label>
        <select
          aria-label="Your business"
          value={tenant}
          onChange={(e) => switchTenant(e.target.value)}
        >
          {activeTenants.map((t) => (
            <option key={t.public_id} value={t.public_id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <p className="nav-caption">WORKSPACE</p>
      <nav aria-label="Main navigation">
        {visibleNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            onClick={() => setMobile(false)}
          >
            <n.icon size={19} />
            {n.name}
          </NavLink>
        ))}
        {(me.data.user.is_superadmin || me.data.user.platform_access) && (
          <NavLink to="/platform" onClick={() => setMobile(false)}>
            <Shield size={19} />
            Platform administration
          </NavLink>
        )}
      </nav>
      <div className="sidebar-bottom">
        <span className="avatar">{me.data.user.name.slice(0, 1)}</span>
        <div>
          <strong>{me.data.user.name}</strong>
          <small>{business.data?.plan.name ?? "Your"} plan</small>
        </div>
        <button className="icon-button" aria-label="Sign out" onClick={logout}>
          <LogOut size={18} />
        </button>
      </div>
    </>
  );
  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">{menu}</aside>
      <Modal
        open={mobile}
        onOpenChange={setMobile}
        title="Your workspace"
        description="Navigate your business workspace."
      >
        {menu}
      </Modal>
      <div className="app-body">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="global-search">
            <Search size={18} />
            <input
              aria-label="Search workspace pages"
              placeholder="Find your way around…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <div className="search-results">
                {visibleNav
                  .filter((n) =>
                    n.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((n) => (
                    <Link key={n.to} to={n.to} onClick={() => setSearch("")}>
                      {n.name}
                      <ChevronRight size={14} />
                    </Link>
                  ))}
                {!visibleNav.some((n) =>
                  n.name.toLowerCase().includes(search.toLowerCase()),
                ) && <p>No matching pages.</p>}
              </div>
            )}
          </div>
          <div className="row">
            <span className={`connection ${online ? "" : "is-offline"}`}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              <span>
                {online ? "Connected" : "Offline"} · {pending} queued
              </span>
            </span>
            <button
              className="icon-button"
              onClick={() => setDark(!dark)}
              aria-label={dark ? "Use light theme" : "Use dark theme"}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <ErrorBox error={logoutError} />
          {!me.data.user.email_verified_at && (
            <div className="alert">
              <Bell size={18} />
              <span>
                Verify your email to add products, use checkout and manage
                payments.
              </span>
              <button
                className="text-button"
                onClick={() =>
                  api<{ message: string }>(
                    "auth/verification-notification",
                    json("POST", {}),
                  )
                    .then((r) => notify(r.message))
                    .catch((e) => notify(e.message))
                }
              >
                Resend link
              </button>
            </div>
          )}
          {business.isPending ? (
            <Loading />
          ) : business.error ? (
            <>
              <ErrorBox error={business.error} />
              <button className="button" onClick={() => business.refetch()}>
                Retry
              </button>
            </>
          ) : (
            business.data && (
              <Workspace.Provider
                value={{ me: me.data, business: business.data }}
              >
                <Outlet />
              </Workspace.Provider>
            )
          )}
        </main>
        <footer className="app-footer">
          <span>Tech POS · A little more organized, every day.</span>
          <span>Check pending transactions before closing your shift.</span>
        </footer>
      </div>
    </div>
  );
}
function Overview() {
  const { me, business } = useWorkspace();
  const canSetup = business.permissions.includes("onboarding.manage");
  return (
    <>
      <PageTitle
        eyebrow="A GOOD DAY TO GROW"
        title={`Hello, ${me.user.name.split(" ")[0]}.`}
        description="Here’s where your business stands. Let’s take the next step together."
        action={
          canSetup && (
            <Link to="/onboarding" className="button">
              <Sparkles size={17} />
              Personalize workspace
            </Link>
          )
        }
      />
      <div className="welcome-panel">
        <div>
          <span className="badge">YOUR BUSINESS, CONNECTED</span>
          <h2>
            Make space for
            <br />
            what comes next.
          </h2>
          <p>
            Start with the essentials. Shape your workspace
            <br className="desktop-only" /> around the way you work.
          </p>
          {canSetup && (
            <Link to="/onboarding" className="button white">
              Continue business setup
              <ArrowUpRight size={17} />
            </Link>
          )}
        </div>
        <div className="workspace-art" aria-hidden="true">
          <div className="art-icon">
            <Store size={55} />
          </div>
          <div className="art-line">
            <CheckCircle2 />
            Your workspace is ready
          </div>
          <div className="art-line">
            <Shield />
            Your data stays in your business
          </div>
        </div>
      </div>
      <TodayOverview />
      <SetupChecklist />
      <div className="stats-grid mt">
        <article className="stat">
          <span>Current plan</span>
          <strong>{business.plan.name}</strong>
          <small>
            PKR {Number(business.plan.prices[0]?.amount ?? 0).toLocaleString()}{" "}
            / month
          </small>
        </article>
        <article className="stat">
          <span>Business locations</span>
          <strong>
            {business.branches.length.toString().padStart(2, "0")}
          </strong>
          <small>of {business.plan.limits.branches} available branches</small>
        </article>
        <article className="stat">
          <span>Business time zone</span>
          <strong className="stat-small">{business.tenant.timezone}</strong>
          <small>Activity is stored securely in UTC</small>
        </article>
      </div>
      <div className="section-heading">
        <h2>Your next steps</h2>
        <span className="muted">A workspace that fits you</span>
      </div>
      <div className="cards-grid">
        {[
          {
            to: "/modules",
            icon: SlidersHorizontal,
            title: "Choose your modules",
            body: "Explore the capabilities included in your plan.",
          },
          {
            to: "/roles",
            icon: Users,
            title: "Set clear permissions",
            body: "Give your team the right access for their role.",
            permission: "roles.manage",
          },
          {
            to: "/labels",
            icon: Languages,
            title: "Make it sound like you",
            body: "Customize the words your business uses.",
          },
        ]
          .filter(
            (c) => !c.permission || business.permissions.includes(c.permission),
          )
          .map((c) => (
            <Link to={c.to} key={c.to} className="action-card">
              <c.icon size={24} />
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              <span>
                Get started
                <ArrowUpRight size={17} />
              </span>
            </Link>
          ))}
      </div>
      <BusinessLocations />
    </>
  );
}
function BusinessLocations() {
  const { me, business } = useWorkspace();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const canManage = business.permissions.includes("branches.manage");
  const limit = Number(business.plan.limits.branches ?? 0);
  const atLimit = business.branches.length >= limit;
  const verified = !!me.user.email_verified_at;
  function close(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (!next) {
      setName("");
      setAddress("");
      setError(undefined);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(
        "branches",
        json("POST", { name: name.trim(), address: address.trim() || null }),
      );
      await client.invalidateQueries({ queryKey: ["business"] });
      notify(`${name.trim()} was added. Its stockroom and register are ready.`);
      setBusy(false);
      close(false);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  return (
    <section className="panel mt">
      <div className="section-heading">
        <div>
          <h2>Business locations</h2>
          <p className="muted">
            {business.branches.length} of {limit} branches on your plan.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setOpen(true)}
            disabled={atLimit || !verified}
            title={
              !verified
                ? "Verify your email before adding a branch."
                : atLimit
                  ? "Your plan's branch limit is reached. Upgrade to add more."
                  : undefined
            }
          >
            <Store size={16} />
            Add branch
          </button>
        )}
      </div>
      {canManage && (atLimit || !verified) && (
        <p className="muted">
          {!verified ? (
            "Verify your email address to add another branch."
          ) : (
            <>
              Your plan's branch limit is reached.{" "}
              <Link to="/subscription">Upgrade to add more.</Link>
            </>
          )}
        </p>
      )}
      {business.branches.map((b) => (
        <div className="list-row" key={b.public_id}>
          <Store size={21} />
          <div>
            <strong>{b.name}</strong>
            <small>{b.address ?? "No address recorded."}</small>
          </div>
          <span className="status-pill">Active</span>
        </div>
      ))}
      <Modal
        open={open}
        onOpenChange={close}
        title="Add a branch"
        description="A new branch gets its own default stockroom and register. Stock and sales are tracked separately per branch."
      >
        <form onSubmit={submit}>
          <ErrorBox error={error} />
          <div className="form-grid">
            <label className="span-two">
              Branch name
              <input
                required
                autoFocus
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="span-two">
              Address (optional)
              <input
                maxLength={255}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
          </div>
          <button
            type="submit"
            className="button mt"
            disabled={busy || !name.trim()}
          >
            {busy ? "Adding…" : "Add branch"}
          </button>
        </form>
      </Modal>
    </section>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <GlobalToast />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="invitations/:token" element={<InvitationPage />} />
            <Route path="account" element={<AccountPage />} />
            {(
              [
                "login",
                "register",
                "forgot-password",
                "reset-password",
              ] as const
            ).map((mode) => (
              <Route
                key={mode}
                path={`/${mode}`}
                element={<AuthPage mode={mode} />}
              />
            ))}
            <Route path="platform/*" element={<PlatformPage />} />
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="pos" element={<CashierPage />} />
              <Route path="catalog" element={<CatalogPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="sales" element={<SalesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="intelligence" element={<IntelligencePage />} />
              <Route path="sync" element={<SyncPage />} />
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route path="modules" element={<ModulesPage />} />
              <Route path="labels" element={<LabelsPage />} />
              <Route path="roles" element={<RolesPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="subscription" element={<SubscriptionPage />} />
            </Route>
            <Route
              path="*"
              element={
                <main className="standalone">
                  <h1>Page not found</h1>
                  <Link to="/">Return to your workspace</Link>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
function GlobalToast() {
  const { notice, notify } = useClient();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => notify(""), 5000);
    return () => clearTimeout(t);
  }, [notice, notify]);
  return notice ? (
    <div className="toast" role="status">
      <CheckCircle2 size={18} />
      {notice}
    </div>
  ) : null;
}
