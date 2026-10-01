const mongoose = require("mongoose");

const classroomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      minlength: 2,
      maxlength: 30,
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    building: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    floor: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    roomType: {
      type: String,
      enum: ["Classroom", "Computer Lab", "Laboratory", "Seminar Hall", "Auditorium", "Other"],
      default: "Classroom",
    },
    capacity: {
      type: Number,
      default: 0,
      min: 0,
      max: 5000,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Classroom || mongoose.model("Classroom", classroomSchema);
