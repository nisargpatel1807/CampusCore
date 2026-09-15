const mongoose = require("mongoose");

const calendarEventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 160,
  },

  date: {
    type: Date,
    required: true,
  },

  category: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
  },

  customCategory: {
    type: String,
    default: "",
    trim: true,
    maxlength: 80,
  },

  color: {
    type: String,
    default: "#3B82F6",
    match: [/^#[0-9A-Fa-f]{6}$/, "Color must be a valid 6-digit hex color."],
  },

  targetCourse: {
    type: String,
    default: "ALL",
    trim: true,
    maxlength: 100,
  },

  targetSemester: {
    type: Number,
    default: 0,
    min: 0,
    max: 20,
  },

  targetRoles: {
    type: [String],
    enum: ["admin", "teacher", "student"],
    default: ["admin", "teacher", "student"],
  },
}, { timestamps: true });

module.exports =
  mongoose.models.CalendarEvent ||
  mongoose.model("CalendarEvent", calendarEventSchema);
