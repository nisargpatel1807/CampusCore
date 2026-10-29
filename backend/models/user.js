const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, "Full name is required."], trim: true, minlength: [2, "Name must be at least 2 characters long."], maxlength: [100, "Name must be at most 100 characters long."] },
  surname: { type: String, trim: true, uppercase: true, maxlength: 50, default: "" },
  firstName: { type: String, trim: true, uppercase: true, maxlength: 50, default: "" },
  secondName: { type: String, trim: true, uppercase: true, maxlength: 50, default: "" },
  lastName: { type: String, trim: true, uppercase: true, maxlength: 50, default: "" },
  id_no: { type: String, required: [true, "ID / enrollment number is required."], unique: true, trim: true, minlength: [3, "ID must be at least 3 characters long."], maxlength: [30, "ID must be at most 30 characters long."], match: [/^[A-Za-z0-9_-]+$/, "ID may contain only letters, numbers, hyphens, and underscores."] },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 160, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  phone: { type: String, default: "", trim: true, maxlength: 30 },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "teacher", "student"], required: true },
  department: { type: String, default: "General", trim: true, maxlength: 100 },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
  course: { type: String, default: "General", trim: true, maxlength: 100 },
  year: { type: String, default: "1st Year", trim: true, maxlength: 30 },
  semester: { type: Number, default: 1, min: 1, max: 20 },
  division: { type: String, default: "", trim: true, uppercase: true, maxlength: 10 },
  status: { type: Boolean, default: true },
  profilePhoto: { type: String, default: "", maxlength: 300 }
}, { timestamps: true });

userSchema.pre("validate", function(next) {
  this.surname = String(this.surname || "").trim().toUpperCase();
  this.firstName = String(this.firstName || "").trim().toUpperCase();
  this.secondName = String(this.secondName || "").trim().toUpperCase();
  this.lastName = String(this.lastName || "").trim().toUpperCase();
  const parts = [this.surname, this.firstName, this.secondName].filter(Boolean);
  if (parts.length) this.name = parts.join(" ");
  else if (this.firstName || this.lastName) this.name = [this.firstName, this.lastName].filter(Boolean).join(" ");
  if (this.division) this.division = String(this.division).trim().toUpperCase();
  else this.division = "";
  next();
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
