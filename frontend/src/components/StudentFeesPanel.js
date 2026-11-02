import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./FeesManagement.css";

const API = `${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/fees`;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateText = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "—";
const dateTimeText = (value) => value ? new Date(value).toLocaleString("en-IN") : "—";
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const safeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const methodLabel = (method) => ({
  upi: "UPI", card: "Card", netbanking: "Net Banking", wallet: "Wallet",
  emi: "EMI", paylater: "Pay Later", razorpay: "Razorpay"
}[String(method || "").toLowerCase()] || "Online Gateway");

function daysUntil(dateLike) {
  const due = new Date(dateLike);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

function loadRazorpayCheckout() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load secure payment checkout.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Could not load secure payment checkout. Check your internet connection."));
    document.body.appendChild(script);
  });
}

export default function StudentFeesPanel() {
  const [data, setData] = useState({ invoices: [], payments: [], stats: {} });
  const [paymentInfo, setPaymentInfo] = useState({ enabled: false, keyId: "", merchantName: "CampusCore College" });
  const [forms, setForms] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [fees, config] = await Promise.all([
        axios.get(`${API}/my`, { headers: headers() }),
        axios.get(`${API}/config`, { headers: headers() })
      ]);
      setData({ invoices: fees.data.invoices || [], payments: fees.data.payments || [], stats: fees.data.stats || {} });
      setPaymentInfo(config.data || { enabled: false, keyId: "", merchantName: "CampusCore College" });
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load your fee details. Please contact the college office.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dueNotices = useMemo(() => {
    const notices = [];
    for (const invoice of data.invoices) {
      for (const installment of invoice.installments || []) {
        if (installment.status === "paid") continue;
        const days = daysUntil(installment.dueDate);
        if (days <= 7) notices.push({
          id: `${invoice._id}-${installment._id}`,
          title: days < 0 ? "Payment overdue" : days === 0 ? "Due today" : "Upcoming due date",
          text: `${invoice.description} · ${installment.title}`,
          amount: Math.max(0, Number(installment.amount || 0) - Number(installment.paidAmount || 0)),
          dueDate: installment.dueDate,
          days,
          status: days < 0 ? "overdue" : days <= 1 ? "urgent" : "upcoming"
        });
      }
    }
    return notices.sort((a, b) => a.days - b.days);
  }, [data.invoices]);

  const setFormValue = (invoiceId, key, value) => setForms((current) => ({
    ...current, [invoiceId]: { ...(current[invoiceId] || {}), [key]: value }
  }));

  const startPayment = async (invoice) => {
    const form = forms[invoice._id] || {};
    const balance = Number(invoice.balance ?? Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount || 0)));
    const amount = Number(form.amount ?? balance);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      setMessage(`Enter an amount greater than zero and no more than ${money(balance)}.`);
      return;
    }
    if (!paymentInfo.enabled || !paymentInfo.keyId) {
      setMessage("Online payment is not configured. Please contact the college administrator.");
      return;
    }

    setSubmittingId(invoice._id);
    setMessage("Preparing secure checkout…");
    let orderId = "";
    try {
      await loadRazorpayCheckout();
      const orderResponse = await axios.post(`${API}/razorpay/order`, { invoiceId: invoice._id, amount }, { headers: headers() });
      const order = orderResponse.data;
      orderId = order.orderId;
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || "INR",
        name: order.merchantName || paymentInfo.merchantName || "CampusCore College",
        description: order.description || "College Fee Payment",
        order_id: order.orderId,
        image: `${window.location.origin}/CampusCore_Logo_valid1.png`,
        prefill: {
          name: localStorage.getItem("name") || "",
          email: localStorage.getItem("email") || "",
          contact: localStorage.getItem("phone") || ""
        },
        notes: { campuscore_invoice_id: invoice._id },
        theme: { color: "#2454d6" },
        modal: {
          ondismiss: async () => {
            if (orderId) {
              try { await axios.post(`${API}/razorpay/cancel`, { orderId }, { headers: headers() }); } catch (_error) { /* webhook may still confirm a captured transaction */ }
            }
            setSubmittingId("");
            setMessage("Checkout closed. Your fee balance changes only after the gateway confirms payment capture.");
            await load();
          }
        },
        handler: async (response) => {
          try {
            const verified = await axios.post(`${API}/razorpay/verify`, response, { headers: headers() });
            setMessage(verified.data.message || "Payment captured successfully. Your receipt is ready.");
            setForms((current) => ({ ...current, [invoice._id]: { amount: "" } }));
            await load();
          } catch (error) {
            setMessage(error.response?.data?.message || "Payment confirmation is still processing. Refresh this page before trying again.");
            await load();
          } finally {
            setSubmittingId("");
          }
        }
      });
      checkout.on("payment.failed", (event) => {
        const reason = event?.error?.description || event?.error?.reason || "The payment was not completed.";
        setMessage(`${reason} You can retry securely.`);
        setSubmittingId("");
        load();
      });
      checkout.open();
    } catch (error) {
      if (orderId) {
        try { await axios.post(`${API}/razorpay/cancel`, { orderId }, { headers: headers() }); } catch (_error) { /* best-effort cancellation */ }
      }
      setMessage(error.response?.data?.message || error.message || "Could not start online payment.");
      setSubmittingId("");
    }
  };

  const openReceipt = async (payment) => {
    try {
      const response = await axios.get(`${API}/receipt/${payment._id}`, { headers: headers() });
      const record = response.data.payment;
      const student = record.student || {};
      const invoice = record.invoice || {};
      const content = `<!doctype html><html><head><title>${safeText(record.receiptNumber)}</title><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#172033;padding:36px;max-width:760px;margin:auto}h1{margin-bottom:4px;color:#174783}.sub{color:#64748b}.box{border:1px solid #dbe2ea;border-radius:12px;padding:22px;margin-top:24px}.row{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #e2e8f0;padding:12px 0}.row:last-child{border:0}.amount{font-size:26px;font-weight:700}button{padding:10px 18px;border:0;border-radius:8px;background:#174783;color:#fff;margin-top:24px;cursor:pointer}@media print{button{display:none}}</style></head><body><h1>CampusCore</h1><p class="sub">Official Online Fee Payment Receipt</p><div class="box"><div class="row"><span>Receipt Number</span><b>${safeText(record.receiptNumber)}</b></div><div class="row"><span>Student Name</span><b>${safeText(student.name || "")}</b></div><div class="row"><span>Enrollment Number</span><b>${safeText(student.id_no || "")}</b></div><div class="row"><span>Department</span><b>${safeText(invoice.department || student.department || "")}</b></div><div class="row"><span>Course / Semester</span><b>${safeText(invoice.course || student.course || "")} / ${safeText(invoice.semester || student.semester || "")}</b></div><div class="row"><span>Academic Year</span><b>${safeText(invoice.academicYear || "")}</b></div><div class="row"><span>Fee Description</span><b>${safeText(invoice.description || "")}</b></div><div class="row"><span>Payment Method</span><b>${safeText(methodLabel(record.method))}</b></div><div class="row"><span>Gateway Transaction ID</span><b>${safeText(record.gatewayPaymentId || record.reference || "—")}</b></div><div class="row"><span>Paid On</span><b>${safeText(dateTimeText(record.paidAt))}</b></div><div class="row"><span>Amount Paid</span><strong class="amount">${safeText(money(record.amount))}</strong></div></div><p class="sub">This receipt was generated after the payment gateway confirmed successful capture.</p><button onclick="window.print()">Print / Save as PDF</button></body></html>`;
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        setMessage("Allow pop-ups in your browser to open the receipt.");
        return;
      }
      printWindow.document.open();
      printWindow.document.write(content);
      printWindow.document.close();
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not open this receipt.");
    }
  };

  const firstInvoice = data.invoices[0] || {};
  const gatewayPayments = data.payments.filter((payment) => payment.gatewayProvider === "razorpay" || payment.gatewayOrderId || payment.gatewayPaymentId);

  return (
    <section className="cc-fees cc-student-fees">
      <header className="cc-fee-hero cc-fee-student-hero">
        <div>
          <div className="cc-fee-eyebrow"><span className="cc-fee-live-dot" /> STUDENT FEE ACCOUNT</div>
          <h2>My Fees</h2>
          <p>View your fee dues, pay securely online and download receipts.</p>
          {firstInvoice._id && <div className="cc-fee-student-context">{firstInvoice.department || "Department"} <span>•</span> {firstInvoice.course || "Course"} <span>•</span> Academic Year {firstInvoice.academicYear}</div>}
        </div>
        <button type="button" className="cc-fee-button secondary" onClick={load} disabled={loading}>↻ Refresh</button>
      </header>
      {message && <div className="cc-fee-message info" role="status">{message}</div>}

      <div className="cc-fee-stats cc-fee-student-stats">
        <article><span className="cc-fee-stat-icon indigo">₹</span><small>Total Fees</small><strong>{money(data.stats.total)}</strong></article>
        <article><span className="cc-fee-stat-icon green">✓</span><small>Paid</small><strong>{money(data.stats.paid)}</strong></article>
        <article><span className="cc-fee-stat-icon amber">◷</span><small>Outstanding</small><strong>{money(data.stats.balance)}</strong></article>
        <article><span className="cc-fee-stat-icon blue">↗</span><small>Payment Processing</small><strong>{money(data.stats.processing)}</strong></article>
      </div>

      <section className="cc-fee-notice-card">
        <div className="cc-fee-section-head"><div><span className="cc-fee-kicker">DUE DATE REMINDERS</span><h3>Upcoming & Overdue Fees</h3><p className="cc-fee-help">Important installment reminders for the next 7 days are shown here.</p></div><span className="cc-fee-count-pill">{dueNotices.length} notice(s)</span></div>
        <div className="cc-fee-notice-scroll">
          {dueNotices.length ? dueNotices.map((notice) => <article className={`cc-fee-notice ${notice.status}`} key={notice.id}>
            <div><strong>{notice.title}</strong><span>{notice.text}</span></div>
            <div><b>{money(notice.amount)}</b><small>Due {dateText(notice.dueDate)}{notice.days < 0 ? ` · ${Math.abs(notice.days)} day(s) overdue` : notice.days === 0 ? " · Today" : ` · ${notice.days} day(s) left`}</small></div>
          </article>) : <p className="cc-fee-empty">You have no upcoming fee due dates within the next 7 days.</p>}
        </div>
      </section>

      <section className="cc-fee-checkout-banner">
        <div><span className="cc-fee-kicker">SECURE ONLINE CHECKOUT</span><h3>Pay fees online in a few steps</h3><p>Choose an invoice and continue to Razorpay. Available options may include UPI apps, QR, debit/credit cards, net banking and wallets based on merchant settings.</p></div>
        <div className="cc-fee-checkout-points"><span>✓ Secure gateway</span><span>✓ Automatic payment confirmation</span><span>✓ Instant receipt after capture</span></div>
      </section>

      <section className="cc-fee-student-invoices-section">
        <div className="cc-fee-section-head"><div><span className="cc-fee-kicker">YOUR INVOICES</span><h3>Assigned Fee Invoices</h3><p className="cc-fee-help">Pay the full balance or make a partial payment where permitted.</p></div><span className="cc-fee-count-pill">{data.invoices.length} invoice(s)</span></div>
        {loading && <div className="cc-fee-empty-card">Loading your fee information…</div>}
        {!loading && !data.invoices.length && <div className="cc-fee-empty-card">No fee invoices have been assigned to your account yet. Please contact the college office if you think this is incorrect.</div>}
        <div className="cc-fee-invoice-list">
          {data.invoices.map((invoice) => {
            const form = forms[invoice._id] || {};
            const balance = Number(invoice.balance ?? Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount || 0)));
            const amount = Number(form.amount ?? balance);
            return <article className="cc-fee-invoice-card" key={invoice._id}>
              <div className="cc-fee-invoice-head">
                <div><span className="cc-fee-invoice-label">{invoice.academicYear || "ACADEMIC FEE"}</span><h4>{invoice.description}</h4><p>{invoice.department || "Department"} <span>•</span> {invoice.course || "Course"} <span>•</span> Semester {invoice.semester || "—"}</p></div>
                <span className={`cc-fee-status ${invoice.status}`}>{String(invoice.status || "pending").toUpperCase()}</span>
              </div>
              <div className="cc-fee-invoice-amounts">
                <div><small>Total Fee</small><strong>{money(invoice.totalAmount)}</strong></div>
                <div><small>Paid</small><strong className="cc-fee-positive">{money(invoice.paidAmount)}</strong></div>
                <div><small>Outstanding</small><strong className="cc-fee-warning">{money(balance)}</strong></div>
              </div>
              {invoice.components?.length > 0 && <details className="cc-fee-component-details"><summary>View fee breakdown</summary><div>{invoice.components.map((component, index) => <p key={`${component.name}-${index}`}><span>{component.name}</span><strong>{money(component.amount)}</strong></p>)}</div></details>}
              <div className="cc-fee-installments">
                <strong>Installment Schedule</strong>
                {(invoice.installments || []).map((installment) => <div className="cc-fee-installment" key={installment._id}>
                  <span>{installment.title}<small>Due {dateText(installment.dueDate)}</small></span>
                  <span>{money(installment.amount)}<small>{String(installment.status || "pending").toUpperCase()}</small></span>
                </div>)}
              </div>
              {balance > 0 && <div className="cc-fee-payment-form">
                <div><h5>Pay this invoice</h5><p>Payment will be confirmed automatically by the gateway. A receipt is issued after successful capture.</p></div>
                <div className="cc-fee-payment-actions">
                  <label>Payment Amount (INR)<input type="number" min="1" max={balance} step="0.01" value={form.amount ?? balance} onChange={(event) => setFormValue(invoice._id, "amount", event.target.value)} /></label>
                  <button type="button" className="cc-fee-button primary" disabled={submittingId === invoice._id || !paymentInfo.enabled} onClick={() => startPayment(invoice)}>
                    {submittingId === invoice._id ? "Opening checkout…" : `Pay ${money(amount)} securely`}
                  </button>
                </div>
                {!paymentInfo.enabled && <small className="cc-fee-inline-warning">Online checkout is temporarily unavailable. Please contact the college administrator.</small>}
              </div>}
              {balance <= 0 && <div className="cc-fee-paid-banner">✓ This invoice is fully paid. Your receipt is available in Payment History.</div>}
            </article>;
          })}
        </div>
      </section>

      <section className="cc-fee-card cc-fee-payment-history">
        <div className="cc-fee-section-head"><div><span className="cc-fee-kicker">PAYMENT RECORDS</span><h3>Payment History & Receipts</h3><p className="cc-fee-help">Gateway transactions and their automatic receipts appear here.</p></div><span className="cc-fee-count-pill">{gatewayPayments.length} transaction(s)</span></div>
        <div className="cc-fee-table-wrap">
          <table className="cc-fee-table">
            <thead><tr><th>Date</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Gateway Payment ID</th><th>Status</th><th>Receipt</th></tr></thead>
            <tbody>
              {gatewayPayments.map((payment) => <tr key={payment._id}>
                <td>{dateTimeText(payment.paidAt || payment.createdAt)}</td>
                <td>{payment.invoice?.description || "Fee Payment"}</td>
                <td>{money(payment.amount)}</td><td>{methodLabel(payment.method)}</td>
                <td>{payment.gatewayPaymentId || "—"}</td>
                <td><span className={`cc-fee-status ${payment.status}`}>{String(payment.status).toUpperCase()}</span></td>
                <td>{payment.status === "paid" ? <button type="button" className="cc-fee-button secondary compact" onClick={() => openReceipt(payment)}>View / Download</button> : payment.status === "failed" || payment.status === "cancelled" ? "You can retry payment" : "Confirmation in progress"}</td>
              </tr>)}
              {!gatewayPayments.length && <tr><td colSpan="7" className="cc-fee-empty">No online payments yet. Completed transactions and receipts will appear here.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
