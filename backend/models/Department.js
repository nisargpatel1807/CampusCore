const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
  departmentCode: {
    type: String, required: [true, "Department code is required."],
    unique: true, trim: true, uppercase: true, minlength: 2, maxlength: 20,
    match: [/^[A-Z0-9-]+$/, "Department code may contain only letters, numbers, and hyphens."]
  },
  departmentName: {
    type: String, required: [true, "Department name is required."],
    unique: true, trim: true, minlength: 2, maxlength: 100
  },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  status: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.Department || mongoose.model("Department", departmentSchema);
