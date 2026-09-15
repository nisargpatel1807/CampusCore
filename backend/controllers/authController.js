const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ==========================
// REGISTER
// ==========================

exports.register = async (req, res) => {
    try {
        const {
            name,
            id_no,
            password,
            role,
            course,
            year,
            subject
        } = req.body;

        if (!name || !id_no || !password || !role) {
            return res.status(400).json({
                message: "Name, ID, password and role are required"
            });
        }

        const existingUser = await User.findOne({
            id_no: String(id_no)
        });

        if (existingUser) {
            return res.status(400).json({
                message: "User with this ID already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            id_no: String(id_no),
            password: hashedPassword,
            role,
            course: course || "",
            year: year || null,
            subject: subject || "",
            status: true
        });

        res.status(201).json({
            message: "User Registered Successfully",
            user: {
                id: user._id,
                name: user.name,
                id_no: user.id_no,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Register Error:", error);

        res.status(500).json({
            message: "Registration failed"
        });
    }
};


// ==========================
// LOGIN
// ==========================

exports.login = async (req, res) => {
    try {
        const {
            id_no,
            password,
            role
        } = req.body;

        if (!id_no || !password || !role) {
            return res.status(400).json({
                message: "ID, password and role are required"
            });
        }

        const user = await User.findOne({
            id_no: String(id_no),
            role: role
        });

        if (!user) {
            return res.status(401).json({
                message: "Invalid ID, password or role"
            });
        }

        if (!user.status) {
            return res.status(403).json({
                message: "Your account is disabled"
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid ID, password or role"
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
                id_no: user.id_no,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d"
            }
        );

        res.json({
            message: "Login successful",

            token,

            user: {
                id: user._id,
                name: user.name,
                id_no: user.id_no,
                role: user.role,
                course: user.course,
                year: user.year,
                subject: user.subject
            }
        });

    } catch (error) {
        console.error("Login Error:", error);

        res.status(500).json({
            message: "Login failed"
        });
    }
};