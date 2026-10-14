const mongoose = require("mongoose");
const divisionSchema = new mongoose.Schema({
  course: { type: String, required: true, trim: true },
  semester: { type: Number, required: true, min: 1, max: 20 },
  name: { type: String, required: true, trim: true, uppercase: true, maxlength: 10 },
  capacity: { type: Number, min: 1, max: 500, default: 60 },
  active: { type: Boolean, default: true }
}, { timestamps: true });
divisionSchema.index({ course: 1, semester: 1, name: 1 }, { unique: true });
module.exports = mongoose.models.Division || mongoose.model("Division", divisionSchema);
