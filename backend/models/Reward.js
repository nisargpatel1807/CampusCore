const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema(
    {
        student_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        points: {
            type: Number,
            default: 0
        },

        badge: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Reward", rewardSchema);