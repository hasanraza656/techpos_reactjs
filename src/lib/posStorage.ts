import { businessStore, deviceId } from "./offline";
import type { LocalReceipt } from "./offline";
import { ops } from "./operations";
import type { Product, Page, SalePayload, SaleDocument } from "./operations";
import { ApiError } from "./api";
import { scaled, formatted } from "./decimal";
import { retryDelay } from "./retryPolicy";
export async function cacheCatalog(
  tenant: string,
  user: string,
  branch: string,
  warehouse: string,
  onProgress?: (count: number) => void,
) {
  const products: Product[] = [];
  let page = 1;
  let last = 1;
  do {
    const data = await ops<Page<Product>>(
      `products?${new URLSearchParams({ branch, warehouse, page: String(page), per_page: "100" })}`,
      { headers: { "X-Tenant-ID": tenant } },
    );
    products.push(...data.data.map(({ cost_price: _, ...p }) => p));
    last = data.last_page;
    onProgress?.(products.length);
    page++;
  } while (page <= last);
  const db = businessStore(tenant, user);
  try {
    await db.transaction(
      "rw",
      db.products,
      db.barcodes,
      db.metadata,
      async () => {
        await db.products.clear();
        await db.barcodes.clear();
        await db.products.bulkPut(products);
        await db.barcodes.bulkPut(
          products.flatMap((p) =>
            p.barcodes.map((b) => ({ ...b, product: p.public_id })),
          ),
        );
        await db.metadata.put({
          key: "catalog-location",
          value: { branch, warehouse, at: new Date().toISOString() },
        });
      },
    );
  } finally {
    db.close();
  }
  return products.length;
}
export async function cachedProducts(
  tenant: string,
  user: string,
  branch: string,
  warehouse: string,
  q = "",
  barcode = false,
): Promise<Product[]> {
  const db = businessStore(tenant, user);
  try {
    const location = (await db.metadata.get("catalog-location"))?.value as
      { branch: string; warehouse: string } | undefined;
    if (
      !location ||
      location.branch !== branch ||
      location.warehouse !== warehouse
    )
      throw new Error(
        "Cache this branch and stockroom online before using it offline.",
      );
    if (barcode) {
      const b = await db.barcodes.get(q);
      const p = b ? await db.products.get(b.product) : undefined;
      return p ? [p] : [];
    }
    const term = q.toLocaleLowerCase();
    return db.products
      .filter(
        (p) =>
          p.active &&
          (!term ||
            `${p.name} ${p.sku} ${p.alternate_name ?? ""} ${p.brand ?? ""} ${p.category_name ?? ""}`
              .toLocaleLowerCase()
              .includes(term)),
      )
      .limit(60)
      .toArray();
  } finally {
    db.close();
  }
}
export async function persistSale(
  tenant: string,
  user: string,
  payload: SalePayload,
  document: SaleDocument,
  cartKey: string,
): Promise<LocalReceipt> {
  const db = businessStore(tenant, user);
  try {
    return await db.transaction(
      "rw",
      db.outbox,
      db.receipts,
      db.metadata,
      db.carts,
      db.products,
      async () => {
        const existing = await db.receipts.get(payload.idempotency_key);
        if (existing) return existing;
        const previous =
          ((await db.metadata.get("local-sequence"))?.value as
            number | undefined) ?? 0;
        // Retain a nonfinancial high-water mark across successful logout/data clearing.
        // Reserve before the IDB commit: aborted writes may leave gaps, never reused IDs.
        const counterKey = `techpos:sequence:${user}:${tenant}:${deviceId()}`;
        const retained = Number(localStorage.getItem(counterKey) ?? "0");
        const sequence = Math.max(previous, retained) + 1;
        if (!Number.isSafeInteger(sequence))
          throw new Error(
            "The device sequence is invalid. Connect and contact your owner before continuing.",
          );
        localStorage.setItem(counterKey, String(sequence));
        const body: SalePayload = {
          ...payload,
          device_identifier: deviceId(),
          cashier: user,
          local_sequence: sequence,
          payload_version: 1,
          client_occurred_at: new Date().toISOString(),
        };
        const record: LocalReceipt = {
          id: body.idempotency_key,
          payload: body,
          document,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        await db.metadata.put({ key: "local-sequence", value: sequence });
        await db.receipts.put(record);
        await db.outbox.put({
          id: record.id,
          tenant,
          user,
          device: deviceId(),
          version: 1,
          kind: "sale",
          payload: body,
          status: "pending",
          createdAt: record.createdAt,
        });
        await db.carts.delete(cartKey);
        for (const line of body.lines) {
          const product = await db.products.get(line.product);
          if (product?.track_stock)
            await db.products.update(product.public_id, {
              stock_quantity: formatted(
                scaled(product.stock_quantity, 3) - scaled(line.quantity, 3),
                3,
              ),
            });
        }
        return record;
      },
    );
  } finally {
    db.close();
  }
}
const syncing = new Map<
  string,
  Promise<{ synced: number; attention: number }>
>();
export function syncSales(tenant: string, user: string, force = false) {
  const key = `${user}:${tenant}`;
  const active = syncing.get(key);
  if (active) return active;
  const execute = () => runSync(tenant, user, force);
  const work = navigator.locks
    ? navigator.locks.request(
        `techpos:sync:${key}`,
        { ifAvailable: true },
        (lock) =>
          lock ? execute() : Promise.resolve({ synced: 0, attention: 0 }),
      )
    : execute();
  const promise = work.finally(() => {
    syncing.delete(key);
  });
  syncing.set(key, promise);
  return promise;
}
async function runSync(tenant: string, user: string, force = false) {
  const db = businessStore(tenant, user);
  let synced = 0;
  let attention = 0;
  try {
    const pending = await db.outbox.orderBy("createdAt").toArray();
    for (const record of pending) {
      if (record.kind !== "sale" || record.status === "attention") continue;
      if (!force && (record.nextAttemptAt ?? 0) > Date.now()) continue;
      if (record.user !== user || record.tenant !== tenant)
        throw new Error(
          "Local queue scope mismatch. Preserve this journal and contact your owner.",
        );
      try {
        const sale = await ops<SaleDocument>("sales", {
          method: "POST",
          body: JSON.stringify(record.payload),
          headers: { "X-Tenant-ID": tenant },
        });
        await db.transaction("rw", db.receipts, db.outbox, async () => {
          await db.receipts.update(record.id, {
            document: sale,
            status: "synced",
          });
          await db.outbox.delete(record.id);
        });
        synced++;
      } catch (e) {
        const attempts = (record.attempts ?? 0) + 1;
        const lastAttemptAt = Date.now();
        if (e instanceof ApiError) {
          const text = Object.values(e.errors).flat().join(" ") || e.message;
          const status = [403, 404, 409, 422].includes(e.status)
            ? "attention"
            : "failed";
          await db.outbox.update(record.id, {
            status,
            error: text,
            attempts,
            lastAttemptAt,
            nextAttemptAt:
              status === "attention"
                ? undefined
                : lastAttemptAt + retryDelay(attempts, e.retryAfterMs),
          });
          if (status === "attention") {
            await db.receipts.update(record.id, { status: "attention" });
            attention++;
          }
          if (e.status === 401 || e.status === 419 || e.status === 429) break;
        } else {
          await db.outbox.update(record.id, {
            status: "failed",
            error: e instanceof Error ? e.message : "Network unavailable",
            attempts,
            lastAttemptAt,
            nextAttemptAt: lastAttemptAt + retryDelay(attempts),
          });
          break;
        }
      }
    }
    return { synced, attention };
  } finally {
    db.close();
  }
}
export async function retryAttention(tenant: string, user: string, id: string) {
  const db = businessStore(tenant, user);
  try {
    await db.outbox.update(id, {
      status: "pending",
      error: undefined,
      nextAttemptAt: 0,
    });
  } finally {
    db.close();
  }
  return syncSales(tenant, user, true);
}
