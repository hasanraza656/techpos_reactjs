import { useQuery } from "@tanstack/react-query";
import { Plus, Shield } from "lucide-react";
import { api } from "../../lib/api";
import { Loading, ErrorBox } from "../../components/ui";
import type { Row, Action, Permission } from "./shared";
import { Head, Empty, usePortal, value, choices } from "./shared";
export function AccessPage({ tenant }: { tenant: boolean }) {
  const p = usePortal();
  const has = (s: string) => p.identity.permissions.includes(s);
  const q = useQuery({
    queryKey: ["platform-access", tenant, p.client],
    queryFn: () =>
      api<{
        roles: Row[];
        permissions: Permission[];
        templates: Record<string, string[]>;
        members?: Row[];
        branches?: Row[];
      }>(`platform/${tenant ? `clients/${p.client}/roles` : "roles"}`),
    enabled: !tenant || !!p.client,
  });
  const prefix = tenant ? `clients/${p.client}/roles` : "roles";
  const manage = has(tenant ? "client_access.manage" : "access.manage");
  const roleAction = (role?: Row, duplicate = false): Action => ({
    title: duplicate ? "Duplicate role" : role ? "Edit role" : "Create role",
    endpoint: role && !duplicate ? `${prefix}/${role.public_id}` : prefix,
    method: role && !duplicate ? "PUT" : "POST",
    fields: [
      { key: "name", label: "Role name", required: true },
      {
        key: "permissions",
        label: "Permissions",
        type: "permissions",
        permissions: q.data?.permissions,
        templates: q.data?.templates,
      },
    ],
    initial: {
      name: duplicate ? `${role?.name} copy` : (role?.name ?? ""),
      permissions: role?.permissions ?? [],
      ...(role && !duplicate ? { version: role.version } : {}),
    },
  });
  return (
    <>
      <Head
        title={
          tenant ? "Client team roles & permissions." : "Platform staff access."
        }
        description={
          tenant
            ? "Choose a client to manage its employee roles and branch assignments. Owner authority stays protected."
            : "Platform roles are separate from business roles. Roots retain explicit full platform authority."
        }
        action={
          manage && (!tenant || p.client) ? (
            <button
              className="button"
              disabled={!q.data}
              onClick={() => p.open(roleAction())}
            >
              <Plus size={16} />
              Create role
            </button>
          ) : undefined
        }
      />
      {tenant && !p.client ? (
        <Empty>Select a client from the filter above to manage its team.</Empty>
      ) : (
        <>
          <ErrorBox error={q.error} />
          {q.isPending ? (
            <Loading />
          ) : (
            <>
              <div className="platform-role-grid">
                {q.data?.roles.map((role) => (
                  <article className="panel" key={value(role, "public_id")}>
                    <span className="module-icon">
                      <Shield size={21} />
                    </span>
                    <h3>{value(role, "name")}</h3>
                    <p className="muted">
                      {((role.permissions ?? []) as string[]).length} action
                      permissions
                      {!tenant
                        ? ` · ${value(role, "users_count", "0")} assigned users`
                        : ""}
                    </p>
                    <details>
                      <summary>Preview effective permissions</summary>
                      <ul className="platform-permission-preview">
                        {((role.permissions ?? []) as string[]).map((k) => (
                          <li key={k}>
                            {q.data?.permissions.find((x) => x.key === k)
                              ?.name ?? k}
                          </li>
                        ))}
                      </ul>
                    </details>
                    {manage && (
                      <div className="platform-row-actions mt">
                        <button onClick={() => p.open(roleAction(role))}>
                          Edit
                        </button>
                        <button onClick={() => p.open(roleAction(role, true))}>
                          Duplicate
                        </button>
                        <button
                          onClick={() =>
                            p.open({
                              title: "Delete unused role",
                              endpoint: `${prefix}/${role.public_id}`,
                              method: "DELETE",
                              fields: [],
                              description:
                                "Assigned roles and roles reserved by active invitations cannot be deleted.",
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {tenant && (
                <section className="panel mt">
                  <div className="row between">
                    <h2>Client members</h2>
                    {manage && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          p.open({
                            title: "Assign client member role",
                            endpoint: `clients/${p.client}/memberships`,
                            initial: { action: "assign" },
                            fields: [
                              {
                                key: "user",
                                label: "User",
                                type: "user-select",
                                required: true,
                                options: choices(p.lookup.users, "email"),
                              },
                              {
                                key: "role",
                                label: "Client role",
                                type: "select",
                                required: true,
                                options: choices(q.data?.roles ?? []),
                              },
                              {
                                key: "branch",
                                label: "Branch restriction",
                                type: "select",
                                options: choices(q.data?.branches ?? []),
                              },
                            ],
                          })
                        }
                      >
                        Add / assign member
                      </button>
                    )}
                  </div>
                  {q.data?.members?.map((m) => (
                    <div className="list-row" key={value(m, "public_id")}>
                      <div>
                        <strong>{value(m, "name")}</strong>
                        <small>{value(m, "email")}</small>
                        <small>
                          {m.is_owner
                            ? "Owner"
                            : ((m.assignments ?? []) as Row[])
                                .map(
                                  (a) =>
                                    value(a, "role_name") +
                                    " · " +
                                    value(a, "branch_name", "All branches"),
                                )
                                .join(", ") || "No role assigned"}
                        </small>
                      </div>
                      {manage && !m.is_owner && (
                        <button
                          className="text-button"
                          onClick={() =>
                            p.open({
                              title: "Remove employee membership",
                              endpoint: `clients/${p.client}/memberships`,
                              initial: { action: "remove", user: m.public_id },
                              fields: [],
                              description:
                                "This removes access only to the selected client and preserves financial records.",
                            })
                          }
                        >
                          Remove membership
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
