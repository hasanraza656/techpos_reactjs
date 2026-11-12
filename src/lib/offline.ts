import Dexie from "dexie";
import type { Table } from "dexie";
import type {
  Product,
  SalePayload,
  SaleDocument,
  CartLine,
  Customer,
} from "./operations";
export type OutboxItem = {
  id: string;
  tenant: string;
  user: string;
  device: string;
  version: 1;
  kind: string;
  payload: unknown;
  status: "pending" | "failed" | "attention";
  createdAt: string;
  error?: string;
  attempts?: number;
  nextAttemptAt?: number;
  lastAttemptAt?: number;
};
export type LocalCart = {
  key: string;
  name?: string;
  lines: CartLine[];
  customer: Customer | null;
  discount: string;
  updatedAt: string;
};
export type LocalReceipt = {
  id: string;
  payload: SalePayload;
  document: SaleDocument;
  status: "pending" | "synced" | "attention";
  createdAt: string;
};
class BusinessStore extends Dexie {
  outbox!: Table<OutboxItem, string>;
  metadata!: Table<{ key: string; value: unknown }, string>;
  products!: Table<Product, string>;
  barcodes!: Table<
    { barcode: string; product: string; quantity: string },
    string
  >;
  carts!: Table<LocalCart, string>;
  receipts!: Table<LocalReceipt, string>;
  constructor(tenant: string, user: string) {
    super(`techpos:v1:${user}:${tenant}`);
    this.version(1).stores({
      outbox: "id,tenant,user,status,createdAt",
      metadata: "key",
    });
    this.version(2).stores({
      outbox: "id,tenant,user,status,createdAt",
      metadata: "key",
      products: "public_id,name,sku,category_name",
      barcodes: "barcode,product",
      carts: "key",
      receipts: "id,status,createdAt",
    });
    this.version(3).stores({
      outbox: "id,tenant,user,status,createdAt,nextAttemptAt",
    });
  }
}
export const deviceId = () => {
  let id = localStorage.getItem("techpos:device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("techpos:device", id);
  }
  return id;
};
export const localTransactionId = () => crypto.randomUUID();
export const businessStore = (tenant: string, user: string) =>
  new BusinessStore(tenant, user);
export async function clearBusinessData(user: string) {
  await assertNoPendingSales(user);
  const names = await Dexie.getDatabaseNames();
  await Promise.all(
    names
      .filter((name) => name.startsWith(`techpos:v1:${user}:`))
      .map((name) => Dexie.delete(name)),
  );
  if (localStorage.getItem("techpos:last-user") === user) {
    localStorage.removeItem("techpos:last-user");
    localStorage.removeItem("techpos:last-tenant");
  }
}
export async function assertNoPendingSales(user: string) {
  const names = await Dexie.getDatabaseNames();
  for (const name of names.filter((n) => n.startsWith(`techpos:v1:${user}:`))) {
    const tenant = name.slice(`techpos:v1:${user}:`.length);
    const db = businessStore(tenant, user);
    try {
      if (await db.outbox.count())
        throw new Error(
          "Unsynced transactions are stored on this device. Synchronize them before signing out; they will not be deleted.",
        );
    } finally {
      db.close();
    }
  }
}
