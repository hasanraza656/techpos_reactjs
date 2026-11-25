import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { OpsSetup } from "../lib/operations";
import { ProductImage } from "../components/ProductImage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Keyboard,
  Pause,
  RotateCcw,
  Printer,
  Star,
  CloudDownload,
  RefreshCw,
  Check,
  Settings2,
  X,
  Wallet,
} from "lucide-react";
import { useOperations } from "../hooks/useOperations";
import { useCheckoutLease } from "../hooks/useCheckoutLease";
import {
  attemptKey,
  creditAccess,
  creditState,
  ops,
  query,
} from "../lib/operations";
import type {
  Product,
  CartLine,
  Page,
  Customer,
  SaleDocument,
  SalePayload,
} from "../lib/operations";
import { json, ApiError, useClient } from "../lib/api";
import { businessStore } from "../lib/offline";
import { networkFailure, readSnapshot } from "../lib/sessionCache";
import type { LocalReceipt } from "../lib/offline";
import {
  cacheCatalog,
  cachedProducts,
  persistSale,
  syncSales,
} from "../lib/posStorage";
import { cartTotals, scaled, formatted, linePrice } from "../lib/decimal";
import {
  defaultShortcuts,
  migrateShortcuts,
  shortcutLabels,
  useShortcuts,
  validShortcuts,
} from "../lib/shortcuts";
import type { ShortcutMap, ShortcutAction } from "../lib/shortcuts";
import { printElement } from "../lib/printing";
import { Receipt } from "../components/Receipt";
import { Modal, ErrorBox, Loading } from "../components/ui";
import { OperationLocation } from "../components/OperationLocation";
type DialogName =
  | "customer"
  | "discount"
  | "hold"
  | "held"
  | "payment"
  | "calculator"
  | "guide"
  | "settings"
  | "new"
  | "shift"
  | "walkthrough"
  | null;
export function CashierPage() {
  const o = useOperations();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const tenant = o.business.tenant.public_id;
  const user = o.me.user.public_id;
  const checkoutLease = useCheckoutLease(`${user}:${tenant}`);
  const [online, setOnline] = useState(navigator.onLine);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("0.00");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [hydratedScope, setHydratedScope] = useState("");
  const [practice, setPractice] = useState(false);
  const [compact, setCompact] = useState(false);
  const [mobileCart, setMobileCart] = useState(false);
  // Short screens collapse subtotal/discount/tax behind a toggle (CSS-only elsewhere).
  const [breakdown, setBreakdown] = useState(false);
  const [receipt, setReceipt] = useState<LocalReceipt | null>(null);
  const [pending, setPending] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState("all");
  const [category, setCategory] = useState("");
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(defaultShortcuts);
  const [printWidth, setPrintWidth] = useState<"58" | "80" | "a4">("80");
  const [cacheProgress, setCacheProgress] = useState("");
  const scanner = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  // Credit sales go straight to the server (never the offline outbox). An unchanged retry
  // after a dropped connection reuses this key so the server cannot record it twice.
  const creditAttempt = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  // One Enter = one add. `scanEdit` counts edits of the scan field; a submit consumes the
  // current count, so a repeated Enter/Find for the same typed text (key repeat, CR+LF
  // scanner suffix, impatient second press while the lookup is slow) is ignored.
  const scanEdit = useRef(0);
  const scanConsumed = useRef(-1);
  // Bumped whenever the cart is replaced (sale finished, held, resumed, cleared, loaded) so a
  // lookup still in flight cannot add its product to the next customer's cart.
  const saleEpoch = useRef(0);
  const cartKey = `${o.branch}:${o.warehouse}`;
  const scopeKey = `${user}:${tenant}:${cartKey}`;
  const ready = hydratedScope === scopeKey;
  useEffect(() => {
    if (dialog) setMobileCart(false);
  }, [dialog]);
  const totals = useMemo(() => {
    try {
      return {
        value: cartTotals(cart, discount, customer?.price_tier),
        error: null,
      };
    } catch (e) {
      return { value: null, error: e };
    }
  }, [cart, discount, customer?.price_tier]);
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
    const timer = setTimeout(() => setDebounced(search.trim()), 180);
    return () => clearTimeout(timer);
  }, [search]);
  const refreshPending = useCallback(async () => {
    const db = businessStore(tenant, user);
    try {
      setPending(await db.outbox.count());
    } finally {
      db.close();
    }
  }, [tenant, user]);
  useEffect(() => {
    if (!o.ready || !checkoutLease.held) return;
    let cancelled = false;
    const db = businessStore(tenant, user);
    Promise.all([
      db.carts.get(cartKey),
      db.metadata.get("pos-preferences"),
      db.metadata.get("walkthrough-seen"),
    ])
      .then(([saved, prefs, tutorial]) => {
        if (cancelled) return;
        saleEpoch.current++;
        setCart(saved?.lines ?? []);
        setCustomer(saved?.customer ?? null);
        setDiscount(saved?.discount ?? "0.00");
        const v = prefs?.value as
          | {
              favorites?: string[];
              recent?: string[];
              compact?: boolean;
              shortcuts?: ShortcutMap;
              width?: "58" | "80" | "a4";
            }
          | undefined;
        setFavoriteIds(v?.favorites ?? []);
        setRecent(v?.recent ?? []);
        setCompact(v?.compact ?? false);
        if (v?.shortcuts) setShortcuts(migrateShortcuts(v.shortcuts));
        if (v?.width) setPrintWidth(v.width);
        setHydratedScope(scopeKey);
        if (!tutorial) setDialog("walkthrough");
      })
      .catch(setError)
      .finally(() => db.close());
    // Count is advisory (the 15 s sync loop refreshes it); never leave the rejection unhandled.
    refreshPending().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    o.ready,
    tenant,
    user,
    cartKey,
    scopeKey,
    refreshPending,
    checkoutLease.held,
  ]);
  useEffect(() => {
    if (!ready || practice) return;
    const db = businessStore(tenant, user);
    db.carts
      .put({
        key: cartKey,
        lines: cart,
        customer,
        discount,
        updatedAt: new Date().toISOString(),
      })
      .catch(setError)
      .finally(() => db.close());
  }, [cart, customer, discount, ready, practice, tenant, user, cartKey]);
  useEffect(() => {
    if (!ready) return;
    const db = businessStore(tenant, user);
    db.metadata
      .put({
        key: "pos-preferences",
        value: {
          favorites: favoriteIds,
          recent,
          compact,
          shortcuts,
          width: printWidth,
        },
      })
      .catch(setError)
      .finally(() => db.close());
  }, [
    favoriteIds,
    recent,
    compact,
    shortcuts,
    printWidth,
    tenant,
    user,
    ready,
  ]);
  const products = useQuery({
    queryKey: [
      "pos-products",
      tenant,
      o.branch,
      o.warehouse,
      debounced,
      online,
    ],
    queryFn: async () => {
      if (!online)
        return cachedProducts(tenant, user, o.branch, o.warehouse, debounced);
      try {
        return (
          await ops<Page<Product>>(
            "products?" +
              query({
                branch: o.branch,
                warehouse: o.warehouse,
                q: debounced,
                per_page: 60,
              }),
          )
        ).data;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        return cachedProducts(tenant, user, o.branch, o.warehouse, debounced);
      }
    },
    enabled: o.ready,
    networkMode: "always",
    retry: false,
  });
  const credit = creditAccess(o.setup.data, o.permissions);
  const creditLookup = (credit.sell || credit.collect) && !practice;
  // The customer saved with the cart carries a balance snapshot; re-read it before payment.
  const freshCustomer = useQuery({
    queryKey: ["pos-customer-credit", tenant, o.branch, customer?.public_id],
    queryFn: async ({ signal }) => {
      const c = customer!;
      const rows = await ops<Page<Customer>>(
        "customers?" + query({ branch: o.branch, q: c.phone || c.name }),
        { signal },
      );
      return rows.data.find((r) => r.public_id === c.public_id) ?? null;
    },
    enabled: o.ready && online && creditLookup && !!customer,
    retry: false,
  });
  const creditCustomer =
    freshCustomer.data && freshCustomer.data.public_id === customer?.public_id
      ? freshCustomer.data
      : customer;
  const creditInfo = creditState(creditCustomer);
  const creditTender =
    credit.sell && !practice && online && !!customer && creditInfo.enabled
      ? {
          balance: formatted(creditInfo.balance),
          available: formatted(creditInfo.available),
          canOverride: credit.manage,
        }
      : null;
  const creditNote =
    !credit.sell || practice
      ? ""
      : !online
        ? "Credit sales need a connection. Cash still works offline."
        : !customer
          ? "To sell on credit (khata), choose the customer first."
          : !creditInfo.enabled
            ? "Credit is off for this customer (limit 0). A credit manager can set a limit in Customers."
            : "";
  const add = useCallback((p: Product, qty = "1.000", clearSearch = true) => {
    setError(undefined);
    setCart((current) => {
      const old = current.find((l) => l.product.public_id === p.public_id);
      return old
        ? current.map((l) =>
            l.product.public_id === p.public_id
              ? {
                  ...l,
                  quantity: formatted(
                    scaled(l.quantity, 3) + scaled(qty, 3),
                    3,
                  ),
                }
              : l,
          )
        : [...current, { product: p, quantity: qty, discount: "0.00" }];
    });
    setRecent((current) =>
      [p.public_id, ...current.filter((id) => id !== p.public_id)].slice(0, 30),
    );
    if (clearSearch) setSearch("");
    scanner.current?.focus();
  }, []);
  async function scan() {
    const code = search.trim();
    if (!code) return;
    const token = scanEdit.current;
    if (scanConsumed.current === token) return;
    scanConsumed.current = token;
    const epoch = saleEpoch.current;
    // Clear at once so the next scan types into an empty field even while this lookup is
    // slow; on failure the text comes back (unless the cashier already typed something new).
    const typed = search;
    setSearch("");
    const fail = (e: unknown) => {
      if (scanConsumed.current === token) scanConsumed.current = -1;
      if (scanEdit.current === token) setSearch(typed);
      setError(e);
    };
    try {
      let matches: Product[];
      if (!online)
        matches = await cachedProducts(
          tenant,
          user,
          o.branch,
          o.warehouse,
          code,
          true,
        );
      else
        matches = (
          await ops<Page<Product>>(
            "products?" +
              query({
                branch: o.branch,
                warehouse: o.warehouse,
                barcode: code,
                per_page: 2,
              }),
          )
        ).data;
      if (epoch !== saleEpoch.current) {
        fail(
          new Error(
            `The sale changed before "${code}" was found. Scan it again if it belongs to this sale.`,
          ),
        );
        return;
      }
      if (matches.length === 1) {
        const p = matches[0];
        add(
          p,
          p.barcodes.find((b) => b.barcode === code)?.quantity ?? "1.000",
          false,
        );
      } else if (
        // Only trust the visible results when they belong to this exact text;
        // a fast scan can submit before the debounced search catches up.
        debounced === code &&
        !products.isPlaceholderData &&
        products.data?.length === 1
      )
        add(products.data[0], "1.000", false);
      else
        fail(
          new Error(
            "No exact barcode match. Choose a product from the search results.",
          ),
        );
    } catch (e) {
      fail(e);
    }
  }
  function quantity(id: string, delta: string) {
    setCart((items) =>
      items.flatMap((l) => {
        if (l.product.public_id !== id) return [l];
        const next = scaled(l.quantity, 3) + scaled(delta, 3);
        return next > 0n ? [{ ...l, quantity: formatted(next, 3) }] : [];
      }),
    );
  }
  function focusSearch() {
    scanner.current?.focus();
    scanner.current?.select();
  }
  function showPayment() {
    if (!practice && o.setup.data?.shift?.branch !== o.branch) {
      setError(
        new Error(
          "Open a register shift for this branch before taking payment.",
        ),
      );
      return;
    }
    if (cart.length && !totals.error) {
      if (customer && creditLookup && online)
        freshCustomer.refetch().catch(() => {});
      setDialog("payment");
      setError(undefined);
    }
  }
  async function synchronize() {
    if (!online) {
      setError(new Error("Connect to synchronize pending transactions."));
      return;
    }
    setBusy(true);
    try {
      const result = await syncSales(tenant, user);
      await refreshPending();
      client.invalidateQueries({ queryKey: ["pos-products"] });
      client.invalidateQueries({ queryKey: ["operations-bootstrap"] });
      notify(
        `${result.synced} transactions synchronized${result.attention ? `; ${result.attention} need attention` : ""}.`,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function finish(
    payments: SalePayload["payments"],
    overrideReason?: string,
  ) {
    if (
      !checkoutLease.held ||
      lock.current ||
      !totals.value ||
      !o.setup.data ||
      !cart.length
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (!practice && o.setup.data.shift?.branch !== o.branch)
        throw new Error(
          "Open a register shift for this branch before completing a sale.",
        );
      const value = totals.value;
      // Send only canonical decimals the server accepts. A rejected payload is
      // otherwise queued and becomes an "attention" record after the cart clears.
      const lines = cart.map((l) => ({
        ...l,
        quantity: wireDecimal(
          l.quantity,
          3,
          7,
          `Quantity for ${l.product.name}`,
        ),
        discount: wireDecimal(
          l.discount,
          2,
          10,
          `Discount for ${l.product.name}`,
        ),
      }));
      const cartDiscount = wireDecimal(discount, 2, 10, "Cart discount");
      payments = payments.map((p) => {
        const amount = wireDecimal(p.amount, 2, 10, "Payment amount");
        if (p.method === "cash" || p.method === "credit")
          return { method: p.method, amount };
        const reference = (p.reference ?? "").trim();
        if (!reference)
          throw new Error(
            "External payments need a terminal or bank reference.",
          );
        if (reference.length > 120)
          throw new Error("Payment references must be at most 120 characters.");
        return { method: p.method, amount, reference };
      });
      const zeroCashSale =
        scaled(value.total) === 0n &&
        payments.length === 1 &&
        payments[0].method === "cash";
      if (!zeroCashSale && payments.some((p) => scaled(p.amount) <= 0n))
        throw new Error("Each payment amount must be greater than zero.");
      let paid = 0n;
      for (const p of payments) paid += scaled(p.amount);
      if (paid < scaled(value.total))
        throw new Error("The tendered amount is below the total.");
      const onCredit = payments.some((p) => p.method === "credit");
      const approval = onCredit
        ? checkCredit({
            payments,
            total: value.total,
            online,
            practice,
            access: credit,
            hasCustomer: !!customer,
            info: creditInfo,
            currency: o.business.tenant.currency,
            overrideReason,
          })
        : undefined;
      if (!online && payments.some((p) => p.method !== "cash"))
        throw new Error("Only cash can be recorded offline in this milestone.");
      const cash = payments
        .filter((p) => p.method === "cash")
        .reduce((a, p) => a + scaled(p.amount), 0n);
      if (paid - scaled(value.total) > cash)
        throw new Error("Change must come from cash tender.");
      const id = crypto.randomUUID();
      const payload: SalePayload = {
        idempotency_key: id,
        branch: o.branch,
        warehouse: o.warehouse,
        shift: o.setup.data!.shift?.public_id ?? crypto.randomUUID(),
        customer: customer?.public_id ?? null,
        lines: lines.map((l) => ({
          product: l.product.public_id,
          quantity: l.quantity,
          discount: l.discount,
          expected_unit_price: linePrice(l.product, customer?.price_tier),
        })),
        cart_discount: cartDiscount,
        expected_total: value.total,
        payments,
        channel: online ? "online" : "offline",
        ...(onCredit && approval
          ? { credit_override_reason: approval }
          : {}),
      };
      if (onCredit) {
        // Never queued offline: the khata balance and limit are checked by the server now.
        const { idempotency_key: _, ...body } = payload;
        payload.idempotency_key = attemptKey(creditAttempt, body);
        let sale: SaleDocument;
        try {
          sale = await ops<SaleDocument>("sales", json("POST", payload));
        } catch (e) {
          if (networkFailure(e))
            throw new Error(
              "The connection dropped before the server confirmed this credit sale. Nothing was saved on this device and the cart is kept. Press Complete sale again when you are back online; the retry reuses the same sale reference, so it cannot be recorded twice.",
            );
          throw e;
        }
        creditAttempt.current = null;
        saleEpoch.current++;
        setCart([]);
        setDiscount("0.00");
        setCustomer(null);
        setDialog(null);
        setReceipt({
          id: sale.public_id,
          payload,
          document: sale,
          status: "synced",
          createdAt: isoNow(),
        });
        client.invalidateQueries({ queryKey: ["pos-products"] });
        client.invalidateQueries({ queryKey: ["operations-bootstrap"] });
        client.invalidateQueries({ queryKey: ["pos-customer-credit"] });
        client.invalidateQueries({ queryKey: ["pos-customers"] });
        client.invalidateQueries({ queryKey: ["customers"] });
        return;
      }
      const document: SaleDocument = {
        public_id: id,
        receipt_number: `LOCAL-${id.slice(0, 8).toUpperCase()}`,
        business_name: o.business.tenant.name,
        branch_name:
          o.setup.data.branches.find((b) => b.public_id === o.branch)?.name ??
          "",
        currency: o.business.tenant.currency,
        finalized_at: isoNow(),
        subtotal: value.subtotal,
        line_discount: value.line_discount,
        cart_discount: value.cart_discount,
        tax_total: value.tax_total,
        total: value.total,
        change_due: formatted(paid - scaled(value.total)),
        amount_tendered: formatted(paid),
        channel: payload.channel ?? "online",
        customer: customer
          ? {
              public_id: customer.public_id,
              name: customer.name,
              phone: customer.phone,
            }
          : null,
        lines: lines.map((l, i) => ({
          name: l.product.name,
          sku: l.product.sku,
          quantity: l.quantity,
          unit_price: linePrice(l.product, customer?.price_tier),
          total: value.rows[i].total,
          tax: value.rows[i].tax,
          line_discount: value.rows[i].line_discount,
          cart_discount: value.rows[i].cart_discount,
        })),
        payments: payments.map((p) => ({
          ...p,
          reference: p.reference ?? null,
          verification:
            p.method === "cash" ? "cash_received" : "externally_recorded",
        })),
      };
      if (practice) {
        setReceipt({
          id,
          payload,
          document: {
            ...document,
            receipt_number: "PRACTICE · NO FINANCIAL RECORD",
          },
          status: "pending",
          createdAt: isoNow(),
        });
        saleEpoch.current++;
        setCart([]);
        setDiscount("0.00");
        setCustomer(null);
        setDialog(null);
        notify(
          "Practice complete. No stock or financial transaction was written.",
        );
        return;
      }
      if (!online && !o.setup.data.modules.offline_basic)
        throw new Error(
          "Offline checkout is not included or enabled for this business.",
        );
      if (!online) await readSnapshot(user, tenant, "operations");
      const saved = await persistSale(tenant, user, payload, document, cartKey);
      saleEpoch.current++;
      setCart([]);
      setDiscount("0.00");
      setCustomer(null);
      setDialog(null);
      setReceipt(saved);
      await refreshPending();
      if (online) {
        await syncSales(tenant, user);
        const db = businessStore(tenant, user);
        try {
          // syncSales joins an in-flight background run, whose queue snapshot
          // may predate this sale. Run once more if it was never attempted.
          const queued = await db.outbox.get(saved.id);
          if (queued && !queued.lastAttemptAt) await syncSales(tenant, user);
          setReceipt((await db.receipts.get(saved.id)) ?? saved);
        } finally {
          db.close();
        }
        await refreshPending();
        client.invalidateQueries({ queryKey: ["pos-products"] });
        client.invalidateQueries({ queryKey: ["operations-bootstrap"] });
      }
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
      focusSearch();
    }
  }
  useEffect(() => {
    if (!online || !ready) return;
    const run = () =>
      syncSales(tenant, user)
        .then(refreshPending)
        .catch(() => {});
    run();
    const t = setInterval(run, 15000);
    return () => clearInterval(t);
  }, [online, ready, tenant, user, refreshPending]);
  const actions: Record<ShortcutAction, () => void> = {
    search: focusSearch,
    customers: () => setDialog("customer"),
    discount: () => setDialog("discount"),
    hold: () => cart.length && setDialog("hold"),
    held: () => setDialog("held"),
    payment: showPayment,
    cash: () =>
      online && totals.value
        ? finish([{ method: "cash", amount: totals.value.total }])
        : showPayment(),
    calculator: () => setDialog("calculator"),
    guide: () => setDialog("guide"),
    checkout: showPayment,
    print: () => {
      try {
        printElement(receiptRef.current, printWidth);
      } catch (e) {
        setError(e);
      }
    },
    newSale: () => setDialog("new"),
    quickSearch: focusSearch,
  };
  useShortcuts(shortcuts, actions, !!dialog || !!receipt || busy);
  useEffect(() => {
    if (!receipt) return;
    const print = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        try {
          printElement(receiptRef.current, printWidth);
        } catch (e) {
          setError(e);
        }
      }
    };
    window.addEventListener("keydown", print);
    return () => window.removeEventListener("keydown", print);
  }, [receipt, printWidth]);
  const displayed = (products.data ?? []).filter(
    (p) =>
      (!category || p.category_name === category) &&
      (tab === "all" ||
        (tab === "favorites"
          ? favoriteIds.includes(p.public_id)
          : recent.includes(p.public_id))),
  );
  if (o.setup.error) return <ErrorBox error={o.setup.error} />;
  if (checkoutLease.status === "checking")
    return <Loading message="Preparing your cashier…" />;
  if (checkoutLease.status === "error")
    return (
      <div>
        <ErrorBox
          error={
            new Error(
              "We couldn’t check the cashier workspace lock. Retry before starting checkout.",
            )
          }
        />
        <button className="button secondary" onClick={checkoutLease.retry}>
          Retry cashier check
        </button>
      </div>
    );
  if (!checkoutLease.held)
    return (
      <ErrorBox
        error={
          new Error(
            checkoutLease.supported
              ? "Cashier is already open in another tab. Close that cashier tab; this workspace will open automatically."
              : "This browser does not support the exclusive checkout lock. Use a current browser with Web Locks support to avoid duplicate sales across tabs.",
          )
        }
      />
    );
  if (o.setup.isPending) return <Loading />;
  if (!o.setup.data?.branches.length)
    return (
      <ErrorBox
        error={new Error("You do not have access to a cashier branch.")}
      />
    );
  if (!ready) return error ? <ErrorBox error={error} /> : <Loading />;
  const shift = o.setup.data.shift;
  const validShift = practice || shift?.branch === o.branch;
  const cartView = (
    <>
      <div className="cart-heading">
        <h2>
          Current sale <span>{cart.length}</span>
        </h2>
        <button
          className="icon-button"
          aria-label="Clear cart"
          disabled={!cart.length}
          onClick={() => setDialog("new")}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <button
        className="customer-selector"
        aria-label={
          customer
            ? `Customer ${customer.name}. Change customer`
            : "Walk-in customer. Choose a customer"
        }
        onClick={() => setDialog("customer")}
      >
        <span className="customer-selector-text">
          <span>
            {customer
              ? `${customer.name} · ${customer.price_tier}`
              : "Walk-in customer"}
          </span>
          {customer && creditLookup && creditInfo.enabled && (
            <small>
              Khata {formatted(creditInfo.balance)} · available{" "}
              {formatted(creditInfo.available)}
            </small>
          )}
        </span>
        <Plus size={16} />
      </button>
      <div className="cart-items">
        {!cart.length ? (
          <div className="empty">
            <ScanBarcode size={36} />
            <h3>Ready for the next customer.</h3>
            <p>Scan a barcode or choose a product.</p>
          </div>
        ) : (
          cart.map((l, i) => (
            <article className="cart-line" key={l.product.public_id}>
              <div className="row between">
                <strong>{l.product.name}</strong>
                <button
                  className="icon-button"
                  aria-label={`Remove ${l.product.name}`}
                  onClick={() =>
                    setCart((items) =>
                      items.filter(
                        (item) =>
                          item.product.public_id !== l.product.public_id,
                      ),
                    )
                  }
                >
                  <X size={14} />
                </button>
              </div>
              <small>
                {l.product.sku} · {linePrice(l.product, customer?.price_tier)} /{" "}
                {l.product.unit}
              </small>
              <div className="cart-line-bottom">
                <div className="quantity-stepper">
                  <button
                    aria-label={`Decrease ${l.product.name}`}
                    onClick={() =>
                      quantity(
                        l.product.public_id,
                        l.product.type === "weighted" ? "-0.100" : "-1.000",
                      )
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    aria-label={`Quantity for ${l.product.name}`}
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^\d*(\.\d{0,3})?$/.test(value))
                        setCart((items) =>
                          items.map((item) =>
                            item.product.public_id === l.product.public_id
                              ? { ...item, quantity: value || "0" }
                              : item,
                          ),
                        );
                    }}
                    onBlur={() => {
                      try {
                        if (scaled(l.quantity, 3) <= 0n)
                          setCart((items) =>
                            items.filter(
                              (item) =>
                                item.product.public_id !== l.product.public_id,
                            ),
                          );
                      } catch (e) {
                        setError(e);
                      }
                    }}
                  />
                  <button
                    aria-label={`Increase ${l.product.name}`}
                    onClick={() =>
                      quantity(
                        l.product.public_id,
                        l.product.type === "weighted" ? "0.100" : "1.000",
                      )
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <strong>{totals.value?.rows[i].total ?? "—"}</strong>
              </div>
              {o.permissions.includes("sales.discount") && (
                <label className="line-discount">
                  Discount
                  <input
                    aria-label={`Discount for ${l.product.name}`}
                    inputMode="decimal"
                    value={l.discount}
                    onChange={(e) => {
                      if (/^\d*(\.\d{0,2})?$/.test(e.target.value))
                        setCart((items) =>
                          items.map((item) =>
                            item.product.public_id === l.product.public_id
                              ? { ...item, discount: e.target.value || "0" }
                              : item,
                          ),
                        );
                    }}
                  />
                </label>
              )}
            </article>
          ))
        )}
      </div>
      <div className={`cart-summary ${breakdown ? "breakdown-open" : ""}`}>
        <div className="summary-row">
          <span>Marked subtotal</span>
          <span>{totals.value?.subtotal ?? "—"}</span>
        </div>
        <div className="summary-row">
          <button
            className="text-button"
            disabled={!o.permissions.includes("sales.discount")}
            onClick={() => setDialog("discount")}
          >
            Discounts
          </button>
          <span>
            −
            {totals.value
              ? formatted(
                  scaled(totals.value.line_discount) +
                    scaled(totals.value.cart_discount),
                )
              : "—"}
          </span>
        </div>
        <div className="summary-row">
          <span>Tax breakdown</span>
          <span>{totals.value?.tax_total ?? "—"}</span>
        </div>
        <div className="cart-total">
          <strong>
            Total <small>{o.business.tenant.currency}</small>
          </strong>
          <button
            type="button"
            className="text-button breakdown-toggle"
            aria-expanded={breakdown}
            onClick={() => setBreakdown((v) => !v)}
          >
            {breakdown ? "Hide details" : "Details"}
          </button>
          <strong>{totals.value?.total ?? "—"}</strong>
        </div>
        <ErrorBox error={totals.error} />
        <button
          className="button full pay-button"
          disabled={!cart.length || busy || !validShift || !!totals.error}
          onClick={showPayment}
        >
          <Wallet size={19} />
          Take payment <kbd>{shortcuts.payment}</kbd>
        </button>
        <div className="row between">
          <button
            className="text-button"
            disabled={!cart.length}
            onClick={() => setDialog("hold")}
          >
            <Pause size={15} />
            Hold sale
          </button>
          <button className="text-button" onClick={() => setDialog("held")}>
            <RotateCcw size={15} />
            Held sales
          </button>
        </div>
      </div>
    </>
  );
  return (
    <div className={`cashier ${compact ? "cashier-compact" : ""}`}>
      <header className="cashier-toolbar">
        <div>
          <span className="eyebrow">CASHIER WORKSPACE</span>
          <h1>{o.business.tenant.name}</h1>
        </div>
        <div className="row cashier-tools">
          <span className={`status-pill ${online ? "" : "offline-pill"}`}>
            {online ? "Online" : "Offline"} · {pending} pending
          </span>
          <button
            className="icon-button"
            aria-label="Synchronize sales"
            disabled={busy || !online}
            onClick={synchronize}
          >
            <RefreshCw size={18} />
          </button>
          <Link className="button secondary" to="/sync">
            Sync issues
          </Link>
          <button
            className="icon-button"
            aria-label="Cashier settings"
            onClick={() => setDialog("settings")}
          >
            <Settings2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Show shortcuts"
            onClick={() => setDialog("guide")}
          >
            <Keyboard size={19} />
          </button>
        </div>
      </header>
      {practice && (
        <div className="alert">
          PRACTICE MODE · No inventory or financial records will be written.
        </div>
      )}
      <ErrorBox error={error} />
      <div className="cashier-location-row">
        <OperationLocation
          setup={o.setup.data}
          branch={o.branch}
          warehouse={o.warehouse}
          onBranch={o.setBranch}
          onWarehouse={o.setWarehouse}
          disabled={!!cart.length || busy}
        />
        <button className="button secondary" onClick={() => setDialog("shift")}>
          {shift?.branch === o.branch ? "Manage shift" : "Open register shift"}
        </button>
      </div>
      {!validShift && (
        <div className="alert">
          <Wallet size={18} />
          Open a shift before completing a sale. Catalog search is available
          now.
        </div>
      )}
      <div className="cashier-layout">
        <section className="cashier-products">
          <form
            className="scanner-search"
            onSubmit={(e) => {
              e.preventDefault();
              scan();
            }}
          >
            <ScanBarcode size={22} />
            <input
              ref={scanner}
              autoFocus
              data-scanner
              aria-label="Scan barcode or search products"
              value={search}
              onChange={(e) => {
                scanEdit.current++;
                setSearch(e.target.value);
              }}
              placeholder="Scan a barcode or search products…"
              autoComplete="off"
              enterKeyHint="search"
            />
            <kbd>{shortcuts.search}</kbd>
            <button type="submit" className="button secondary">
              Find
            </button>
          </form>
          <div className="pos-filters">
            <div className="tabs">
              {[
                ["all", "All products"],
                ["favorites", "Favorites"],
                ["recent", "Recent"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label="Filter product category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {[
                ...new Set(
                  (products.data ?? [])
                    .map((p) => p.category_name)
                    .filter(Boolean),
                ),
              ].map((c) => (
                <option key={c!}>{c}</option>
              ))}
            </select>
          </div>
          <ErrorBox error={products.error} />
          {products.isPending ? (
            <Loading />
          ) : !displayed.length ? (
            <div className="empty">
              <ShoppingBag size={32} />
              <h3>No matching products.</h3>
              <p>
                {tab === "favorites"
                  ? "Star a product to keep it close."
                  : "Try another search, or add products in the catalog."}
              </p>
              <Link className="text-button" to="/catalog">
                Open catalog
              </Link>
            </div>
          ) : (
            <div className="pos-product-grid">
              {displayed.map((p) => (
                <article className="pos-product-card" key={p.public_id}>
                  <button className="product-add" onClick={() => add(p)}>
                    <ProductImage
                      image={p.image}
                      name={p.name}
                      className="cashier-product-photo"
                    />
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                    <span className="product-price">
                      {o.business.tenant.currency}{" "}
                      {linePrice(p, customer?.price_tier)}
                    </span>
                    <small>
                      {p.track_stock
                        ? `${p.stock_quantity} ${p.unit} in stock`
                        : "Non-stock service"}
                    </small>
                  </button>
                  <button
                    className={`favorite-button ${favoriteIds.includes(p.public_id) ? "selected" : ""}`}
                    aria-label={`${favoriteIds.includes(p.public_id) ? "Unfavorite" : "Favorite"} ${p.name}`}
                    onClick={() =>
                      setFavoriteIds((ids) =>
                        ids.includes(p.public_id)
                          ? ids.filter((id) => id !== p.public_id)
                          : [...ids, p.public_id],
                      )
                    }
                  >
                    <Star size={16} />
                  </button>
                </article>
              ))}
            </div>
          )}
          <footer className="pos-catalog-footer">
            <button
              className="text-button"
              disabled={!online || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const db = businessStore(tenant, user);
                  try {
                    if (await db.outbox.count())
                      throw new Error(
                        "Synchronize pending sales before refreshing the catalog.",
                      );
                  } finally {
                    db.close();
                  }
                  const count = await cacheCatalog(
                    tenant,
                    user,
                    o.branch,
                    o.warehouse,
                    (count) => setCacheProgress(`${count} products cached…`),
                  );
                  setCacheProgress(`${count} products ready offline`);
                  notify("Offline catalog refreshed.");
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <CloudDownload size={16} />
              Prepare offline catalog
            </button>
            <small>
              {cacheProgress ||
                "Cache this location while connected before working offline."}
            </small>
          </footer>
        </section>
        <aside className="cashier-cart">{cartView}</aside>
      </div>
      <button
        className="mobile-cart-summary button"
        onClick={() => setMobileCart(true)}
      >
        <ShoppingBag size={20} />
        {cart.length} items
        <span>
          {o.business.tenant.currency} {totals.value?.total ?? "0.00"}
        </span>
      </button>
      <Modal
        open={mobileCart}
        onOpenChange={setMobileCart}
        title={`Current sale (${cart.length})`}
        description="Review items and complete payment."
      >
        {cartView}
      </Modal>
      <Modal
        open={dialog === "payment"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title="Take payment"
        description={
          practice
            ? "Practice only. No money or stock will be recorded."
            : online
              ? "Confirm funds received. External payments are recorded, never automatically authorized."
              : "Offline cash sale. A durable local receipt will wait for server verification."
        }
      >
        {totals.value && (
          <PaymentForm
            total={totals.value.total}
            currency={o.business.tenant.currency}
            busy={busy}
            online={online}
            error={error}
            credit={creditTender}
            creditNote={creditNote}
            onSubmit={finish}
          />
        )}
      </Modal>
      <Modal
        open={dialog === "discount"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title="Cart discount"
        description="Enter a fixed amount. Discount permission is enforced again by the server."
      >
        <label>
          Discount amount
          <input
            inputMode="decimal"
            value={discount}
            disabled={!o.permissions.includes("sales.discount")}
            onChange={(e) => {
              if (/^\d*(\.\d{0,2})?$/.test(e.target.value))
                setDiscount(e.target.value || "0");
            }}
          />
        </label>
        <ErrorBox error={totals.error} />
        <button className="button full mt" onClick={() => setDialog(null)}>
          Apply discount
        </button>
      </Modal>
      <Modal
        open={dialog === "customer"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title="Choose a customer"
        description="Walk-in sales do not require a profile."
      >
        <CustomerLookup
          branch={o.branch}
          online={online}
          showCredit={creditLookup}
          onChoose={(c) => {
            setCustomer(c);
            setDialog(null);
          }}
        />
      </Modal>
      <Modal
        open={dialog === "new"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title="Start a new sale?"
        description="This clears the unsubmitted cart. Finalized and pending transactions are preserved."
      >
        <button
          className="button full mt"
          onClick={() => {
            saleEpoch.current++;
            setCart([]);
            setCustomer(null);
            setDiscount("0.00");
            setDialog(null);
            focusSearch();
          }}
        >
          Clear cart and continue
        </button>
      </Modal>
      <Modal
        open={dialog === "hold" || dialog === "held"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title={dialog === "hold" ? "Hold this cart" : "Resume a held cart"}
        description="Held carts do not reserve inventory or record money. Prices are checked again at checkout."
      >
        <HeldCarts
          branch={o.branch}
          tenant={tenant}
          user={user}
          mode={dialog === "hold" ? "hold" : "list"}
          cart={cart}
          customer={customer}
          discount={discount}
          online={online}
          onHold={() => {
            saleEpoch.current++;
            setCart([]);
            setCustomer(null);
            setDiscount("0.00");
            setDialog(null);
            notify("Cart held.");
          }}
          onResume={(lines, c, d) => {
            saleEpoch.current++;
            setCart(lines);
            setCustomer(c);
            setDiscount(d);
            setDialog(null);
          }}
        />
      </Modal>
      <Modal
        open={dialog === "calculator"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title="Quick calculator"
        description="Exact decimal arithmetic, without changing the sale."
      >
        <Calculator />
      </Modal>
      <Modal
        open={dialog === "guide"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title="A quicker way to checkout"
        description="Shortcuts work on the cashier screen and scanner field. Other form fields keep their usual keys."
      >
        <div ref={guideRef}>
          <h2>Tech POS shortcut guide</h2>
          {(Object.entries(shortcuts) as [ShortcutAction, string][]).map(
            ([action, key]) => (
              <div className="detail-row" key={action}>
                <span>{shortcutLabels[action]}</span>
                <kbd>{key}</kbd>
              </div>
            ),
          )}
        </div>
        <button
          className="button secondary full mt"
          onClick={() => {
            try {
              printElement(guideRef.current, "a4");
            } catch (e) {
              setError(e);
            }
          }}
        >
          <Printer size={16} />
          Print shortcut guide
        </button>
      </Modal>
      <Modal
        open={dialog === "settings"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title="Make checkout yours"
        description="Preferences are saved on this user’s device for this business."
      >
        <label className="check-label">
          <input
            type="checkbox"
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
          />
          Compact, search-focused layout
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={practice}
            disabled={!!cart.length || busy}
            onChange={(e) => setPractice(e.target.checked)}
          />
          Practice mode (start with an empty cart)
        </label>
        <label>
          Receipt paper
          <select
            value={printWidth}
            onChange={(e) => setPrintWidth(e.target.value as typeof printWidth)}
          >
            <option value="58">58mm thermal</option>
            <option value="80">80mm thermal</option>
            <option value="a4">A4 invoice</option>
          </select>
        </label>
        <p className="muted">
          Printing opens your browser’s printer dialog. Silent, USB, network,
          drawer and Bluetooth printing need a supported bridge and verified
          hardware.
        </p>
        <ShortcutEditor
          value={shortcuts}
          onSave={(v) => {
            setShortcuts(v);
            notify("Shortcuts saved.");
          }}
        />
        <button
          className="button secondary full mt"
          onClick={() => setDialog("walkthrough")}
        >
          Replay quick walkthrough
        </button>
      </Modal>
      <Modal
        open={dialog === "shift"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title={validShift ? "Register shift" : "Open your register"}
        description="Opening float and cash movements are real register records."
      >
        <ShiftForm
          setup={o.setup.data}
          branch={o.branch}
          online={online}
          pending={pending}
          onSaved={() => {
            client.invalidateQueries({ queryKey: ["operations-bootstrap"] });
            setDialog(null);
            notify("Register updated.");
          }}
        />
      </Modal>
      <Modal
        open={dialog === "walkthrough"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title="A quick start at the counter"
        description="Four small habits make checkout faster."
      >
        <Walkthrough
          onDone={async () => {
            const db = businessStore(tenant, user);
            try {
              await db.metadata.put({ key: "walkthrough-seen", value: true });
            } catch (e) {
              setError(e);
            } finally {
              db.close();
            }
            setDialog(null);
            focusSearch();
          }}
        />
      </Modal>
      <Modal
        open={!!receipt}
        onOpenChange={(v) => {
          if (!v) {
            setReceipt(null);
            setError(undefined);
            focusSearch();
          }
        }}
        title={
          practice
            ? "Practice complete"
            : receipt?.status === "synced"
              ? "Sale completed"
              : receipt?.status === "attention"
                ? "Sale needs review"
                : "Sale saved locally"
        }
        description={
          practice
            ? "Practice receipt only. No sale, stock movement or payment was recorded."
            : receipt?.status === "synced"
              ? "Recorded once, with stock and payment history."
              : "The local record is preserved. Synchronize and resolve any server conflicts before treating it as accepted."
        }
      >
        {receipt && (
          <>
            <ErrorBox error={error} />
            <Receipt
              ref={receiptRef}
              sale={receipt.document}
              pending={receipt.status !== "synced" && !practice}
            />
            <div className="row mt">
              <button
                className="button secondary"
                onClick={() => {
                  try {
                    printElement(receiptRef.current, printWidth);
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                <Printer size={17} />
                Print receipt
              </button>
              <button
                className="button"
                onClick={() => {
                  setReceipt(null);
                  setError(undefined);
                  focusSearch();
                }}
              >
                Next customer
                <Check size={17} />
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// Event-time timestamp for receipts (kept out of render code paths).
function isoNow() {
  return new Date().toISOString();
}
/**
 * Client-side mirror of the server's credit (khata) rules. Throws a cashier-readable
 * error, or returns the override reason to send when a credit manager exceeds the limit.
 */
function checkCredit({
  payments,
  total,
  online,
  practice,
  access,
  hasCustomer,
  info,
  currency,
  overrideReason,
}: {
  payments: SalePayload["payments"];
  total: string;
  online: boolean;
  practice: boolean;
  access: { sell: boolean; manage: boolean };
  hasCustomer: boolean;
  info: { enabled: boolean; available: bigint };
  currency: string;
  overrideReason?: string;
}): string | undefined {
  const creditRows = payments.filter((p) => p.method === "credit");
  if (!online) throw new Error("Credit sales need a connection.");
  if (practice)
    throw new Error("Practice mode does not record credit. Use cash.");
  if (!access.sell)
    throw new Error(
      "You do not have permission to sell on credit in this branch.",
    );
  if (!hasCustomer)
    throw new Error("Choose the customer before selling on credit.");
  if (creditRows.length !== 1)
    throw new Error("Use a single credit (khata) line.");
  if (!info.enabled)
    throw new Error(
      "Credit is not enabled for this customer. Set a credit limit in Customers first.",
    );
  const onKhata = scaled(creditRows[0].amount);
  const others = payments
    .filter((p) => p.method !== "credit")
    .reduce((a, p) => a + scaled(p.amount), 0n);
  if (onKhata > scaled(total) - others)
    throw new Error(
      "Credit cannot be more than the amount still due. Credit never gives change.",
    );
  if (onKhata <= info.available) return undefined;
  if (!access.manage)
    throw new Error(
      `Over the credit limit. Available credit: ${currency} ${formatted(info.available)}. Ask a manager to raise the limit.`,
    );
  const reason = overrideReason?.trim() ?? "";
  if (reason.length < 5 || reason.length > 500)
    throw new Error(
      "Write an override reason of 5–500 characters to exceed the credit limit.",
    );
  return reason;
}
// Canonicalize a cashier-typed decimal ("5." -> "5.000") within the server's digit limits.
function wireDecimal(
  value: string,
  precision: number,
  wholeDigits: number,
  label: string,
) {
  const text = formatted(scaled(value || "0", precision), precision);
  if (text.startsWith("-") || text.split(".")[0].length > wholeDigits)
    throw new Error(`${label} is outside the supported range.`);
  return text;
}
function PaymentForm({
  total,
  currency,
  busy,
  online,
  error,
  credit,
  creditNote,
  onSubmit,
}: {
  total: string;
  currency: string;
  busy: boolean;
  online: boolean;
  error: unknown;
  /** Offered only online, with permission and a customer whose credit limit is above 0. */
  credit: { balance: string; available: string; canOverride: boolean } | null;
  creditNote: string;
  onSubmit: (p: SalePayload["payments"], overrideReason?: string) => void;
}) {
  const [rows, setRows] = useState<SalePayload["payments"]>([
    { method: "cash", amount: total },
  ]);
  const [override, setOverride] = useState("");
  let paid = 0n;
  let onKhata = 0n;
  let invalid = false;
  try {
    for (const r of rows) {
      paid += scaled(r.amount);
      if (r.method === "credit") onKhata += scaled(r.amount);
    }
  } catch {
    invalid = true;
  }
  const change = paid - scaled(total);
  const hasCredit = rows.some((r) => r.method === "credit");
  const creditRows = rows.filter((r) => r.method === "credit").length;
  const nonCredit = paid - onKhata;
  const remaining = scaled(total) - nonCredit;
  const overLimit =
    hasCredit && !!credit && !invalid && onKhata > scaled(credit.available);
  const reasonOk =
    override.trim().length >= 5 && override.trim().length <= 500;
  const creditProblem = !hasCredit
    ? ""
    : !online || !credit
      ? "Credit sales need a connection."
      : creditRows > 1
        ? "Use a single credit (khata) line."
        : !invalid && onKhata <= 0n
          ? "Enter the amount to put on the khata."
          : !invalid && change > 0n
            ? "Credit never gives change. Lower the credit or the other amounts so they add up to the total exactly."
            : overLimit && !credit.canOverride
              ? `Over the credit limit. Available credit: ${currency} ${credit.available}. Ask a manager to raise the limit.`
              : "";
  const blocked = !!creditProblem || (overLimit && !reasonOk);
  const putOnKhata = (amount: bigint) =>
    setRows((items) => [
      ...(amount === scaled(total)
        ? []
        : items.filter((r) => r.method !== "credit")),
      { method: "credit", amount: formatted(amount) },
    ]);
  const update = (
    index: number,
    patch: Partial<SalePayload["payments"][number]>,
  ) =>
    setRows((items) =>
      items.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(rows, overLimit ? override.trim() : undefined);
      }}
    >
      <div className="payment-amount">
        {currency} {total}
      </div>
      <ErrorBox error={error} />
      {rows.map((row, i) => (
        <div className="tender-row" key={i}>
          <div className="form-grid">
            <label>
              Payment method
              <select
                aria-label={`Payment method ${i + 1}`}
                value={row.method}
                disabled={!online}
                onChange={(e) =>
                  update(i, { method: e.target.value as typeof row.method })
                }
              >
                <option value="cash">Cash received</option>
                <option value="external_card">
                  External card terminal (manual record)
                </option>
                <option value="bank_transfer">
                  Bank transfer (manual record)
                </option>
                {(credit || row.method === "credit") && (
                  <option
                    value="credit"
                    disabled={!credit || (row.method !== "credit" && hasCredit)}
                  >
                    Credit (khata)
                  </option>
                )}
              </select>
            </label>
            <label>
              {row.method === "credit" ? "Amount on khata" : "Amount received"}
              <input
                aria-label={
                  row.method === "credit"
                    ? `Amount on khata ${i + 1}`
                    : `Amount received ${i + 1}`
                }
                autoFocus={i === 0}
                required
                inputMode="decimal"
                value={row.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
              />
            </label>
          </div>
          {row.method !== "cash" && row.method !== "credit" && (
            <label>
              External transaction reference
              <input
                aria-label={`Transaction reference ${i + 1}`}
                required
                maxLength={120}
                value={row.reference ?? ""}
                onChange={(e) => update(i, { reference: e.target.value })}
              />
              <small className="muted">
                Confirm the transaction on the actual terminal or bank account.
                Tech POS is recording it, not authorizing it.
              </small>
            </label>
          )}
          {rows.length > 1 && (
            <button
              type="button"
              className="text-button danger-text"
              onClick={() =>
                setRows((items) => items.filter((_, j) => j !== i))
              }
            >
              Remove payment
            </button>
          )}
        </div>
      ))}
      {rows.length === 1 && rows[0].method === "cash" && (
        <div className="denominations">
          {["100", "500", "1000", "5000"].map((amount) => (
            <button
              type="button"
              key={amount}
              className="button secondary"
              onClick={() => update(0, { amount: amount + ".00" })}
            >
              {amount}
            </button>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() => update(0, { amount: total })}
          >
            Exact amount
          </button>
        </div>
      )}
      <button
        type="button"
        className="text-button mt"
        disabled={!online || rows.length >= 10}
        onClick={() =>
          setRows((items) => [
            ...items,
            {
              method: "external_card",
              amount: change < 0n ? formatted(-change) : "0.00",
              reference: "",
            },
          ])
        }
      >
        + Split payment
      </button>
      {credit && (
        <div className="credit-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => putOnKhata(scaled(total))}
          >
            Full amount on khata
          </button>
          {!invalid && nonCredit > 0n && remaining > 0n && remaining !== onKhata && (
            <button
              type="button"
              className="text-button"
              onClick={() => putOnKhata(remaining)}
            >
              Rest on khata ({formatted(remaining)})
            </button>
          )}
          <small className="muted">
            Khata {credit.balance} · available {currency} {credit.available}
          </small>
        </div>
      )}
      {!credit && creditNote && !hasCredit && (
        <p className="muted credit-note">{creditNote}</p>
      )}
      {creditProblem && (
        <div className="alert error compact" role="alert">
          {creditProblem}
        </div>
      )}
      {!creditProblem && overLimit && credit && (
        <div className="alert warn compact" role="status">
          <span>
            Over the credit limit by {currency}{" "}
            {formatted(onKhata - scaled(credit.available))}. Available credit:{" "}
            {currency} {credit.available}. As a credit manager you can approve
            it with a reason; the approval is audited.
          </span>
        </div>
      )}
      {!creditProblem && overLimit && credit?.canOverride && (
        <label>
          Override reason (5–500 characters)
          <textarea
            required
            minLength={5}
            maxLength={500}
            rows={2}
            value={override}
            onChange={(e) => setOverride(e.target.value)}
          />
        </label>
      )}
      <div className="payment-amount" role="status" aria-live="polite">
        <span>
          {change < 0n
            ? "Still due"
            : hasCredit
              ? "Change due (cash only)"
              : "Change due"}
        </span>
        <strong>{formatted(change < 0n ? -change : change)}</strong>
      </div>
      <button
        className="button full pay-button"
        disabled={busy || invalid || change < 0n || blocked}
      >
        {busy
          ? hasCredit
            ? "Saving credit sale…"
            : "Saving securely…"
          : "Complete sale"}
      </button>
    </form>
  );
}
function CustomerLookup({
  branch,
  online,
  showCredit,
  onChoose,
}: {
  branch: string;
  online: boolean;
  showCredit: boolean;
  onChoose: (c: Customer | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const customers = useQuery({
    queryKey: ["pos-customers", branch, term],
    queryFn: () =>
      ops<Page<Customer>>("customers?" + query({ branch, q: term })),
    enabled: online,
  });
  return (
    <>
      <button className="button secondary full" onClick={() => onChoose(null)}>
        Continue as walk-in
      </button>
      {online ? (
        <>
          <label>
            Customer name, phone or email
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <ErrorBox error={customers.error} />
          {customers.isPending ? (
            <Loading />
          ) : !customers.data?.data.length ? (
            <p className="empty">
              No matching customers. Profiles can be added from Customers.
            </p>
          ) : (
            customers.data.data.map((c) => {
              const khata = creditState(c);
              return (
                <button
                  className="list-row customer-result"
                  key={c.public_id}
                  onClick={() => onChoose(c)}
                >
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.phone ?? c.email ?? c.price_tier}</small>
                    {showCredit && khata.enabled && (
                      <small>
                        Khata {formatted(khata.balance)} · available{" "}
                        {formatted(khata.available)}
                      </small>
                    )}
                  </div>
                  <span className="neutral-pill">{c.price_tier}</span>
                </button>
              );
            })
          )}
        </>
      ) : (
        <p className="muted mt">
          Offline lookup does not cache customer personal information in this
          milestone. Use walk-in checkout or a customer already attached to your
          saved cart.
        </p>
      )}
    </>
  );
}
function HeldCarts({
  branch,
  tenant,
  user,
  mode,
  cart,
  customer,
  discount,
  online,
  onHold,
  onResume,
}: {
  branch: string;
  tenant: string;
  user: string;
  mode: "hold" | "list";
  cart: CartLine[];
  customer: Customer | null;
  discount: string;
  online: boolean;
  onHold: () => void;
  onResume: (
    lines: CartLine[],
    customer: Customer | null,
    discount: string,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<
    {
      key: string;
      name?: string;
      lines: CartLine[];
      customer: Customer | null;
      discount: string;
    }[]
  >([]);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const db = businessStore(tenant, user);
    db.carts
      .toArray()
      .then((rows) =>
        setItems(rows.filter((r) => r.key.startsWith(`held:${branch}:`))),
      )
      .catch(setError)
      .finally(() => db.close());
  }, [tenant, user, branch]);
  async function hold() {
    setBusy(true);
    try {
      let id: string = crypto.randomUUID();
      if (online) {
        const saved = await ops<{ public_id: string }>(
          "held-sales",
          json("POST", {
            branch,
            name: name || "Held sale",
            payload: {
              lines: cart.map((l) => ({
                product: l.product.public_id,
                quantity: wireDecimal(
                  l.quantity,
                  3,
                  7,
                  `Quantity for ${l.product.name}`,
                ),
                discount: wireDecimal(
                  l.discount,
                  2,
                  10,
                  `Discount for ${l.product.name}`,
                ),
              })),
              customer: customer?.public_id ?? null,
              cart_discount: wireDecimal(discount, 2, 10, "Cart discount"),
            },
          }),
        );
        id = saved.public_id;
      }
      const db = businessStore(tenant, user);
      try {
        await db.carts.put({
          key: `held:${branch}:${id}`,
          name: name || "Held sale",
          lines: cart,
          customer,
          discount,
          updatedAt: new Date().toISOString(),
        });
      } finally {
        db.close();
      }
      onHold();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function resume(item: (typeof items)[number]) {
    if (cart.length) {
      setError(
        new Error("Hold or clear the current cart before resuming another."),
      );
      return;
    }
    setBusy(true);
    try {
      onResume(item.lines, item.customer, item.discount);
      const db = businessStore(tenant, user);
      try {
        await db.carts.delete(item.key);
      } finally {
        db.close();
      }
      if (online)
        await ops(`held-sales/${item.key.split(":").at(-1)}`, {
          method: "DELETE",
        }).catch(() => {});
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ErrorBox error={error} />
      {mode === "hold" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            hold();
          }}
        >
          <label>
            Cart label
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer or counter reference"
              maxLength={100}
            />
          </label>
          <p className="muted">
            {cart.length} items. Saved on this device
            {online ? " and as your server draft" : ""}.
          </p>
          <button className="button full mt" disabled={busy || !cart.length}>
            Hold cart
          </button>
        </form>
      ) : items.length ? (
        items.map((item) => (
          <div className="list-row" key={item.key}>
            <div>
              <strong>{item.name ?? "Held sale"}</strong>
              <small>{item.lines.length} items · this device</small>
            </div>
            <button
              className="button secondary"
              disabled={busy || !!cart.length}
              onClick={() => resume(item)}
            >
              Resume
            </button>
          </div>
        ))
      ) : (
        <p className="empty">No held carts on this device for this branch.</p>
      )}
    </>
  );
}
function Calculator() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [operation, setOperation] = useState("+");
  let result = "—";
  try {
    const x = scaled(a);
    const y = scaled(b);
    if (operation === "÷" && y === 0n)
      throw new Error("Cannot divide by zero.");
    result = formatted(
      operation === "+"
        ? x + y
        : operation === "-"
          ? x - y
          : operation === "×"
            ? (x * y) / 100n
            : y
              ? (x * 100n) / y
              : 0n,
    );
  } catch (e) {
    result = e instanceof Error ? e.message : "Invalid amount.";
  }
  return (
    <>
      <label>
        First amount
        <input
          inputMode="decimal"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
      </label>
      <label>
        Operation
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
        >
          {["+", "-", "×", "÷"].map((op) => (
            <option key={op}>{op}</option>
          ))}
        </select>
      </label>
      <label>
        Second amount
        <input
          inputMode="decimal"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
      </label>
      <p className="payment-amount" role="status">
        {result}
      </p>
    </>
  );
}
function ShortcutEditor({
  value,
  onSave,
}: {
  value: ShortcutMap;
  onSave: (v: ShortcutMap) => void;
}) {
  const [draft, setDraft] = useState(value);
  const error = validShortcuts(draft);
  return (
    <details className="mt">
      <summary>Customize shortcuts</summary>
      {(Object.entries(draft) as [ShortcutAction, string][]).map(
        ([action, key]) => (
          <label key={action}>
            {shortcutLabels[action]}
            <input
              value={key}
              onChange={(e) => setDraft({ ...draft, [action]: e.target.value })}
            />
          </label>
        ),
      )}
      <ErrorBox error={error ? new Error(error) : null} />
      <button
        className="button secondary full mt"
        disabled={!!error}
        onClick={() => onSave(draft)}
      >
        Save shortcut mapping
      </button>
    </details>
  );
}
function Walkthrough({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    [
      "Scan without clicking",
      "Keep focus in the barcode field. Press Enter after a USB scanner scan. Text searches update after a short pause.",
    ],
    [
      "Keep the cart clear",
      "Adjust quantities or permitted discounts. Hold a cart before serving another customer. Held carts do not reserve stock.",
    ],
    [
      "Receive payment deliberately",
      "Open a shift, enter cash received, check change, then complete once. Manual card or bank records require an external reference.",
    ],
    [
      "Watch connection and sync",
      "Prepare the catalog online. Offline cash receipts stay local until the server accepts them. Pending records block sign-out to prevent loss.",
    ],
  ];
  return (
    <>
      <p className="eyebrow">
        {step + 1} OF {steps.length}
      </p>
      <h3>{steps[step][0]}</h3>
      <p className="muted mt">{steps[step][1]}</p>
      <div className="row between mt">
        <button className="text-button" onClick={onDone}>
          Skip walkthrough
        </button>
        <button
          className="button"
          onClick={() =>
            step === steps.length - 1 ? onDone() : setStep(step + 1)
          }
        >
          {step === steps.length - 1 ? "Ready to begin" : "Next tip"}
        </button>
      </div>
    </>
  );
}
function ShiftForm({
  setup,
  branch,
  online,
  pending,
  onSaved,
}: {
  setup: OpsSetup;
  branch: string;
  online: boolean;
  pending: number;
  onSaved: () => void;
}) {
  const [register, setRegister] = useState(
    setup.registers.find((r) => r.branch === branch)?.public_id ?? "",
  );
  const [amount, setAmount] = useState("0.00");
  const [type, setType] = useState("cash_in");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<"cash" | "close">("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [key] = useState(crypto.randomUUID());
  const shift = setup.shift?.branch === branch ? setup.shift : null;
  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      if (!online)
        throw new Error(
          "Register opening, cash movements and shift closing need a connection.",
        );
      if (!shift)
        await ops(
          "shifts",
          json("POST", {
            branch,
            register,
            opening_float: amount,
            idempotency_key: key,
          }),
        );
      else if (action === "close") {
        if (pending)
          throw new Error(
            "Synchronize all pending transactions before closing this shift.",
          );
        await ops(
          `shifts/${shift.public_id}/close`,
          json("POST", {
            actual_cash: amount,
            idempotency_key: key,
            note: reason,
          }),
        );
      } else
        await ops(
          `shifts/${shift.public_id}/cash-events`,
          json("POST", { amount, type, reason, idempotency_key: key }),
        );
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ErrorBox error={error} />
      {shift ? (
        <>
          <p className="muted">
            Opening float: {shift.opening_float}
            <br />
            Expected cash: {shift.expected_cash}
          </p>
          <label>
            Action
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value as typeof action);
                setAmount("0.00");
              }}
            >
              <option value="cash">Record cash movement</option>
              <option value="close">Close and reconcile shift</option>
            </select>
          </label>
          {action === "cash" && (
            <label>
              Movement
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="cash_in">Cash in</option>
                <option value="cash_out">Cash out</option>
                <option value="cash_expense">Cash expense</option>
              </select>
            </label>
          )}
        </>
      ) : (
        <label>
          Register
          <select
            value={register}
            onChange={(e) => setRegister(e.target.value)}
          >
            {setup.registers
              .filter((r) => r.branch === branch)
              .map((r) => (
                <option key={r.public_id} value={r.public_id}>
                  {r.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        {!shift
          ? "Opening float"
          : action === "close"
            ? "Actual counted cash"
            : "Cash amount"}
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {shift && (
        <label>
          {action === "close" ? "Closing note" : "Reason"}
          <input
            value={reason}
            required={action === "cash"}
            minLength={action === "cash" ? 3 : 0}
            maxLength={255}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}
      <button
        className="button full mt"
        disabled={busy || !online || (!shift && !register)}
      >
        {!shift
          ? "Open shift"
          : action === "close"
            ? "Close shift"
            : "Record cash movement"}
      </button>
    </form>
  );
}
