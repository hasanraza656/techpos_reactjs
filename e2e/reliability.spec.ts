import { test, expect } from "@playwright/test";

test("encrypted recovery rejects tampering and wrong scope, preserves payloads and deduplicates", async ({
  page,
}) => {
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    const offlinePath = "/src/lib/offline.ts",
      recoveryPath = "/src/lib/recovery.ts";
    const { businessStore, deviceId } = await import(offlinePath);
    const { encryptRecovery, importRecovery } = await import(recoveryPath);
    const tenant = crypto.randomUUID(),
      user = crypto.randomUUID(),
      id = crypto.randomUUID(),
      device = deviceId();
    const db = businessStore(tenant, user);
    const payload = {
      idempotency_key: id,
      branch: crypto.randomUUID(),
      warehouse: crypto.randomUUID(),
      shift: crypto.randomUUID(),
      cashier: user,
      device_identifier: device,
      local_sequence: 7,
      payload_version: 1,
      client_occurred_at: new Date().toISOString(),
      channel: "offline",
      lines: [
        {
          product: crypto.randomUUID(),
          quantity: "1.000",
          discount: "0.00",
          expected_unit_price: "10.00",
        },
      ],
      cart_discount: "0.00",
      expected_total: "10.00",
      payments: [{ method: "cash", amount: "10.00" }],
    };
    const document = {
      public_id: id,
      receipt_number: "LOCAL-QA",
      business_name: "Private QA shop",
      branch_name: "Main",
      currency: "PKR",
      finalized_at: new Date().toISOString(),
      subtotal: "10.00",
      line_discount: "0.00",
      cart_discount: "0.00",
      tax_total: "0.00",
      total: "10.00",
      change_due: "0.00",
      amount_tendered: "10.00",
      channel: "offline",
      lines: [
        {
          name: "Private QA product",
          sku: "QA",
          quantity: "1.000",
          unit_price: "10.00",
          total: "10.00",
          tax: "0.00",
          line_discount: "0.00",
          cart_discount: "0.00",
        },
      ],
      payments: [
        {
          method: "cash",
          amount: "10.00",
          reference: null,
          verification: "cash_received",
        },
      ],
    };
    try {
      await db.outbox.put({
        id,
        tenant,
        user,
        device,
        version: 1,
        kind: "sale",
        payload,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      await db.receipts.put({
        id,
        payload,
        document,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      await db.metadata.put({
        key: "catalog-location",
        value: { branch: payload.branch, warehouse: payload.warehouse },
      });
      const encrypted = await encryptRecovery(
        tenant,
        user,
        "RecoveryPassphrase123",
      );
      const privateTextAbsent =
        !encrypted.includes("Private QA") && !encrypted.includes(id);
      await db.outbox.clear();
      await db.receipts.clear();
      let badPass = false,
        wrongScope = false,
        tamper = false;
      try {
        await importRecovery(encrypted, tenant, user, "WrongPassphrase123");
      } catch {
        badPass = true;
      }
      try {
        await importRecovery(
          encrypted,
          crypto.randomUUID(),
          user,
          "RecoveryPassphrase123",
        );
      } catch {
        wrongScope = true;
      }
      const changed = JSON.parse(encrypted);
      changed.ciphertext =
        (changed.ciphertext.startsWith("A") ? "B" : "A") +
        changed.ciphertext.slice(1);
      try {
        await importRecovery(
          JSON.stringify(changed),
          tenant,
          user,
          "RecoveryPassphrase123",
        );
      } catch {
        tamper = true;
      }
      const restored = await importRecovery(
        encrypted,
        tenant,
        user,
        "RecoveryPassphrase123",
      );
      const duplicate = await importRecovery(
        encrypted,
        tenant,
        user,
        "RecoveryPassphrase123",
      );
      const record = await db.outbox.get(id);
      const unchanged =
        JSON.stringify(record.payload) === JSON.stringify(payload);
      const cacheInvalidated = !(await db.metadata.get("catalog-location"));
      return {
        privateTextAbsent,
        badPass,
        wrongScope,
        tamper,
        restored,
        duplicate,
        unchanged,
        cacheInvalidated,
        count: await db.outbox.count(),
      };
    } finally {
      db.close();
      await db.delete();
    }
  });
  expect(result).toEqual({
    privateTextAbsent: true,
    badPass: true,
    wrongScope: true,
    tamper: true,
    restored: { imported: 1, duplicates: 0 },
    duplicate: { imported: 0, duplicates: 1 },
    unchanged: true,
    cacheInvalidated: true,
    count: 1,
  });
});

test("durable sync backoff honors retry scheduling, reload and unchanged retry identity", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/v1/operations/sales", async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({
        status: 503,
        headers: { "Retry-After": "60" },
        json: { message: "Temporary test outage" },
      });
    else
      await route.fulfill({
        status: 201,
        json: {
          public_id: JSON.parse(route.request().postData()!).idempotency_key,
          receipt_number: "SERVER-QA",
        },
      });
  });
  await page.goto("/login");
  const ids = await page.evaluate(async () => {
    const path = "/src/lib/offline.ts";
    const { businessStore, deviceId } = await import(path);
    const tenant = crypto.randomUUID(),
      user = crypto.randomUUID(),
      id = crypto.randomUUID();
    const db = businessStore(tenant, user);
    try {
      const payload = { idempotency_key: id, cashier: user };
      await db.outbox.put({
        id,
        tenant,
        user,
        device: deviceId(),
        version: 1,
        kind: "sale",
        payload,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      await db.receipts.put({
        id,
        payload,
        document: { public_id: id },
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      return { tenant, user, id };
    } finally {
      db.close();
    }
  });
  const first = await page.evaluate(async ({ tenant, user, id }) => {
    const a = "/src/lib/posStorage.ts",
      b = "/src/lib/offline.ts";
    const { syncSales } = await import(a);
    const { businessStore } = await import(b);
    const p = syncSales(tenant, user);
    const shared = p === syncSales(tenant, user);
    await p;
    await syncSales(tenant, user);
    const db = businessStore(tenant, user);
    try {
      const record = await db.outbox.get(id);
      return {
        shared,
        status: record.status,
        attempts: record.attempts,
        nextDelay: record.nextAttemptAt - Date.now(),
        payload: record.payload,
      };
    } finally {
      db.close();
    }
  }, ids);
  expect(first.shared).toBeTruthy();
  expect(first.status).toBe("failed");
  expect(first.attempts).toBe(1);
  expect(first.nextDelay).toBeGreaterThan(50000);
  expect(attempts).toBe(1);
  await page.reload();
  await page.evaluate(async ({ tenant, user }) => {
    const path = "/src/lib/posStorage.ts";
    await (await import(path)).syncSales(tenant, user);
  }, ids);
  expect(attempts).toBe(1);
  const final = await page.evaluate(async ({ tenant, user, id }) => {
    const a = "/src/lib/offline.ts",
      b = "/src/lib/posStorage.ts";
    const { businessStore } = await import(a);
    const { syncSales } = await import(b);
    const db = businessStore(tenant, user);
    try {
      await db.outbox.update(id, { nextAttemptAt: Date.now() - 1 });
      await syncSales(tenant, user);
      return {
        remaining: await db.outbox.count(),
        status: (await db.receipts.get(id)).status,
        payload: (await db.receipts.get(id)).payload,
      };
    } finally {
      db.close();
      await db.delete();
    }
  }, ids);
  expect(attempts).toBe(2);
  expect(final.remaining).toBe(0);
  expect(final.status).toBe("synced");
  expect(final.payload).toEqual(first.payload);
});
