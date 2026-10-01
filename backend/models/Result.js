const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
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

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    academicYear: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
      index: true,
    },

    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
      index: true,
    },

    credit: {
      type: Number,
      required: true,
      min: 0,
      max: 20,
    },

    // Raw marks entered by the administrator/teacher.
    cec: {
      type: Number,
      default: null,
      min: 0,
      max: 30,
    },

    midterm: {
      type: Number,
      default: null,
      min: 0,
      max: 50,
    },

    external: {
      type: Number,
      default: null,
      min: 0,
      max: 70,
    },

    // Converted contributions to the final 100-mark result.
    cecWeighted: {
      type: Number,
      default: null,
      min: 0,
      max: 30,
    },

    midtermWeighted: {
      type: Number,
      default: null,
      min: 0,
      max: 20,
    },

    externalWeighted: {
      type: Number,
      default: null,
      min: 0,
      max: 50,
    },

    total: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    maxTotal: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },

    percentage: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    grade: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5,
    },

    gradePoint: {
      type: Number,
      default: null,
      min: 0,
      max: 10,
    },

    // Grade Point × Credit.
    gpe: {
      type: Number,
      default: null,
      min: 0,
    },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },

    cecEnteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

resultSchema.index(
  { student: 1, subject: 1, academicYear: 1, semester: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.Result || mongoose.model("Result", resultSchema);
