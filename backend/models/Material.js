const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Title is required."], trim: true, minlength: 3, maxlength: 150 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileUrl: { type: String, required: [true, "File URL is required."] },
    fileType: { type: String, default: "document", maxlength: 30 },
    fileSize: { type: Number, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Material || mongoose.model("Material", materialSchema);
