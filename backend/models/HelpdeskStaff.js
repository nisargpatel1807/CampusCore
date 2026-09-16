const mongoose = require("mongoose");

const helpdeskStaffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    // Optional at schema level so old staff documents remain valid until Admin
    // gives them login credentials. New staff are required to get these from
    // the Admin API.
    staffId: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 30,
      unique: true,
      sparse: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      maxlength: 160,
    },

    // Never return this field from normal queries. It stores only a bcrypt hash.
    password: {
      type: String,
      default: "",
      select: false,
    },

    mobile: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30,
    },

    department: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
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
  mongoose.models.HelpdeskStaff ||
  mongoose.model("HelpdeskStaff", helpdeskStaffSchema);
