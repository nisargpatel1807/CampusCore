const mongoose = require("mongoose");

const assessmentSchemeSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
      index: true,
    },

    academicYear: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
      index: true,
    },

    // Fixed raw assessment maxima.
    cecMax: {
      type: Number,
      default: 30,
      min: 0,
      max: 100,
    },

    midtermMax: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },

    externalMax: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },

    // Fixed contribution to the final 100-mark result.
    cecWeight: {
      type: Number,
      default: 30,
      min: 0,
      max: 100,
    },

    midtermWeight: {
      type: Number,
      default: 20,
      min: 0,
      max: 100,
    },

    externalWeight: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },

    passingPercent: {
      type: Number,
      default: 40,
      min: 0,
      max: 100,
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

assessmentSchemeSchema.index(
  { course: 1, semester: 1, academicYear: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.AssessmentScheme ||
  mongoose.model("AssessmentScheme", assessmentSchemeSchema);
