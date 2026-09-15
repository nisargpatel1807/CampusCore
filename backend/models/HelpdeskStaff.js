const mongoose = require("mongoose");

const helpdeskStaffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true, maxlength: 160 },
    mobile: { type: String, default: "", trim: true, maxlength: 30 },
    department: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.HelpdeskStaff || mongoose.model("HelpdeskStaff", helpdeskStaffSchema);
