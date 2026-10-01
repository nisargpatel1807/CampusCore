const mongoose = require("mongoose");

const CALENDAR_EVENT_COLORS = {
  "Holiday": "#16A34A",
  "Internal Exam": "#DC2626",
  "External Exam": "#EA580C",
  "Event": "#2563EB",
  "Seminar": "#7C3AED",
  "Sports Event": "#9333EA",
  "Hackathon": "#0891B2",
  "Workshop": "#CA8A04",
  "Assignment Deadline": "#0EA5E9",
  "Quiz": "#DB2777",
  "Other": "#64748B",
  "General Event": "#2563EB",
};

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
    default: "#2563EB",
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

calendarEventSchema.pre("validate", function(next) {
  this.color = CALENDAR_EVENT_COLORS[this.category] || CALENDAR_EVENT_COLORS.Other;
  next();
});

module.exports =
  mongoose.models.CalendarEvent ||
  mongoose.model("CalendarEvent", calendarEventSchema);
