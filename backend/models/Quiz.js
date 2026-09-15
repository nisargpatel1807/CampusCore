const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
  options: { type: [{ type: String, trim: true, maxlength: 200 }], required: true, validate: { validator: (value) => Array.isArray(value) && value.length === 4 && value.every((v) => String(v).trim().length > 0), message: "Each question must have exactly 4 non-empty options." } },
  correctAnswer: { type: Number, required: true, min: 0, max: 3 },
});

const quizSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  questions: { type: [questionSchema], validate: { validator: (value) => Array.isArray(value) && value.length >= 1 && value.length <= 100, message: "Quiz must contain between 1 and 100 questions." } },
  timeLimitMinutes: { type: Number, default: 10, min: 1, max: 180 },
  openDate: { type: Date, required: true, default: Date.now },
  closeDate: { type: Date, required: true },
  dueDate: { type: Date, required: false },
}, { timestamps: true });

module.exports = mongoose.models.Quiz || mongoose.model("Quiz", quizSchema);
