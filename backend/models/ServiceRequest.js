const mongoose = require("mongoose");

const helpdeskHistorySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, maxlength: 80 },
    fromStatus: { type: String, default: "", maxlength: 60 },
    toStatus: { type: String, default: "", maxlength: 60 },
    actorType: { type: String, enum: ["student", "admin", "staff", "system"], required: true },
    actorName: { type: String, default: "System", maxlength: 120 },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "HelpdeskStaff", default: null },
    note: { type: String, default: "", maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const serviceRequestSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: {
      type: String,
      enum: [
        "Projector Issue",
        "Computer Breakdown",
        "Fan / AC Problem",
        "Classroom Light",
        "Washroom Maintenance",
        "Wi-Fi Connectivity",
      ],
      required: true,
    },
    location: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    photoUrl: { type: String, default: "" },
    photoUrls: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["Pending Review", "Assigned", "In Progress", "Awaiting Verification", "Fixed", "Rejected"],
      default: "Pending Review",
      index: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: "HelpdeskStaff", default: null },
    assignedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    verificationSubmittedAt: { type: Date, default: null },
    fixedAt: { type: Date, default: null },
    adminNote: { type: String, default: "", maxlength: 1000 },
    staffNote: { type: String, default: "", maxlength: 1000 },
    resolutionNote: { type: String, default: "", maxlength: 1000 },
    resolutionPhotos: { type: [String], default: [] },
    rejectionReason: { type: String, default: "", maxlength: 500 },
    history: { type: [helpdeskHistorySchema], default: [] },
  },
  { timestamps: true },
);

serviceRequestSchema.index({ student: 1, createdAt: -1 });
serviceRequestSchema.index({ assignedStaff: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.ServiceRequest || mongoose.model("ServiceRequest", serviceRequestSchema);
