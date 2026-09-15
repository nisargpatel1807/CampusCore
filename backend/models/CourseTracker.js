const mongoose = require("mongoose");

const subUnitSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const unitSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    order: { type: Number, default: 0 },
    subUnits: { type: [subUnitSchema], default: [] },
  },
  { _id: true }
);

const courseTrackerSchema = new mongoose.Schema(
  {
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      unique: true,
      index: true,
    },
    units: { type: [unitSchema], default: [] },
    // Faculty-controlled syllabus completion status. Keys are unitIndex-subUnitIndex.
    completedSubUnits: { type: [String], default: [] },
    published: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CourseTracker || mongoose.model("CourseTracker", courseTrackerSchema);
