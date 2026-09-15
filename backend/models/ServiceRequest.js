const mongoose = require("mongoose");

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
      enum: ["Assigned", "In Progress", "Awaiting Verification", "Fixed", "Rejected"],
      default: "Assigned",
      index: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: "HelpdeskStaff", default: null },
    adminNote: { type: String, default: "", maxlength: 1000 },
    staffNote: { type: String, default: "", maxlength: 1000 },
    rejectionReason: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.ServiceRequest || mongoose.model("ServiceRequest", serviceRequestSchema);
