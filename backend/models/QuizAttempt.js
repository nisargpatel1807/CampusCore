const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    score: { type: Number, required: true, min: 0 },
    totalQuestions: { type: Number, required: true, min: 1 },
    answers: [{ type: Number }],
    submissionReason: {
      type: String,
      enum: ["normal", "timeout", "tab_switch"],
      default: "normal",
    },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);


module.exports =
  mongoose.models.QuizAttempt || mongoose.model("QuizAttempt", quizAttemptSchema);
