const mongoose = require("mongoose");

const studyPlanSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    mode: {
      type: String,
      enum: ["exam", "regular"],
      required: true,
    },

    examTimetableFile: {
      fileName: { type: String, default: "" },
      filePath: { type: String, default: "" },
      fileType: { type: String, default: "" },
      uploadedAt: { type: Date, default: null },
    },

    planStartDate: {
      type: Date,
      default: null,
      required: function () {
        return this.status === "generated";
      },
    },

    planDays: {
      type: Number,
      min: 1,
      max: 7,
      default: 7,
      required: function () {
        return this.status === "generated";
      },
    },

    planEndDate: {
      type: Date,
      default: null,
      required: function () {
        return this.status === "generated";
      },
    },

    targetMarks: {
      type: Number,
      min: 1,
      max: 100,
      required: true,
    },

    dailyStudyMinutes: {
      type: Number,
      min: 30,
      max: 1440,
      required: true,
    },

    subjects: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
          maxlength: 100,
        },
        progress: {
          type: Number,
          min: 0,
          max: 100,
          required: true,
        },
        selected: {
          type: Boolean,
          default: true,
        },
      },
    ],

    pendingAssignments: [
      {
        title: { type: String, trim: true },
        subject: { type: String, trim: true },
        dueDate: { type: Date, default: null },
      },
    ],

    examSchedule: [
      {
        subject: {
          type: String,
          trim: true,
          required: true,
        },
        examDate: {
          type: Date,
          required: true,
        },
      },
    ],

    plan: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    completedTasks: {
      type: [String],
      default: [],
    },

    adaptiveReplan: {
      lastReplannedAt: {
        type: Date,
        default: null,
      },

      missedDays: {
        type: Number,
        default: 0,
        min: 0,
      },

      replanHistory: {
        type: [
          {
            replannedAt: {
              type: Date,
              default: Date.now,
            },
            missedDate: {
              type: String,
              default: "",
              trim: true,
            },
            reason: {
              type: String,
              default: "Student could not study today",
              trim: true,
            },
            missedMinutes: {
              type: Number,
              default: 0,
              min: 0,
            },
            approvedDailyMinutes: {
              type: Number,
              default: null,
              min: 30,
              max: 1440,
            },
          },
        ],
        default: [],
      },
    },

    status: {
      type: String,
      enum: ["draft", "generated", "completed"],
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.StudyPlan ||
  mongoose.model("StudyPlan", studyPlanSchema);
