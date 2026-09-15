const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientRole: { type: String, enum: ["admin", "teacher", "student"], required: true, index: true },
    type: { type: String, required: true, trim: true, maxlength: 50 },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
    message: { type: String, required: true, trim: true, minlength: 2, maxlength: 1000 },
    link: { type: String, default: "", maxlength: 300 },
    attachmentUrl: { type: String, default: "", maxlength: 300 },
    attachmentName: { type: String, default: "", maxlength: 180 },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
