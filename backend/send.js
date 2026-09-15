const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./models/User");

const users = [
    {
        name: "CampusCore Admin",
        id_no: "ADMIN001",
        password: "admin123",
        role: "admin"
    },
    {
        name: "Urvish Student",
        id_no: "STU001",
        password: "student123",
        role: "student",
        course: "MCA",
        year: 2
    },
    {
        name: "CampusCore Teacher",
        id_no: "TEA001",
        password: "teacher123",
        role: "teacher",
        subject: "Java"
    }
];

async function seedUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB connected");

        for (const user of users) {

            const existingUser = await User.findOne({
                id_no: user.id_no
            });

            if (existingUser) {
                console.log(`${user.role} already exists`);
                continue;
            }

            const hashedPassword = await bcrypt.hash(user.password, 10);

            await User.create({
                ...user,
                password: hashedPassword
            });

            console.log(`${user.role} created successfully`);
        }

        console.log("================================");
        console.log("All users created successfully");
        console.log("================================");

        process.exit(0);

    } catch (error) {
        console.error("Seed Error:");
        console.error(error.message);
        process.exit(1);
    }
}

seedUsers();