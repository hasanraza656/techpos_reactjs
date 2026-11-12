import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json, useClient } from "../../lib/api";
import { ErrorBox, Modal } from "../../components/ui";
import type { Row, Action, Field } from "./shared";
import { value } from "./shared";
export function ActionDialog({
  action,
  close,
}: {
  action: Action;
  close: () => void;
}) {
  const [values, setValues] = useState<Row>(action.initial ?? {});
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState(action.reason ?? "");
  const [requestKey] = useState(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [search, setSearch] = useState("");
  const cache = useQueryClient();
  const notify = useClient((s) => s.notify);
  const staffRoles = useQuery({
    queryKey: ["platform-assignment-roles"],
    queryFn: () => api<{ roles: Row[] }>("platform/roles"),
    enabled: action.fields.some((f) => f.type === "role-list"),
  });
  function set(k: string, v: unknown) {
    setValues((old) => ({ ...old, [k]: v }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const body: Row = {};
      Object.entries(values).forEach(([key, v]) => {
        if (key.includes(".")) {
          const [prefix, field] = key.split(".");
          if (!body[prefix]) body[prefix] = {};
          (body[prefix] as Row)[field] = v;
        } else body[key] = v;
      });
      await api(
        `platform/${action.endpoint}`,
        json(action.method ?? "POST", {
          ...body,
          password,
          reason,
          request_key: requestKey,
        }),
      );
      await cache.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("platform"),
      });
      await cache.invalidateQueries({ queryKey: ["business"] });
      notify("Platform change saved.");
      close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
      title={action.title}
      description={
        action.description ??
        "Changes are validated on the server and recorded in the audit trail."
      }
    >
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        {action.endpoint.includes("/review") && (
          <a
            className="button secondary"
            href={`/api/v1/platform/payments/${action.endpoint.split("/")[1]}/proof`}
            target="_blank"
            rel="noreferrer"
          >
            Download private proof
          </a>
        )}
        <div className="form-grid">
          {action.fields
            .filter((f) => !["permissions", "role-list"].includes(f.type ?? ""))
            .map((f) =>
              f.type === "user-select" ? (
                <UserPicker
                  key={f.key}
                  field={f}
                  selected={String(values[f.key] ?? "")}
                  disabled={busy}
                  onChange={(v) => set(f.key, v)}
                />
              ) : (
                <label
                  key={f.key}
                  className={f.type === "textarea" ? "span-two" : ""}
                >
                  {f.label}
                  {f.type === "select" ? (
                    <select
                      aria-label={f.label}
                      value={String(values[f.key] ?? "")}
                      required={f.required}
                      disabled={busy}
                      onChange={(e) => set(f.key, e.target.value)}
                    >
                      <option value="">Select…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      rows={3}
                      required={f.required}
                      value={String(values[f.key] ?? "")}
                      disabled={busy}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  ) : f.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={!!values[f.key]}
                      disabled={busy}
                      onChange={(e) => set(f.key, e.target.checked)}
                    />
                  ) : (
                    <input
                      type={f.type ?? "text"}
                      autoComplete={
                        f.type === "password" ? "new-password" : undefined
                      }
                      required={f.required}
                      value={String(values[f.key] ?? "")}
                      disabled={busy}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                </label>
              ),
            )}
        </div>
        {action.fields
          .filter((f) => f.type === "permissions")
          .map((f) => {
            const selected = (values[f.key] ?? []) as string[];
            const list =
              f.permissions?.filter((p) =>
                `${p.name} ${p.module}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ) ?? [];
            return (
              <div className="platform-permission-editor" key={f.key}>
                {f.templates && (
                  <label>
                    Apply a role template
                    <select
                      aria-label="Apply a role template"
                      defaultValue=""
                      onChange={(e) => {
                        const template = f.templates?.[e.target.value];
                        if (template)
                          setValues((old) => ({
                            ...old,
                            name: old.name || e.target.value,
                            [f.key]: template,
                          }));
                      }}
                    >
                      <option value="">Choose template…</option>
                      {Object.keys(f.templates).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Search permissions
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search actions or modules…"
                  />
                </label>
                <p className="muted">{selected.length} permissions selected</p>
                {Array.from(new Set(list.map((p) => p.module))).map(
                  (module) => (
                    <fieldset key={module}>
                      <legend>{module}</legend>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          const keys = list
                            .filter((x) => x.module === module)
                            .map((x) => x.key);
                          set(
                            f.key,
                            keys.every((k) => selected.includes(k))
                              ? selected.filter((k) => !keys.includes(k))
                              : Array.from(new Set([...selected, ...keys])),
                          );
                        }}
                      >
                        Select / clear group
                      </button>
                      {list
                        .filter((p) => p.module === module)
                        .map((permission) => (
                          <label
                            className="platform-permission"
                            key={permission.key}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(permission.key)}
                              onChange={(e) =>
                                set(
                                  f.key,
                                  e.target.checked
                                    ? [...selected, permission.key]
                                    : selected.filter(
                                        (k) => k !== permission.key,
                                      ),
                                )
                              }
                            />
                            <span>
                              <strong>{permission.name}</strong>
                              <small>{permission.description}</small>
                            </span>
                          </label>
                        ))}
                    </fieldset>
                  ),
                )}
              </div>
            );
          })}
        {action.fields
          .filter((f) => f.type === "role-list")
          .map((f) => (
            <fieldset key={f.key}>
              <legend>{f.label}</legend>
              {staffRoles.data?.roles.map((role) => (
                <label className="check-label" key={value(role, "public_id")}>
                  <input
                    type="checkbox"
                    checked={((values[f.key] ?? []) as string[]).includes(
                      value(role, "public_id"),
                    )}
                    onChange={(e) => {
                      const selected = (values[f.key] ?? []) as string[];
                      set(
                        f.key,
                        e.target.checked
                          ? [...selected, role.public_id]
                          : selected.filter((k) => k !== role.public_id),
                      );
                    }}
                  />
                  {value(role, "name")}
                </label>
              ))}
            </fieldset>
          ))}
        <label>
          Reason / administrative note
          <textarea
            required
            minLength={5}
            maxLength={1000}
            rows={2}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label>
          Confirm your password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="platform-dialog-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : (action.submit ?? "Save changes")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UserPicker({
  field,
  selected,
  disabled,
  onChange,
}: {
  field: Field;
  selected: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const users = useQuery({
    queryKey: ["platform-user-picker", query],
    queryFn: () =>
      api<{ users: Row[] }>(
        `platform/lookup?${new URLSearchParams({ user_q: query })}`,
      ),
    placeholderData: (previous) => previous,
  });
  const options =
    users.data?.users.map((u) => ({
      value: value(u, "public_id"),
      label: value(u, "email") + " · " + value(u, "name"),
    })) ??
    field.options ??
    [];
  const fallback = field.options?.find((u) => u.value === selected);
  const available =
    fallback && !options.some((u) => u.value === selected)
      ? [fallback, ...options]
      : options;
  return (
    <div>
      <label>
        Find a user
        <input
          aria-label={`Find user for ${field.label}`}
          placeholder="Search name or email…"
          value={search}
          maxLength={150}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label>
        {field.label}
        <select
          aria-label={field.label}
          value={selected}
          required={field.required}
          disabled={disabled || users.isPending}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {users.isPending ? "Loading users…" : "Select…"}
          </option>
          {available.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      {users.error && <ErrorBox error={users.error} />}
    </div>
  );
}
