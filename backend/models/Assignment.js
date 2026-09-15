const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: [true, "Assignment title is required."], trim: true, minlength: 3, maxlength: 120 },
  description: { type: String, default: "", trim: true, maxlength: 3000 },
  fileUrl: { type: String, default: "" },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  publishDate: { type: Date, required: true, default: Date.now },
  dueDate: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.models.Assignment || mongoose.model("Assignment", assignmentSchema);
