import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  LockKeyhole,
  Search,
  Settings2,
  Upload,
} from "lucide-react";
import { api, json, useClient } from "../lib/api";
import type { Module } from "../lib/types";
import { useWorkspace } from "../App";
import { ErrorBox, Loading, PageTitle, Modal } from "../components/ui";
export { OnboardingPage } from "./Onboarding";
export function ModulesPage() {
  return (
    <>
      <PageTitle
        title="A workspace that works your way."
        description="Choose your modules. Keep your history. Grow at your own pace."
      />
      <ModulesContent />
    </>
  );
}
export function ModulesContent({ recommended }: { recommended?: string[] }) {
  const { business } = useWorkspace();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [confirm, setConfirm] = useState<Module | null>(null);
  const [search, setSearch] = useState("");
  const modules = useQuery({
    queryKey: ["modules", business.tenant.public_id],
    queryFn: () => api<Module[]>("modules"),
  });
  const toggle = useMutation({
    mutationFn: (m: Module) =>
      api(`modules/${m.key}`, json("PUT", { enabled: !m.enabled })),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["modules"] });
      setConfirm(null);
      notify("Module preference saved.");
    },
  });
  if (modules.isPending) return <Loading />;
  if (modules.error) return <ErrorBox error={modules.error} />;
  const list =
    modules.data
      ?.filter((m) => !recommended || recommended.includes(m.key))
      .filter((m) =>
        `${m.name} ${m.category}`.toLowerCase().includes(search.toLowerCase()),
      ) ?? [];
  return (
    <>
      <div className="input-icon search-input">
        <Search size={18} />
        <input
          placeholder="Find a module…"
          aria-label="Search modules"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorBox error={toggle.error} />
      {[...new Set(list.map((m) => m.category))].map((category) => (
        <section key={category} className="module-category">
          <h3>{category}</h3>
          <div className="cards-grid">
            {list
              .filter((m) => m.category === category)
              .map((m) => (
                <article className="module-card" key={m.key}>
                  <div className="row between">
                    <span
                      className={`module-icon ${m.included ? "" : "locked"}`}
                    >
                      {m.included ? (
                        <Settings2 size={20} />
                      ) : (
                        <LockKeyhole size={20} />
                      )}
                    </span>
                    <span
                      className={m.enabled ? "status-pill" : "neutral-pill"}
                    >
                      {m.enabled
                        ? "Enabled"
                        : m.included
                          ? "Included"
                          : "Available on upgrade"}
                    </span>
                  </div>
                  <h3>{m.name}</h3>
                  {m.availability === "planned" && (
                    <p className="module-roadmap-note">
                      Workflow in development. This setting saves a preference;
                      it does not unlock a working screen.
                    </p>
                  )}
                  {m.availability === "partial" && (
                    <p className="module-roadmap-note">
                      Some workflows are available. Additional capabilities are
                      still in development.
                    </p>
                  )}
                  {m.requires_configuration && (
                    <p className="muted">Requires configuration</p>
                  )}
                  {!!m.dependencies.length && (
                    <small className="muted">
                      Depends on {m.dependencies.join(", ")}
                    </small>
                  )}
                  <div className="module-action">
                    {m.included ? (
                      <button
                        className="text-button"
                        disabled={
                          toggle.isPending ||
                          !business.permissions.includes("modules.manage")
                        }
                        onClick={() =>
                          m.enabled ? setConfirm(m) : toggle.mutate(m)
                        }
                      >
                        {m.enabled ? "Disable module" : "Enable module"}
                      </button>
                    ) : (
                      <Link to="/subscription">
                        Compare plans
                        <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
      {!list.length && <p className="empty">No matching modules.</p>}
      <Modal
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
        title={`Disable ${confirm?.name ?? "module"}?`}
        description="Historical records will stay safe. Dependent modules must be disabled first."
      >
        <ErrorBox error={toggle.error} />
        <button
          className="button mt"
          disabled={toggle.isPending}
          onClick={() => confirm && toggle.mutate(confirm)}
        >
          Disable module
        </button>
      </Modal>
    </>
  );
}
const languages = {
  en: "English",
  ur: "اردو",
  "ur-Latn": "Roman Urdu",
  ar: "العربية",
  hi: "हिन्दी",
};
type Labels = {
  locale: string;
  direction: "rtl" | "ltr";
  labels: {
    key: string;
    section: string;
    default: string;
    value: string;
    override: string | null;
  }[];
};
export function LabelsPage() {
  const { business } = useWorkspace();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [locale, setLocale] = useState("en");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [section, setSection] = useState("");
  const [resetSection, setResetSection] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const labels = useQuery({
    queryKey: ["labels", business.tenant.public_id, locale],
    queryFn: () => api<Labels>(`labels?locale=${locale}`),
  });
  const reset = useMutation({
    mutationFn: () =>
      api("labels/reset", json("POST", { locale, section: resetSection })),
    onSuccess: () => {
      const keys = new Set(
        labels.data?.labels
          .filter((l) => l.section === resetSection)
          .map((l) => l.key),
      );
      setEdits((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([key]) => !keys.has(key)),
        ),
      );
      setResetSection("");
      void client.invalidateQueries({ queryKey: ["labels"] });
      notify("Section restored to its default wording.");
    },
  });
  async function save(data = edits) {
    setBusy(true);
    setError(undefined);
    try {
      await api("labels", json("PUT", { locale, labels: data }));
      setEdits({});
      await client.invalidateQueries({ queryKey: ["labels"] });
      notify("Labels saved.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function exportLabels() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            locale,
            labels: Object.fromEntries(
              labels.data?.labels.map((l) => [
                l.key,
                edits[l.key] ?? l.override,
              ]) ?? [],
            ),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `techpos-labels-${locale}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importLabels(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100000) throw new Error("Use a label file under 100 KB.");
      const data = JSON.parse(await file.text());
      if (data.locale !== locale)
        throw new Error(
          "Select the language matching the imported file first.",
        );
      if (!data.labels || typeof data.labels !== "object")
        throw new Error("Invalid label export.");
      await save(data.labels);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <>
      <PageTitle
        title="Your business. Your words."
        description="Make everyday labels familiar, in the language you use."
        action={
          <button
            className="button"
            disabled={busy || !Object.keys(edits).length}
            onClick={() => save()}
          >
            Save changes
          </button>
        }
      />
      <div className="toolbar">
        <select
          aria-label="Label language"
          value={locale}
          onChange={(e) => {
            setLocale(e.target.value);
            setEdits({});
          }}
        >
          {Object.entries(languages).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="input-icon">
          <Search size={17} />
          <input
            placeholder="Search labels…"
            aria-label="Search labels"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Label section"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="">All sections</option>
          {Array.from(new Set(labels.data?.labels.map((l) => l.section))).map(
            (s) => (
              <option key={s} value={s}>
                {s === "navigation"
                  ? "Navigation"
                  : s === "actions"
                    ? "Actions"
                    : s}
              </option>
            ),
          )}
        </select>
        <button
          className="button secondary"
          disabled={
            !section || busy || !business.permissions.includes("labels.manage")
          }
          onClick={() => setResetSection(section)}
        >
          Restore section
        </button>
        <button className="button secondary" onClick={exportLabels}>
          <Download size={16} />
          Export
        </button>
        <label className="button secondary file-button">
          <Upload size={16} />
          Import
          <input
            type="file"
            accept="application/json"
            onChange={(e) => importLabels(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="muted">
        Initial dictionaries use reviewed English fallbacks. You can supply your
        own language overrides.
      </p>
      <ErrorBox error={error ?? labels.error} />
      {labels.isPending ? (
        <Loading />
      ) : (
        <section className="panel">
          <div className="labels-table">
            <div className="label-row table-head">
              <span>System label</span>
              <span>Your wording</span>
              <span>Preview</span>
            </div>
            {labels.data?.labels
              .filter((l) => !section || l.section === section)
              .filter((l) =>
                `${l.key} ${l.default}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((l) => (
                <div className="label-row" key={l.key}>
                  <div>
                    <strong>{l.default}</strong>
                    <small>
                      {l.section} / {l.key}
                    </small>
                  </div>
                  <div className="row">
                    <input
                      aria-label={`Wording for ${l.default}`}
                      dir={labels.data.direction}
                      value={
                        edits[l.key] === null
                          ? l.default
                          : (edits[l.key] ?? l.value)
                      }
                      onChange={(e) =>
                        setEdits({ ...edits, [l.key]: e.target.value })
                      }
                    />
                    <button
                      className="text-button"
                      onClick={() => setEdits({ ...edits, [l.key]: null })}
                    >
                      Restore
                    </button>
                  </div>
                  <span dir={labels.data?.direction}>
                    {edits[l.key] === null
                      ? l.default
                      : (edits[l.key] ?? l.value)}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
      <Modal
        open={!!resetSection}
        onOpenChange={(open) => {
          if (!open) setResetSection("");
        }}
        title="Restore this section?"
        description={`Remove all ${resetSection} overrides in ${languages[locale as keyof typeof languages]}. Other languages and sections stay as they are.`}
      >
        <p>
          Saved and unsaved wording in this section will return to the default.
          Export your overrides first if you want a copy.
        </p>
        <ErrorBox error={reset.error} />
        <div className="row mt">
          <button
            className="button secondary"
            disabled={reset.isPending}
            onClick={() => setResetSection("")}
          >
            Keep my wording
          </button>
          <button
            className="button"
            disabled={reset.isPending}
            onClick={() => reset.mutate()}
          >
            Restore default wording
          </button>
        </div>
      </Modal>
    </>
  );
}
type Role = { public_id: string; name: string; permissions: string[] };
type Permission = {
  key: string;
  module: string;
  name: string;
  description: string;
};
type RoleData = {
  roles: Role[];
  permissions: Permission[];
  templates: Record<string, string[]>;
};
export function RolesPage() {
  const { business } = useWorkspace();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const data = useQuery({
    queryKey: ["roles", business.tenant.public_id],
    queryFn: () => api<RoleData>("roles"),
  });
  const save = useMutation({
    mutationFn: () =>
      api(
        role ? `roles/${role.public_id}` : "roles",
        json(role ? "PUT" : "POST", { name, permissions: selected }),
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["roles"] });
      setEditing(false);
      notify("Role saved.");
    },
  });
  function edit(r: Role | null, duplicate = false) {
    setRole(duplicate ? null : r);
    setName(r ? `${r.name}${duplicate ? " copy" : ""}` : "");
    setSelected(r?.permissions ?? []);
    setEditing(true);
    save.reset();
  }
  if (data.isPending) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} />;
  const permissions =
    data.data?.permissions.filter((p) =>
      `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageTitle
        title="The right access. For everyone."
        description="Simple roles help your team work with confidence."
        action={
          <button className="button" onClick={() => edit(null)}>
            Create role
          </button>
        }
      />
      <div className="alert">
        <ShieldNote />
        Owner access is managed through business ownership. Custom roles never
        grant platform administration.
      </div>
      <div className="cards-grid">
        {data.data?.roles.map((r) => (
          <article key={r.public_id} className="panel">
            <h3>{r.name}</h3>
            <p className="muted">{r.permissions.length} permissions</p>
            <div className="row">
              <button className="button secondary" onClick={() => edit(r)}>
                Edit permissions
              </button>
              <button
                className="icon-button"
                aria-label={`Duplicate ${r.name}`}
                onClick={() => edit(r, true)}
              >
                <Copy size={18} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <Modal
        open={editing}
        onOpenChange={setEditing}
        title={role ? "Edit role" : "Create a role"}
        description="Search actions or use a template. Changes apply to members assigned this role."
      >
        <ErrorBox error={save.error} />
        <label>
          Role name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label>
          Start from a template
          <select
            defaultValue=""
            onChange={(e) => {
              if (data.data?.templates[e.target.value])
                setSelected(data.data.templates[e.target.value]);
            }}
          >
            <option value="">Choose a role template</option>
            {Object.keys(data.data?.templates ?? {}).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <input
          aria-label="Search permissions"
          placeholder="Search permissions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="permission-list">
          {[...new Set(permissions.map((p) => p.module))].map((module) => {
            const group = permissions.filter((p) => p.module === module);
            return (
              <fieldset key={module}>
                <legend>{module}</legend>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={group.every((p) => selected.includes(p.key))}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [
                              ...new Set([
                                ...selected,
                                ...group.map((p) => p.key),
                              ]),
                            ]
                          : selected.filter(
                              (k) => !group.some((p) => p.key === k),
                            ),
                      )
                    }
                  />
                  Select group
                </label>
                {group.map((p) => (
                  <label className="permission-check" key={p.key}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p.key)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, p.key]
                            : selected.filter((k) => k !== p.key),
                        )
                      }
                    />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
        <p className="muted">
          Effective role grants: {selected.length} actions. Branch restrictions
          apply when the role is assigned.
        </p>
        <button
          className="button full"
          disabled={!name || save.isPending}
          onClick={() => save.mutate()}
        >
          Save role
        </button>
      </Modal>
    </>
  );
}
function ShieldNote() {
  return <CheckCircle2 size={20} />;
}
