const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  courseName: {
    type: String,
    required: [true, "Course name is required."],
    unique: true,
    trim: true,
    minlength: [3, "Course name must be at least 3 characters long."],
    maxlength: [100, "Course name must be at most 100 characters long."],
  },
  courseCode: {
    type: String,
    required: [true, "Course code is required."],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [2, "Course code must be at least 2 characters long."],
    maxlength: [20, "Course code must be at most 20 characters long."],
    match: [/^[A-Z0-9-]+$/, "Course code may contain only letters, numbers, and hyphens."],
  },
  durationYears: {
    type: Number,
    default: 3,
    min: [1, "Duration must be at least 1 year."],
    max: [5, "Duration cannot exceed 5 years."],
  },
}, { timestamps: true });

module.exports = mongoose.models.Course || mongoose.model("Course", courseSchema);
