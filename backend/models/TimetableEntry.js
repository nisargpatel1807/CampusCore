const mongoose = require("mongoose");

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timetableEntrySchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: true,
      trim: true,
      minlength: 7,
      maxlength: 20,
    },
    dayOfWeek: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      required: true,
    },
    startTime: {
      type: String,
      required: true,
      match: [TIME_REGEX, "Start time must be in HH:mm format."],
    },
    endTime: {
      type: String,
      required: true,
      match: [TIME_REGEX, "End time must be in HH:mm format."],
    },
    type: {
      type: String,
      enum: ["Lecture", "Lab", "Practical", "Seminar", "Workshop", "Activity", "Break", "Other"],
      default: "Lecture",
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
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

timetableEntrySchema.index({ academicYear: 1, dayOfWeek: 1, course: 1, semester: 1, division: 1, active: 1 });
timetableEntrySchema.index({ academicYear: 1, dayOfWeek: 1, teacher: 1, active: 1 });
timetableEntrySchema.index({ academicYear: 1, dayOfWeek: 1, room: 1, active: 1 });

module.exports =
  mongoose.models.TimetableEntry || mongoose.model("TimetableEntry", timetableEntrySchema);
