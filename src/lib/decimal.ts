// All financial arithmetic uses scaled integers. Number is only used for UI counts/timers.
export function scaled(value: string, precision = 2): bigint {
  if (!new RegExp(`^-?\\d+(?:\\.\\d{0,${precision}})?$`).test(value))
    throw new Error(`Use a decimal with at most ${precision} places.`);
  const negative = value.startsWith("-");
  const [whole, dec = ""] = (negative ? value.slice(1) : value).split(".");
  const amount =
    BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(dec.padEnd(precision, "0") || "0");
  return negative ? -amount : amount;
}
export function formatted(value: bigint, precision = 2): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const power = 10n ** BigInt(precision);
  return `${negative ? "-" : ""}${abs / power}${precision ? "." + (abs % power).toString().padStart(precision, "0") : ""}`;
}
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Invalid calculation denominator.");
  return numerator < 0n
    ? -roundRatio(-numerator, denominator)
    : (numerator + denominator / 2n) / denominator;
}
export function linePrice(
  product: { selling_price: string; wholesale_price: string | null },
  tier?: string,
): string {
  return tier === "wholesale" && product.wholesale_price !== null
    ? product.wholesale_price
    : product.selling_price;
}
export function cartTotals(
  lines: {
    quantity: string;
    discount: string;
    product: {
      selling_price: string;
      wholesale_price: string | null;
      tax_rate: string;
      tax_inclusive: boolean;
    };
  }[],
  discount: string,
  tier = "retail",
) {
  if (lines.some((l) => scaled(l.quantity, 3) <= 0n))
    throw new Error("Quantity must be greater than zero.");
  const subs = lines.map((l) =>
    roundRatio(
      scaled(l.quantity, 3) * scaled(linePrice(l.product, tier)),
      1000n,
    ),
  );
  const discounts = lines.map((l) => scaled(l.discount || "0"));
  if (discounts.some((v) => v < 0n))
    throw new Error("Discount cannot be negative.");
  const bases = subs.map((s, i) => s - discounts[i]);
  if (bases.some((v) => v < 0n))
    throw new Error("Item discount exceeds its subtotal.");
  const base = bases.reduce((a, b) => a + b, 0n);
  const cart = scaled(discount || "0");
  if (cart < 0n || cart > base)
    throw new Error("Cart discount exceeds the sale amount.");
  let remainder = cart;
  const allocations = bases.map((b, i) => {
    const allocation =
      i === bases.length - 1 ? remainder : base > 0n ? (cart * b) / base : 0n;
    remainder -= allocation;
    return allocation;
  });
  // Mirrors SaleCalculator.php: truncated shares can leave the last line a remainder
  // larger than its own base (e.g. a free last item). Move the excess to earlier lines
  // with room so no line goes negative and client totals equal the server's.
  const last = bases.length - 1;
  let excess = last >= 0 ? allocations[last] - bases[last] : 0n;
  if (excess > 0n) {
    allocations[last] = bases[last];
    for (let i = 0; i < allocations.length && excess > 0n; i++) {
      const room = bases[i] - allocations[i];
      const take = room < excess ? room : excess;
      allocations[i] += take;
      excess -= take;
    }
  }
  const rows = lines.map((l, i) => {
    const allocation = allocations[i];
    const amount = bases[i] - allocation;
    const rate = scaled(l.product.tax_rate, 4);
    const tax = l.product.tax_inclusive
      ? amount - roundRatio(amount * 1000000n, 1000000n + rate)
      : roundRatio(amount * rate, 1000000n);
    return {
      subtotal: formatted(subs[i]),
      line_discount: formatted(discounts[i]),
      cart_discount: formatted(allocation),
      tax: formatted(tax),
      total: formatted(l.product.tax_inclusive ? amount : amount + tax),
    };
  });
  return {
    rows,
    subtotal: formatted(subs.reduce((a, b) => a + b, 0n)),
    line_discount: formatted(discounts.reduce((a, b) => a + b, 0n)),
    cart_discount: formatted(cart),
    tax_total: formatted(rows.reduce((a, r) => a + scaled(r.tax), 0n)),
    total: formatted(rows.reduce((a, r) => a + scaled(r.total), 0n)),
  };
}
