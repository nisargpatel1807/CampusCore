const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "Announcement",
        "Hackathon",
        "Sports Event",
        "Seminar",
        "Workshop",
        "Cultural Event",
        "Exam",
        "Fees",
        "Holiday",
        "Circular",
        "Important Notice",
        "Other",
      ],
    },

    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 5000,
    },

    eventDate: {
      type: Date,
      default: null,
    },

    startTime: {
      type: String,
      default: "",
      maxlength: 20,
    },

    endTime: {
      type: String,
      default: "",
      maxlength: 20,
    },

    venue: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },

    audience: {
      type: String,
      enum: ["students", "teachers", "all"],
      default: "students",
      required: true,
    },

    targetCourse: {
      type: String,
      default: "ALL",
      trim: true,
      maxlength: 120,
    },

    targetSemester: {
      type: Number,
      default: 0,
      min: 0,
      max: 20,
    },

    attachmentUrl: {
      type: String,
      default: "",
      maxlength: 300,
    },

    attachmentName: {
      type: String,
      default: "",
      maxlength: 180,
    },

    attachmentType: {
      type: String,
      default: "",
      maxlength: 100,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

noticeSchema.index({
  eventDate: 1,
  createdAt: -1,
});

noticeSchema.index({
  audience: 1,
  targetCourse: 1,
  targetSemester: 1,
});

const Notice =
  mongoose.models.Notice ||
  mongoose.model("Notice", noticeSchema);

module.exports = Notice;