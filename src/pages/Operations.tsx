import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, Download, Printer } from "lucide-react";
import { useWorkspace } from "../App";
import { useOperations } from "../hooks/useOperations";
import { businessStore } from "../lib/offline";
import type { LocalReceipt } from "../lib/offline";
import { ops, query } from "../lib/operations";
import type { Page, Customer } from "../lib/operations";
import { json } from "../lib/api";
import { retryAttention, syncSales } from "../lib/posStorage";
import { encryptRecovery, importRecovery } from "../lib/recovery";
import { printElement } from "../lib/printing";
import { Receipt } from "../components/Receipt";
import { OperationLocation } from "../components/OperationLocation";
import { ErrorBox, Loading, Modal, PageTitle } from "../components/ui";

export function CustomersPage() {
  const o = useOperations();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: [
      "customers",
      o.business.tenant.public_id,
      o.branch,
      searchTerm,
      page,
    ],
    queryFn: ({ signal }) =>
      ops<Page<Customer>>(
        "customers?" + query({ branch: o.branch, q: searchTerm, page }),
        { signal },
      ),
    enabled: o.ready,
  });
  const save = useMutation({
    mutationFn: (body: unknown) => ops("customers", json("POST", body)),
    onSuccess: () => {
      setOpen(false);
      client.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  if (o.setup.error) return <ErrorBox error={o.setup.error} />;
  if (o.setup.isPending) return <Loading />;
  return (
    <>
      <PageTitle
        title="People behind each purchase."
        description="Keep a useful customer directory. Walk-in checkout always remains available."
        action={
          o.permissions.includes("customers.manage") ? (
            <button className="button" onClick={() => setOpen(true)}>
              <Plus size={17} />
              Add customer
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
      <label className="mt">
        Search customers
        <input
          placeholder="Name, phone or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <ErrorBox error={list.error} />
      <section className="panel">
        {list.isPending ? (
          <Loading />
        ) : !list.data?.data.length ? (
          <div className="empty">
            <h3>No customers found.</h3>
            <p>
              Add a profile when it helps your business. Marketing consent is
              optional.
            </p>
          </div>
        ) : (
          <>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Price tier</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((c) => (
                    <tr key={c.public_id}>
                      <td>{c.name}</td>
                      <td>{c.phone ?? "—"}</td>
                      <td>{c.email ?? "—"}</td>
                      <td>{c.price_tier}</td>
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
                Page {page} of {list.data.last_page}
              </span>
              <button
                className="button secondary"
                disabled={page >= list.data.last_page}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add a customer"
        description="Collect only the details your business needs."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate({
              branch: o.branch,
              name: f.get("name"),
              phone: f.get("phone") || null,
              email: f.get("email") || null,
              address: f.get("address") || null,
              price_tier: f.get("price_tier"),
              marketing_consent: f.get("marketing_consent") === "on",
            });
          }}
        >
          <ErrorBox error={save.error} />
          <label>
            Name
            <input name="name" required maxLength={150} />
          </label>
          <label>
            Phone
            <input name="phone" type="tel" maxLength={40} />
          </label>
          <label>
            Email
            <input name="email" type="email" maxLength={254} />
          </label>
          <label>
            Address
            <input name="address" maxLength={255} />
          </label>
          <label>
            Price tier
            <select name="price_tier">
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </label>
          <label className="check-label">
            <input type="checkbox" name="marketing_consent" />
            Customer agreed to marketing contact
          </label>
          <button className="button full mt" disabled={save.isPending}>
            Save customer
          </button>
        </form>
      </Modal>
    </>
  );
}

export function SyncPage() {
  const client = useQueryClient();
  const { business, me } = useWorkspace();
  const tenant = business.tenant.public_id;
  const user = me.user.public_id;
  const [rows, setRows] = useState<LocalReceipt[]>([]);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<LocalReceipt | null>(null);
  const [recovery, setRecovery] = useState<"export" | "import" | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  async function load() {
    const db = businessStore(tenant, user);
    try {
      const [receipts, queue] = await Promise.all([
        db.receipts.orderBy("createdAt").reverse().limit(200).toArray(),
        db.outbox.toArray(),
      ]);
      setRows(receipts);
      setIssues(
        Object.fromEntries(queue.map((q) => [q.id, q.error ?? q.status])),
      );
    } catch (e) {
      setError(e);
    } finally {
      db.close();
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [tenant, user]);
  async function sync(id?: string) {
    setBusy(true);
    setError(undefined);
    try {
      if (!navigator.onLine) throw new Error("Connect before synchronizing.");
      if (id) await retryAttention(tenant, user, id);
      else await syncSales(tenant, user, true);
      await load();
      await client.invalidateQueries({ queryKey: ["operations-bootstrap"] });
      await client.invalidateQueries({ queryKey: ["pos-products"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function exportJournal() {
    setRecovery("export");
  }
  return (
    <>
      <PageTitle
        title="Every sale accounted for."
        description="Local receipts stay on this device until accepted. Failed records retain their original identity and payload."
        action={
          <div className="row">
            <button className="button secondary" onClick={exportJournal}>
              <Download size={16} />
              Export pending journal
            </button>
            <button
              className="button secondary"
              onClick={() => setRecovery("import")}
            >
              Restore recovery file
            </button>
            <button className="button" disabled={busy} onClick={() => sync()}>
              <RefreshCw size={16} />
              Synchronize
            </button>
          </div>
        }
      />
      <ErrorBox error={error} />
      <div className="alert">
        Do not clear browser data or lose this device while transactions are
        pending. An export is a sensitive recovery record; keep it private.
        Price, stock, permission or closed-shift conflicts require an owner’s
        review. Retry resends the unchanged transaction and cannot override
        server rules.
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Local receipts · {Object.keys(issues).length} pending</h2>
          <Link to="/pos" className="text-button">
            Return to cashier
          </Link>
        </div>
        {!rows.length ? (
          <div className="empty">
            <h3>No local receipts yet.</h3>
            <p>Cashier receipts saved on this device will appear here.</p>
          </div>
        ) : (
          rows.map((r) => (
            <div className="list-row sync-row" key={r.id}>
              <div>
                <strong>{r.document.receipt_number}</strong>
                <small>
                  {r.document.currency} {r.document.total} ·{" "}
                  {new Date(r.createdAt).toLocaleString()}
                </small>
                {issues[r.id] && <p className="danger-text">{issues[r.id]}</p>}
              </div>
              <span className="neutral-pill">
                {r.status === "synced"
                  ? "Accepted"
                  : r.status === "attention"
                    ? "Requires attention"
                    : "Pending"}
              </span>
              <button className="text-button" onClick={() => setSelected(r)}>
                View receipt
              </button>
              {r.status !== "synced" && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => sync(r.id)}
                >
                  Retry unchanged
                </button>
              )}
            </div>
          ))
        )}
      </section>
      <Modal
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
        title="Local receipt"
        description="Pending receipts are provisional until the server accepts them."
      >
        {selected && (
          <>
            <Receipt
              ref={receiptRef}
              sale={selected.document}
              pending={selected.status !== "synced"}
            />
            <button
              className="button secondary full mt"
              onClick={() => {
                try {
                  printElement(receiptRef.current, "80");
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <Printer size={16} />
              Print receipt
            </button>
          </>
        )}
      </Modal>
      <Modal
        open={!!recovery}
        onOpenChange={(v) => {
          if (!v) setRecovery(null);
        }}
        title={
          recovery === "export"
            ? "Encrypted recovery backup"
            : "Restore original transactions"
        }
        description="Keep the passphrase separately. Recovery never changes the original sale identity or grants server access."
      >
        {recovery && (
          <RecoveryForm
            key={recovery}
            mode={recovery}
            tenant={tenant}
            user={user}
            onSaved={async () => {
              setRecovery(null);
              await load();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function RecoveryForm({
  mode,
  tenant,
  user,
  onSaved,
}: {
  mode: "export" | "import";
  tenant: string;
  user: string;
  onSaved: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      if (mode === "export") {
        if (passphrase !== confirm)
          throw new Error("Recovery passphrases do not match.");
        const data = await encryptRecovery(tenant, user, passphrase);
        const url = URL.createObjectURL(
          new Blob([data], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `techpos-recovery-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setPassphrase("");
        setConfirm("");
        onSaved();
      } else {
        if (!file || file.size > 16 * 1024 * 1024)
          throw new Error("Choose an encrypted recovery file up to 16 MB.");
        const result = await importRecovery(
          await file.text(),
          tenant,
          user,
          passphrase,
        );
        setPassphrase("");
        setMessage(
          `${result.imported} original transactions restored; ${result.duplicates} already present. Review and synchronize them to obtain server acceptance.`,
        );
      }
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
      {mode === "import" && (
        <label>
          Encrypted recovery file
          <input
            type="file"
            accept="application/json,.json"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
      <label>
        Recovery passphrase
        <input
          type="password"
          autoComplete="off"
          minLength={12}
          maxLength={1000}
          required
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </label>
      {mode === "export" && (
        <label>
          Confirm recovery passphrase
          <input
            type="password"
            autoComplete="off"
            minLength={12}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
      )}
      <p className="muted mt">
        AES-GCM encrypted backup, unlocked only in this browser. A forgotten
        passphrase cannot be recovered. Original device authorization and
        cashier/branch permissions still apply at sync. Restoring does not
        reprice, approve or erase conflicts. The local database itself is not
        encrypted by this export.
      </p>
      {message && (
        <div role="status" className="alert mt">
          {message}
        </div>
      )}
      <div className="row mt">
        <button className="button" disabled={busy}>
          {busy
            ? "Processing…"
            : mode === "export"
              ? "Download encrypted backup"
              : "Import original records"}
        </button>
        {message && (
          <button type="button" className="button secondary" onClick={onSaved}>
            Done
          </button>
        )}
      </div>
    </form>
  );
}
