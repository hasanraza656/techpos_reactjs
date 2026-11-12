import { z } from "zod";
import { businessStore } from "./offline";
import type { LocalReceipt, OutboxItem } from "./offline";
const uuid = z.string().uuid();
const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
const quantity = z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/);
const payload = z
  .object({
    idempotency_key: uuid,
    branch: uuid,
    warehouse: uuid,
    shift: uuid,
    customer: uuid.nullable().optional(),
    cashier: uuid,
    device_identifier: uuid,
    local_sequence: z.number().int().positive().safe(),
    payload_version: z.literal(1),
    client_occurred_at: z.string().datetime({ offset: true }),
    channel: z.enum(["online", "offline"]),
    lines: z
      .array(
        z
          .object({
            product: uuid,
            quantity,
            discount: money,
            expected_unit_price: money,
          })
          .strict(),
      )
      .min(1)
      .max(200),
    cart_discount: money,
    expected_total: money,
    payments: z
      .array(
        z
          .object({
            method: z.enum(["cash", "external_card", "bank_transfer"]),
            amount: money,
            reference: z.string().max(120).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
const queue = z
  .object({
    id: uuid,
    tenant: uuid,
    user: uuid,
    device: uuid,
    version: z.literal(1),
    kind: z.literal("sale"),
    payload,
    status: z.enum(["pending", "failed", "attention"]),
    createdAt: z.string().datetime(),
    error: z.string().max(5000).optional(),
    attempts: z.number().int().nonnegative().optional(),
    nextAttemptAt: z.number().nonnegative().optional(),
    lastAttemptAt: z.number().nonnegative().optional(),
  })
  .strict();
const receipt = z
  .object({
    id: uuid,
    payload,
    document: z
      .object({
        public_id: uuid,
        receipt_number: z.string().max(100),
        business_name: z.string().max(180),
        branch_name: z.string().max(180),
        currency: z.string().length(3),
        finalized_at: z.string().max(60),
        subtotal: money,
        line_discount: money,
        cart_discount: money,
        tax_total: money,
        total: money,
        change_due: money,
        amount_tendered: money,
        channel: z.string().max(20),
        lines: z
          .array(
            z
              .object({
                name: z.string().max(180),
                sku: z.string().max(80),
                quantity,
                unit_price: money,
                total: money,
                tax: money,
                line_discount: money,
                cart_discount: money,
              })
              .passthrough(),
          )
          .max(200),
        payments: z
          .array(
            z
              .object({
                method: z.string().max(30),
                amount: money,
                reference: z.string().nullable(),
                verification: z.string().max(40),
              })
              .passthrough(),
          )
          .max(10),
      })
      .passthrough(),
    status: z.enum(["pending", "synced", "attention"]),
    createdAt: z.string().datetime(),
  })
  .strict();
const journal = z
  .object({
    format: z.literal("techpos-recovery-v1"),
    tenant: uuid,
    user: uuid,
    exported_at: z.string().datetime(),
    records: z.array(z.object({ queue, receipt })).max(1000),
  })
  .strict();
const format = "techpos-recovery-encrypted-v1";
const iterations = 600000;
const encoder = new TextEncoder();
const envelope = z
  .object({
    format: z.literal(format),
    iterations: z.literal(iterations),
    salt: z.string().max(40),
    iv: z.string().max(24),
    ciphertext: z.string().max(16 * 1024 * 1024),
  })
  .strict();
function bytes64(bytes: Uint8Array) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 0x4000)
    value += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  return btoa(value);
}
function from64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
async function key(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12 || passphrase.length > 1000)
    throw new Error(
      "Use a recovery passphrase between 12 and 1000 characters.",
    );
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function encryptRecovery(
  tenant: string,
  user: string,
  passphrase: string,
): Promise<string> {
  const db = businessStore(tenant, user);
  let records: unknown[] = [];
  try {
    const pending = await db.outbox.toArray();
    for (const q of pending) {
      const r = await db.receipts.get(q.id);
      if (!r)
        throw new Error(
          "A pending record is missing its local receipt. Preserve this browser and contact support before recovery.",
        );
      records.push({ queue: q, receipt: r });
    }
  } finally {
    db.close();
  }
  const data = journal.parse({
    format: "techpos-recovery-v1",
    tenant,
    user,
    exported_at: new Date().toISOString(),
    records,
  });
  const clear = encoder.encode(JSON.stringify(data));
  if (clear.length > 10 * 1024 * 1024)
    throw new Error(
      "This journal exceeds the 10 MB recovery limit. Contact support; records remain on this device.",
    );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const secret = await key(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(format) },
    secret,
    clear,
  );
  return JSON.stringify({
    format,
    iterations,
    salt: bytes64(salt),
    iv: bytes64(iv),
    ciphertext: bytes64(new Uint8Array(encrypted)),
  });
}
export async function importRecovery(
  text: string,
  tenant: string,
  user: string,
  passphrase: string,
): Promise<{ imported: number; duplicates: number }> {
  if (text.length > 16 * 1024 * 1024)
    throw new Error("Recovery files must be at most 16 MB.");
  let clear: ArrayBuffer;
  try {
    const encrypted = envelope.parse(JSON.parse(text));
    const salt = from64(encrypted.salt);
    const iv = from64(encrypted.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error();
    const secret = await key(passphrase, salt);
    clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(format) },
      secret,
      from64(encrypted.ciphertext),
    );
  } catch {
    throw new Error(
      "Could not unlock the recovery file. Check the passphrase and file integrity.",
    );
  }
  if (clear.byteLength > 10 * 1024 * 1024)
    throw new Error("The decrypted journal exceeds the recovery limit.");
  const data = journal.parse(JSON.parse(new TextDecoder().decode(clear)));
  if (data.tenant !== tenant || data.user !== user)
    throw new Error(
      "This recovery journal belongs to a different business or cashier. Sign in to the original account and business.",
    );
  const ids = new Set<string>();
  for (const r of data.records) {
    const q = r.queue;
    if (
      ids.has(q.id) ||
      q.tenant !== tenant ||
      q.user !== user ||
      q.payload.cashier !== user ||
      q.id !== q.payload.idempotency_key ||
      q.device !== q.payload.device_identifier ||
      r.receipt.id !== q.id ||
      r.receipt.document.public_id !== q.id ||
      canonical(r.receipt.payload) !== canonical(q.payload)
    )
      throw new Error(
        "The recovery journal contains conflicting identities or payloads. Nothing was imported.",
      );
    ids.add(q.id);
    const counterKey = `techpos:sequence:${user}:${tenant}:${q.device}`;
    const retained = Number(localStorage.getItem(counterKey) ?? "0");
    if (!Number.isSafeInteger(retained) || retained < 0)
      throw new Error(
        "The retained device sequence is invalid. Preserve this journal and contact your owner.",
      );
    localStorage.setItem(
      counterKey,
      String(Math.max(retained, q.payload.local_sequence)),
    );
  }
  const db = businessStore(tenant, user);
  let imported = 0,
    duplicates = 0;
  try {
    await db.transaction(
      "rw",
      db.outbox,
      db.receipts,
      db.metadata,
      async () => {
        for (const { queue: q, receipt: r } of data.records) {
          const previous = await db.receipts.get(q.id);
          const queued = await db.outbox.get(q.id);
          if (
            (previous &&
              canonical(previous.payload) !== canonical(q.payload)) ||
            (queued && canonical(queued.payload) !== canonical(q.payload))
          )
            throw new Error(
              "An existing transaction has different contents. Nothing was imported.",
            );
          if (previous?.status === "synced" || (previous && queued)) {
            duplicates++;
            continue;
          }
          const status = q.status === "attention" ? "attention" : "pending";
          await db.outbox.put({ ...q, status, nextAttemptAt: 0 } as OutboxItem);
          await db.receipts.put({
            ...r,
            status: status === "attention" ? "attention" : "pending",
          } as LocalReceipt);
          imported++;
        }
        if (imported) await db.metadata.delete("catalog-location");
      },
    );
  } finally {
    db.close();
  }
  return { imported, duplicates };
}
