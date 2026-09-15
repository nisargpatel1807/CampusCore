const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  subjectName: {
    type: String,
    required: [true, "Subject name is required."],
    trim: true,
    minlength: [2, "Subject name must be at least 2 characters long."],
    maxlength: [100, "Subject name must be at most 100 characters long."],
  },
  subjectCode: {
    type: String,
    required: [true, "Subject code is required."],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [2, "Subject code must be at least 2 characters long."],
    maxlength: [20, "Subject code must be at most 20 characters long."],
    match: [/^[A-Z0-9-]+$/, "Subject code may contain only letters, numbers, and hyphens."],
  },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  semester: { type: Number, default: 1, min: 1, max: 20 },
  credits: { type: Number, default: 4, min: 1, max: 10 },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

module.exports = mongoose.models.Subject || mongoose.model("Subject", subjectSchema);
