const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, "Full name is required."], trim: true, minlength: [2, "Name must be at least 2 characters long."], maxlength: [100, "Name must be at most 100 characters long."] },
  id_no: { type: String, required: [true, "ID / enrollment number is required."], unique: true, trim: true, minlength: [3, "ID must be at least 3 characters long."], maxlength: [30, "ID must be at most 30 characters long."], match: [/^[A-Za-z0-9_-]+$/, "ID may contain only letters, numbers, hyphens, and underscores."] },
  email: { type: String, required: [true, "Email is required."], unique: true, trim: true, lowercase: true, maxlength: [160, "Email must be at most 160 characters long."], match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address."] },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "teacher", "student"], required: true },
  department: { type: String, default: "General", trim: true, maxlength: [100, "Department is too long."] },
  course: { type: String, default: "General", trim: true, maxlength: [100, "Course is too long."] },
  year: { type: String, default: "1st Year", trim: true, maxlength: [30, "Year is too long."] },
  semester: { type: Number, default: 1, min: [1, "Semester must be at least 1."], max: [20, "Semester is out of range."] },
  division: { type: String, default: "A", trim: true, maxlength: [10, "Division is too long."] },
  status: { type: Boolean, default: true },
  profilePhoto: { type: String, default: "", maxlength: 300 },
}, { timestamps: true });
module.exports = mongoose.models.User || mongoose.model("User", userSchema);
