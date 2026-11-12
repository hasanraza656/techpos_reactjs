import { forwardRef } from "react";
import type { SaleDocument } from "../lib/operations";
export const Receipt = forwardRef<
  HTMLDivElement,
  { sale: SaleDocument; pending?: boolean }
>(({ sale, pending = false }, ref) => (
  <div className="receipt receipt-paper" ref={ref}>
    <h2>{sale.business_name}</h2>
    <p>
      {sale.branch_name}
      <br />
      <small>
        {sale.receipt_number}
        <br />
        {new Date(
          sale.finalized_at.endsWith("Z")
            ? sale.finalized_at
            : sale.finalized_at + "Z",
        ).toLocaleString()}
      </small>
    </p>
    {pending && (
      <p className="receipt-pending">
        LOCAL RECEIPT · PENDING SERVER SYNC
        <br />
        Prices, permissions and inventory still require server acceptance.
      </p>
    )}
    <div className="receipt-rule" />
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {sale.lines.map((l, i) => (
          <tr key={i}>
            <td>
              {l.name}
              <br />
              <small>{l.unit_price} each</small>
            </td>
            <td>{l.quantity}</td>
            <td>{l.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="receipt-rule" />
    <p>
      Marked subtotal: {sale.subtotal}
      <br />
      Item discounts: {sale.line_discount}
      <br />
      Cart discount: {sale.cart_discount}
      <br />
      Tax breakdown: {sale.tax_total}
    </p>
    <p className="receipt-total">
      TOTAL {sale.currency} {sale.total}
    </p>
    {sale.payments.map((p, i) => (
      <p key={i}>
        {p.method.replaceAll("_", " ")}: {p.amount}
        {p.verification === "externally_recorded" && (
          <>
            <br />
            <small>
              External payment recorded; no terminal authorization by Tech POS.
            </small>
          </>
        )}
      </p>
    ))}
    <p>Change: {sale.change_due}</p>
    <div className="receipt-rule" />
    <p>
      <small>
        Keep this receipt for your records.
        <br />
        Not a fiscalized FBR invoice. No official submission has been made.
      </small>
    </p>
  </div>
));
