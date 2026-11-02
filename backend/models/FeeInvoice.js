const mongoose = require("mongoose");

const installmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  amount: { type: Number, required: true, min: 1 },
  dueDate: { type: Date, required: true },
  paidAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["pending", "partial", "paid", "overdue"], default: "pending" },
  reminderKeys: { type: [String], default: [] }
}, { _id: true });

const feeInvoiceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  academicYear: { type: String, required: true, trim: true, maxlength: 20 },
  department: { type: String, default: "", trim: true, maxlength: 100 },
  course: { type: String, default: "", trim: true, maxlength: 100 },
  semester: { type: Number, default: null, min: 1, max: 20 },
  description: { type: String, required: true, trim: true, maxlength: 160 },
  components: [{
    name: { type: String, required: true, trim: true, maxlength: 100 },
    amount: { type: Number, required: true, min: 0 }
  }],
  totalAmount: { type: Number, required: true, min: 1 },
  installments: { type: [installmentSchema], default: [] },
  paidAmount: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["pending", "partial", "paid", "overdue"], default: "pending", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  assignmentBatch: { type: String, default: "" }
}, { timestamps: true });

feeInvoiceSchema.index({ student: 1, academicYear: 1, course: 1, semester: 1 });
module.exports = mongoose.models.FeeInvoice || mongoose.model("FeeInvoice", feeInvoiceSchema);
