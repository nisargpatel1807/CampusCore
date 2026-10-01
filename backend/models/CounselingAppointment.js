const mongoose = require("mongoose");

const counselingAppointmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 300,
    },
    details: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1500,
    },
    requestedStart: {
      type: Date,
      required: true,
    },
    requestedEnd: {
      type: Date,
      required: true,
    },
    scheduledStart: {
      type: Date,
      default: null,
    },
    scheduledEnd: {
      type: Date,
      default: null,
    },
    location: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
    teacherMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    studentMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "PROPOSED",
        "CONFIRMED",
        "REJECTED",
        "CANCELLED",
        "COMPLETED",
        "NO_SHOW",
      ],
      default: "REQUESTED",
      index: true,
    },
  },
  { timestamps: true }
);

counselingAppointmentSchema.index({ teacher: 1, scheduledStart: 1, scheduledEnd: 1 });
counselingAppointmentSchema.index({ student: 1, scheduledStart: 1, scheduledEnd: 1 });

module.exports =
  mongoose.models.CounselingAppointment ||
  mongoose.model("CounselingAppointment", counselingAppointmentSchema);
