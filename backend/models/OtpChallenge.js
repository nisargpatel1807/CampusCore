const mongoose = require("mongoose");
const otpChallengeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  purpose: { type: String, enum: ["password-reset", "email-change"], required: true },
  targetEmail: { type: String, required: true, lowercase: true, trim: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  sentAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date, default: null },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

otpChallengeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
module.exports = mongoose.models.OtpChallenge || mongoose.model("OtpChallenge", otpChallengeSchema);
