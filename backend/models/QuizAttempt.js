const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    score: { type: Number, default: 0, min: 0 },
    totalQuestions: { type: Number, default: 0, min: 0 },
    answers: [{ type: Number }],
    // Stable server-generated order saved when the student starts.
    questionOrder: [{ type: Number }],
    optionOrders: [[{ type: Number }]],
    status: { type: String, enum: ["in_progress", "submitted"], default: "submitted" },
    startedAt: { type: Date },
    expiresAt: { type: Date },
    submissionReason: { type: String, enum: ["normal", "timeout", "tab_switch"], default: "normal" },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Existing submitted records remain valid; this index prevents duplicate attempts.
quizAttemptSchema.index({ quiz: 1, student: 1 }, { unique: true });

module.exports = mongoose.models.QuizAttempt || mongoose.model("QuizAttempt", quizAttemptSchema);
