import { api, ApiError } from "./api";
import type { Me, Business } from "./types";
import { businessStore } from "./offline";
import type { OpsSetup } from "./operations";
type Envelope<T> = { data: T; expires: number };
const leaseMs = 2 * 60 * 60 * 1000;
export async function writeSnapshot<T>(
  user: string,
  tenant: string,
  key: string,
  data: T,
) {
  const db = businessStore(tenant, user);
  try {
    await db.metadata.put({
      key,
      value: { data, expires: Date.now() + leaseMs },
    });
  } finally {
    db.close();
  }
}
export async function readSnapshot<T>(
  user: string,
  tenant: string,
  key: string,
): Promise<T> {
  const db = businessStore(tenant, user);
  try {
    const item = (await db.metadata.get(key))?.value as Envelope<T> | undefined;
    if (!item || item.expires < Date.now())
      throw new Error(
        "Offline session has expired or is not initialized. Connect and sign in to continue.",
      );
    return item.data;
  } finally {
    db.close();
  }
}
export function networkFailure(e: unknown) {
  return !(e instanceof ApiError) && e instanceof TypeError;
}
export async function cachedMe(): Promise<Me> {
  try {
    return await api<Me>("auth/me");
  } catch (e) {
    if (!networkFailure(e)) throw e;
    const user = localStorage.getItem("techpos:last-user");
    const tenant = localStorage.getItem("techpos:last-tenant");
    if (!user || !tenant) throw e;
    return readSnapshot<Me>(user, tenant, "identity");
  }
}
export async function cachedBusiness(
  me: Me,
  tenant: string,
): Promise<Business> {
  try {
    const data = await api<Business>("business", {
      headers: { "X-Tenant-ID": tenant },
    });
    if (data.tenant.public_id !== tenant)
      throw new Error("Business scope mismatch.");
    await writeSnapshot(me.user.public_id, tenant, "identity", me);
    await writeSnapshot(me.user.public_id, tenant, "business", data);
    localStorage.setItem("techpos:last-user", me.user.public_id);
    localStorage.setItem("techpos:last-tenant", tenant);
    return data;
  } catch (e) {
    if (!networkFailure(e)) throw e;
    return readSnapshot<Business>(me.user.public_id, tenant, "business");
  }
}
export async function cachedOperations(
  user: string,
  tenant: string,
): Promise<OpsSetup> {
  try {
    const data = await api<OpsSetup>("operations/bootstrap", {
      headers: { "X-Tenant-ID": tenant },
    });
    await writeSnapshot(user, tenant, "operations", data);
    return data;
  } catch (e) {
    if (!networkFailure(e)) throw e;
    return readSnapshot<OpsSetup>(user, tenant, "operations");
  }
}
