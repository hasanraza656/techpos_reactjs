import { forwardRef } from "react";
import type { CustomerPayment, SaleDocument } from "../lib/operations";
import { methodLabel } from "../lib/operations";
// Server rows are UTC "YYYY-MM-DD HH:MM:SS"; Safari rejects the space form.
function receiptTime(value: string) {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : iso + "Z");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
// Printed receipts can be handed on; show only the last 4 phone digits.
function shortPhone(phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `···${digits.slice(-4)}` : "";
}
function CustomerLine({
  customer,
}: {
  customer?: { name: string; phone?: string | null } | null;
}) {
  return customer?.name ? (
    <p className="receipt-customer">
      Customer: {customer.name}
      {shortPhone(customer.phone) && (
        <>
          <br />
          <small>Phone: {shortPhone(customer.phone)}</small>
        </>
      )}
    </p>
  ) : null;
}
export const Receipt = forwardRef<
  HTMLDivElement,
  { sale: SaleDocument; pending?: boolean }
>(({ sale, pending = false }, ref) => {
  const credit = sale.payments.some((p) => p.method === "credit");
  return (
    <div className="receipt receipt-paper" ref={ref}>
      <h2>{sale.business_name}</h2>
      <p>
        {sale.branch_name}
        <br />
        <small>
          {sale.receipt_number}
          <br />
          {receiptTime(sale.finalized_at)}
        </small>
      </p>
      <CustomerLine customer={sale.customer} />
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
          {methodLabel(p.method)}: {p.amount}
          {p.verification === "externally_recorded" && (
            <>
              <br />
              <small>
                External payment recorded; no terminal authorization by Tech
                POS.
              </small>
            </>
          )}
        </p>
      ))}
      <p>Change: {sale.change_due}</p>
      {credit && sale.customer?.balance_after != null && (
        <>
          <div className="receipt-rule" />
          <p className="receipt-khata">
            Previous balance: {sale.customer.balance_before ?? "—"}
            <br />
            <strong>New balance: {sale.customer.balance_after}</strong>
            <br />
            <small>Amount on credit is owed to {sale.business_name}.</small>
          </p>
        </>
      )}
      <div className="receipt-rule" />
      <p>
        <small>
          Keep this receipt for your records.
          <br />
          Not a fiscalized FBR invoice. No official submission has been made.
        </small>
      </p>
    </div>
  );
});
/** Printable acknowledgement for a khata collection (wasooli). */
export const PaymentReceipt = forwardRef<
  HTMLDivElement,
  { payment: CustomerPayment; businessName: string; currency: string }
>(({ payment, businessName, currency }, ref) => (
  <div className="receipt receipt-paper" ref={ref}>
    <h2>{businessName}</h2>
    <p>
      {payment.branch}
      <br />
      <small>
        PAYMENT RECEIPT
        <br />
        {payment.receipt_number}
        <br />
        {receiptTime(payment.created_at)}
      </small>
    </p>
    <CustomerLine customer={payment.customer} />
    <div className="receipt-rule" />
    <p className="receipt-total">
      RECEIVED {currency} {payment.amount}
    </p>
    <p>
      Method: {methodLabel(payment.method)}
      {payment.reference && (
        <>
          <br />
          Reference: {payment.reference}
        </>
      )}
      {payment.note && (
        <>
          <br />
          <small>Note: {payment.note}</small>
        </>
      )}
    </p>
    <div className="receipt-rule" />
    <p className="receipt-khata">
      Previous balance: {payment.balance_before}
      <br />
      Paid: −{payment.amount}
      <br />
      <strong>New balance: {payment.balance_after}</strong>
    </p>
    <div className="receipt-rule" />
    <p>
      <small>
        Thank you. Keep this receipt as proof of payment.
        <br />
        Not a fiscalized FBR invoice.
      </small>
    </p>
  </div>
));
