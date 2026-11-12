import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { UserPlus, ShieldCheck, Mail, Monitor, LogOut } from "lucide-react";
import { api, json, useClient } from "../lib/api";
import { clearBusinessData, assertNoPendingSales } from "../lib/offline";
import type { Me } from "../lib/types";
import { useWorkspace } from "../App";
import { ErrorBox, Loading, PageTitle, Modal } from "../components/ui";
import { TwoFactorSettings } from "../components/TwoFactor";
type Assignment = {
  role: string;
  role_name: string;
  branch: string | null;
  branch_name: string | null;
};
type Member = {
  public_id: string;
  name: string;
  email: string;
  is_owner: boolean;
  assignments: Assignment[];
};
type Invite = {
  public_id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
type RoleOption = { public_id: string; name: string; permissions: string[] };
export function TeamPage() {
  const { business } = useWorkspace();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const canManage =
    business.permissions.includes("employees.manage") &&
    business.permissions.includes("roles.manage");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [branch, setBranch] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [remove, setRemove] = useState<Member | null>(null);
  const [password, setPassword] = useState("");
  const members = useQuery({
    queryKey: ["members", business.tenant.public_id],
    queryFn: () => api<Member[]>("members"),
  });
  const roles = useQuery({
    queryKey: ["role-options", business.tenant.public_id],
    queryFn: () => api<{ roles: RoleOption[] }>("roles"),
    enabled: canManage,
  });
  const invites = useQuery({
    queryKey: ["invitations", business.tenant.public_id],
    queryFn: () => api<Invite[]>("invitations"),
    enabled: canManage,
  });
  const invite = useMutation({
    mutationFn: () =>
      api<{ message: string }>(
        "invitations",
        json("POST", { email, role, branch: branch || null }),
      ),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["invitations"] });
      setOpen(false);
      notify(r.message);
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`invitations/${id}/revoke`, json("POST", {})),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["invitations"] });
      notify("Invitation revoked.");
    },
  });
  const assign = useMutation({
    mutationFn: () =>
      api(
        "role-assignments",
        json("POST", { user: member?.public_id, role, branch: branch || null }),
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["members"] });
      setMember(null);
      notify("Member access updated.");
    },
  });
  const removeMember = useMutation({
    mutationFn: () =>
      api(`members/${remove?.public_id}/remove`, json("POST", { password })),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["members"] });
      setRemove(null);
      setPassword("");
      notify("Business access removed.");
    },
  });
  if (members.isPending) return <Loading />;
  if (members.error) return <ErrorBox error={members.error} />;
  return (
    <>
      <PageTitle
        title="Good work starts with a good team."
        description="Invite your people and give each person the right access."
        action={
          canManage && (
            <button
              className="button"
              onClick={() => {
                setOpen(true);
                setEmail("");
                setRole(
                  roles.data?.roles.find((r) => r.name === "Cashier")
                    ?.public_id ?? "",
                );
                setBranch("");
                invite.reset();
              }}
            >
              <UserPlus size={17} />
              Invite teammate
            </button>
          )
        }
      />
      <ErrorBox error={roles.error ?? invites.error ?? revoke.error} />
      <section className="panel">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Team member</th>
                <th>Access</th>
                <th>Branch scope</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.data?.map((m) => (
                <tr key={m.public_id}>
                  <td>
                    <strong>{m.name}</strong>
                    <small className="table-subtext">{m.email}</small>
                  </td>
                  <td>
                    {m.is_owner
                      ? "Owner"
                      : m.assignments.map((a) => a.role_name).join(", ") ||
                        "No role assigned"}
                  </td>
                  <td>
                    {m.is_owner
                      ? "All branches"
                      : m.assignments
                          .map((a) => a.branch_name ?? "All branches")
                          .join(", ") || "—"}
                  </td>
                  <td>
                    {canManage && !m.is_owner && (
                      <div className="row">
                        <button
                          className="text-button"
                          onClick={() => {
                            setMember(m);
                            setRole(m.assignments[0]?.role ?? "");
                            setBranch(m.assignments[0]?.branch ?? "");
                            assign.reset();
                          }}
                        >
                          Edit access
                        </button>
                        <button
                          className="text-button danger-text"
                          onClick={() => {
                            setRemove(m);
                            setPassword("");
                            removeMember.reset();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {canManage && (
        <section className="panel mt">
          <h2>Invitations</h2>
          <p className="muted">
            Open invitations reserve a team member seat until accepted, revoked
            or expired.
          </p>
          {!invites.data?.length ? (
            <div className="empty">
              <Mail size={25} />
              <p>No invitations yet.</p>
            </div>
          ) : (
            invites.data.map((i) => {
              const status = i.accepted_at
                ? "Accepted"
                : i.revoked_at
                  ? "Revoked"
                  : new Date(i.expires_at + "Z") < new Date()
                    ? "Expired"
                    : "Pending";
              return (
                <div className="list-row" key={i.public_id}>
                  <Mail size={18} />
                  <div>
                    <strong>{i.email}</strong>
                    <small>
                      Expires {new Date(i.expires_at + "Z").toLocaleString()}
                    </small>
                  </div>
                  <span className="neutral-pill">{status}</span>
                  {status === "Pending" && (
                    <button
                      className="text-button"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(i.public_id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}
      <Modal
        open={open || !!member}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setMember(null);
          }
        }}
        title={member ? `Access for ${member.name}` : "Invite a teammate"}
        description="Choose a role and optional branch restriction. Platform administration is never granted here."
      >
        <ErrorBox error={member ? assign.error : invite.error} />
        {!member && (
          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Choose a role</option>
            {roles.data?.roles.map((r) => (
              <option key={r.public_id} value={r.public_id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Branch access
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {business.branches.map((b) => (
              <option key={b.public_id} value={b.public_id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted mt">
          {roles.data?.roles.find((r) => r.public_id === role)?.permissions
            .length ?? 0}{" "}
          effective role grants. Branch-limited permissions apply only within
          the chosen branch.
        </p>
        <button
          className="button full mt"
          disabled={
            !role || (!member && !email) || invite.isPending || assign.isPending
          }
          onClick={() => (member ? assign.mutate() : invite.mutate())}
        >
          {member ? "Save access" : "Send invitation"}
        </button>
      </Modal>
      <Modal
        open={!!remove}
        onOpenChange={(v) => {
          if (!v) setRemove(null);
        }}
        title={`Remove ${remove?.name ?? "member"}?`}
        description="This removes access to this business. Their account, historical activity and other businesses are preserved."
      >
        <ErrorBox error={removeMember.error} />
        <label>
          Confirm your password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          className="button full mt"
          disabled={!password || removeMember.isPending}
          onClick={() => removeMember.mutate()}
        >
          Remove business access
        </button>
      </Modal>
    </>
  );
}
export function InvitationPage() {
  const { token } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const setTenant = useClient((s) => s.setTenant);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState("");
  const preview = useQuery({
    queryKey: ["invitation", token],
    queryFn: () =>
      api<{ business_name: string; role_name: string; expires_at: string }>(
        `invitations/${token}`,
      ),
    retry: false,
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("auth/me"),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () =>
      api<{ tenant: string }>(`invitations/${token}/accept`, json("POST", {})),
    onSuccess: (r) => {
      setTenant(r.tenant);
      client.clear();
      navigate("/");
    },
  });
  const signup = useMutation({
    mutationFn: () =>
      api(
        `invitations/${token}/register`,
        json("POST", { name, password, password_confirmation: confirm }),
      ),
    onSuccess: () => {
      client.clear();
      setTenant("");
      navigate("/");
    },
  });
  if (preview.isPending || me.isPending) return <Loading />;
  return (
    <main className="standalone invitation-card panel">
      <span className="badge">YOU’RE INVITED</span>
      <h1 className="mt">A place on the team.</h1>
      <ErrorBox error={preview.error ?? accept.error ?? signup.error} />
      {preview.data && (
        <>
          <p className="muted mt">
            Join <strong>{preview.data.business_name}</strong> as{" "}
            {preview.data.role_name}. You must use the email address that
            received this invitation.
          </p>
          {me.data ? (
            <>
              <p className="mt">Signed in as {me.data.user.email}.</p>
              {me.data.user.email_verified_at ? (
                <button
                  className="button full mt"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate()}
                >
                  Accept invitation
                </button>
              ) : (
                <>
                  <p className="muted">
                    Verify your email first, then return to this page.
                  </p>
                  <button
                    className="button mt"
                    onClick={() =>
                      api<{ message: string }>(
                        "auth/verification-notification",
                        json("POST", {}),
                      )
                        .then((r) => setMessage(r.message))
                        .catch((e) => setMessage(e.message))
                    }
                  >
                    Send verification link
                  </button>
                </>
              )}
            </>
          ) : register ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                signup.mutate();
              }}
            >
              <label>
                Your name
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <small className="muted">
                  At least 12 characters, including letters and numbers.
                </small>
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <button className="button full mt" disabled={signup.isPending}>
                Create account and join
              </button>
            </form>
          ) : (
            <div className="mt">
              <Link
                className="button full"
                to={`/login?next=${encodeURIComponent("/invitations/" + token)}`}
              >
                Sign in to accept
              </Link>
              <button
                className="button secondary full mt"
                onClick={() => setRegister(true)}
              >
                Create an invited account
              </button>
            </div>
          )}
          <p className="muted mt">
            This private link expires after 72 hours. Creating an invited
            account joins this business directly.
          </p>
        </>
      )}
      {message && (
        <p className="alert mt" role="status">
          {message}
        </p>
      )}
      <Link className="text-button mt" to="/">
        Return to workspace
      </Link>
    </main>
  );
}
type Session = {
  public_id: string;
  ip: string;
  user_agent: string;
  last_active_at: string;
  is_current: boolean;
};
type Device = {
  public_id: string;
  name: string;
  business_name: string;
  last_seen_at: string;
  revoked_at: string | null;
};
type SecurityData = {
  sessions: Session[];
  devices: Device[];
  recent_logins: {
    ip: string;
    user_agent: string;
    suspicious: boolean;
    created_at: string;
  }[];
};
export function AccountPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { setTenant, notify } = useClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("auth/me") });
  const data = useQuery({
    queryKey: ["account-security"],
    queryFn: () => api<SecurityData>("account/sessions"),
    enabled: !!me.data,
  });
  const [action, setAction] = useState<{ path: string; title: string } | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const revoke = useMutation({
    mutationFn: () =>
      api<{ message: string }>(action?.path ?? "", json("POST", { password })),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["account-security"] });
      setAction(null);
      setPassword("");
      notify(r.message);
    },
  });
  const logout = useMutation({
    mutationFn: async () => {
      if (me.data) await assertNoPendingSales(me.data.user.public_id);
      return api("auth/logout", json("POST", {}));
    },
    onSuccess: async () => {
      if (me.data) await clearBusinessData(me.data.user.public_id);
      client.clear();
      setTenant("");
      navigate("/login");
    },
  });
  if (me.isPending || data.isPending) return <Loading />;
  if (me.error || data.error)
    return (
      <main className="standalone">
        <ErrorBox error={me.error ?? data.error} />
        <Link to="/login">Sign in</Link>
      </main>
    );
  const choose = (path: string, title: string) => {
    setAction({ path, title });
    setPassword("");
    revoke.reset();
  };
  return (
    <main className="platform-layout">
      <PageTitle
        eyebrow="YOUR ACCOUNT"
        title="A clear view of your security."
        description={`Signed in as ${me.data?.user.email}. Review and revoke access from your devices.`}
        action={
          <Link className="button secondary" to="/">
            Back to workspace
          </Link>
        }
      />
      <ErrorBox error={logout.error} />
      <TwoFactorSettings verified={!!me.data?.user.email_verified_at} />
      <section className="panel">
        <div className="section-heading">
          <h2>Active sessions</h2>
          <button
            className="button secondary"
            onClick={() =>
              choose(
                "account/sessions/revoke-others",
                "Revoke all other sessions?",
              )
            }
          >
            Revoke other sessions
          </button>
        </div>
        {data.data?.sessions.map((s) => (
          <div className="list-row" key={s.public_id}>
            <Monitor size={22} />
            <div>
              <strong>
                {s.ip ?? "Unknown network"}{" "}
                {s.is_current ? "· This session" : ""}
              </strong>
              <small>{s.user_agent || "Unknown browser"}</small>
              <small>
                Last active {new Date(s.last_active_at).toLocaleString()}
              </small>
            </div>
            {s.is_current ? (
              <button
                className="text-button"
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
              >
                <LogOut size={14} />
                Sign out
              </button>
            ) : (
              <button
                className="text-button"
                onClick={() =>
                  choose(
                    `account/sessions/${s.public_id}/revoke`,
                    "Revoke this session?",
                  )
                }
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="panel mt">
        <h2>Registered devices</h2>
        {!data.data?.devices.length ? (
          <p className="empty">
            No registered devices yet. Devices register when you open a business
            workspace.
          </p>
        ) : (
          data.data.devices.map((d) => (
            <div className="list-row" key={d.public_id}>
              <Monitor size={20} />
              <div>
                <strong>{d.business_name}</strong>
                <small>{d.name}</small>
                <small>
                  Last seen {new Date(d.last_seen_at + "Z").toLocaleString()}
                </small>
              </div>
              {d.revoked_at ? (
                <span className="neutral-pill">Revoked</span>
              ) : (
                <button
                  className="text-button"
                  onClick={() =>
                    choose(
                      `account/devices/${d.public_id}/revoke`,
                      "Revoke this device?",
                    )
                  }
                >
                  Revoke device
                </button>
              )}
            </div>
          ))
        )}
      </section>
      <section className="panel mt">
        <h2>Recent sign-ins</h2>
        <p className="muted">
          New network/browser combinations trigger an email notice. A new
          combination does not necessarily mean unauthorized activity.
        </p>
        {!data.data?.recent_logins.length ? (
          <p className="empty">No sign-in history yet.</p>
        ) : (
          data.data.recent_logins.map((e, i) => (
            <div className="list-row" key={i}>
              <ShieldCheck size={20} />
              <div>
                <strong>{e.ip}</strong>
                <small>{e.user_agent}</small>
                <small>{new Date(e.created_at + "Z").toLocaleString()}</small>
              </div>
              {!!e.suspicious && (
                <span className="neutral-pill">New combination</span>
              )}
            </div>
          ))
        )}
      </section>
      <Modal
        open={!!action}
        onOpenChange={(v) => {
          if (!v) setAction(null);
        }}
        title={action?.title ?? "Confirm security action"}
        description="The current session stays active. Remembered sign-ins are invalidated, and revoked devices require a new sign-in."
      >
        <ErrorBox error={revoke.error} />
        <label>
          Confirm your password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          className="button full mt"
          disabled={!password || revoke.isPending}
          onClick={() => revoke.mutate()}
        >
          Confirm revocation
        </button>
      </Modal>
    </main>
  );
}
