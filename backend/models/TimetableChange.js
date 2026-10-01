const mongoose = require("mongoose");

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timetableChangeSchema = new mongoose.Schema(
  {
    entry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TimetableEntry",
      default: null,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      minlength: 7,
      maxlength: 20,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    changeType: {
      type: String,
      enum: ["Room Change", "Time Change", "Teacher Change", "Cancelled", "Extra Class", "Other"],
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
    },
    division: {
      type: String,
      default: "A",
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 10,
    },
    newStartTime: {
      type: String,
      default: "",
      match: [TIME_REGEX, "New start time must be in HH:mm format."],
    },
    newEndTime: {
      type: String,
      default: "",
      match: [TIME_REGEX, "New end time must be in HH:mm format."],
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },
    newTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    newRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
    },
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

timetableChangeSchema.index({ date: 1, active: 1, course: 1, semester: 1, division: 1 });

module.exports =
  mongoose.models.TimetableChange || mongoose.model("TimetableChange", timetableChangeSchema);
