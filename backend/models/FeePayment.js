const mongoose = require("mongoose");

const feePaymentSchema = new mongoose.Schema({
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: "FeeInvoice", required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  method: {
    type: String,
    enum: ["razorpay", "upi", "bank_transfer", "card", "netbanking", "wallet", "emi", "paylater", "cash", "cheque", "other"],
    required: true
  },
  status: {
    type: String,
    enum: ["initiated", "pending", "paid", "failed", "cancelled", "rejected", "refunded"],
    default: "initiated",
    index: true
  },
  reference: { type: String, default: "", trim: true, maxlength: 120 },
  receiptNumber: { type: String, unique: true, sparse: true, trim: true },
  gatewayProvider: { type: String, default: "", trim: true },
  gatewayOrderId: { type: String, default: undefined, trim: true },
  gatewayPaymentId: { type: String, default: undefined, trim: true },
  gatewaySignature: { type: String, default: "", select: false },
  gatewayStatus: { type: String, default: "", trim: true },
  gatewayError: { type: String, default: "", trim: true, maxlength: 500 },
  submittedAt: { type: Date, default: Date.now },
  paidAt: { type: Date, default: null },
  verificationNote: { type: String, default: "", trim: true, maxlength: 500 },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

feePaymentSchema.index({ reference: 1, status: 1 });
feePaymentSchema.index({ gatewayOrderId: 1 }, { unique: true, sparse: true });
feePaymentSchema.index({ gatewayPaymentId: 1 }, { unique: true, sparse: true });
module.exports = mongoose.models.FeePayment || mongoose.model("FeePayment", feePaymentSchema);
