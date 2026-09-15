const mongoose = require("mongoose");

const courseProgressSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    completedSubUnits: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

courseProgressSchema.index({ student: 1, subject: 1 }, { unique: true });

module.exports =
  mongoose.models.CourseProgress || mongoose.model("CourseProgress", courseProgressSchema);
