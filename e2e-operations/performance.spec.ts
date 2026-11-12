import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import { cartTotals } from "../src/lib/decimal";

test("record local indexed barcode and exact cart calculation measurements", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  const lookup = await page.evaluate(async () => {
    const name = "techpos:isolated-benchmark";
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("barcodes", { keyPath: "barcode" });
      open.result.createObjectStore("products", { keyPath: "public_id" });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const write = db.transaction(["products", "barcodes"], "readwrite");
    for (let i = 0; i < 10000; i++) {
      write
        .objectStore("barcodes")
        .put({ barcode: `QA-${i}`, product: `P-${i}` });
      write.objectStore("products").put({
        public_id: `P-${i}`,
        name: `Test-only ${i}`,
        selling_price: "25.00",
      });
    }
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
    });
    const get = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const durations: number[] = [];
    let found = 0;
    for (let i = 0; i < 300; i++) {
      const start = performance.now();
      const transaction = db.transaction(["barcodes", "products"], "readonly");
      const barcode = await get(
        transaction.objectStore("barcodes").get(`QA-${(i * 7919) % 10000}`),
      );
      const product = await get(
        transaction.objectStore("products").get(barcode.product),
      );
      if (product) found++;
      durations.push(performance.now() - start);
    }
    db.close();
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase(name);
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
    durations.sort((a, b) => a - b);
    return {
      found,
      catalog_size: 10000,
      iterations: durations.length,
      p50_ms: durations[150],
      p95_ms: durations[285],
      max_ms: durations[299],
      browser_user_agent: navigator.userAgent,
    };
  });
  const lines = Array.from({ length: 100 }, () => ({
    quantity: "1.500",
    discount: "0.00",
    product: {
      selling_price: "112.00",
      wholesale_price: null,
      tax_rate: "12.0000",
      tax_inclusive: true,
    },
  }));
  const timings: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    const result = cartTotals(lines, "0.00");
    expect(result.total).toBe("16800.00");
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const result = {
    recorded_at: new Date().toISOString(),
    conditions:
      "Headless Chromium on this Windows host. IndexedDB barcode+product primary-key lookup on isolated 10,000-record stores (native IDB, excluding Dexie wrapper/filter/UI overhead). Cart measures actual shared BigInt calculator in Node with 100 lines; excludes React/render/DOM. These are local observations, not device guarantees.",
    host: {
      cpu: cpus()[0]?.model,
      logical_cpus: cpus().length,
      platform: platform(),
      arch: arch(),
      node: process.version,
      browser: browser.version(),
    },
    lookup,
    cart: {
      iterations: 1000,
      lines: 100,
      p50_ms: timings[500],
      p95_ms: timings[950],
      max_ms: timings[999],
    },
  };
  expect(lookup.found).toBe(300);
  writeFileSync(
    "../.tools/pos-benchmarks.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
});
