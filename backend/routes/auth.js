const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const authMiddleware = require("../middleware/authMiddleware");

const JWT_SECRET = process.env.JWT_SECRET || "campuscore_secret_key_2026";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value) => String(value ?? "").trim();

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  id_no: user.id_no,
  email: user.email,
  role: user.role,
  department: user.department,
  course: user.course,
  semester: user.semester,
  year: user.year,
  division: user.division,
  status: user.status,
  profilePhoto: user.profilePhoto || "",
});

router.post("/login", async (req, res) => {
  try {
    const id_no = clean(req.body.id_no);
    const password = String(req.body.password ?? "");
    const role = clean(req.body.role).toLowerCase();
    if (!id_no || !password || !role) return res.status(400).json({ message: "ID, password and role are required." });
    if (!["admin", "teacher", "student"].includes(role)) return res.status(400).json({ message: "Invalid login role." });
    if (id_no.length < 3 || id_no.length > 30) return res.status(400).json({ message: "Invalid ID format." });
    if (password.length > 100) return res.status(400).json({ message: "Password is too long." });
    const user = await User.findOne({ id_no, role });
    if (!user) return res.status(401).json({ message: "Invalid credentials." });
    if (user.status === false) return res.status(403).json({ message: "Your account is inactive. Please contact Admin." });
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: "Invalid credentials." });
    const token = jwt.sign({ id: user._id, id_no: user.id_no, role: user.role }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ message: "Login successful", token, user: publicUser(user) });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server error during login." });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const id_no = clean(req.body.id_no);
    const email = clean(req.body.email).toLowerCase();
    const newPassword = String(req.body.newPassword ?? "");
    const confirmPassword = String(req.body.confirmPassword ?? "");
    if (!id_no || !email || !newPassword || !confirmPassword) return res.status(400).json({ message: "ID, email and both password fields are required." });
    if (!emailRegex.test(email)) return res.status(400).json({ message: "Please provide a valid email address." });
    if (newPassword.length < 6 || newPassword.length > 100 || !newPassword.trim()) return res.status(400).json({ message: "New password must be 6–100 characters." });
    if (newPassword !== confirmPassword) return res.status(400).json({ message: "New password and confirm password do not match." });
    const user = await User.findOne({ id_no, email });
    if (!user) return res.status(404).json({ message: "No user found matching this ID and Email." });
    if (await bcrypt.compare(newPassword, user.password)) return res.status(400).json({ message: "New password must be different from your current password." });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password reset successful! You can now log in." });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ message: "Failed to reset password." });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.status === false) return res.status(403).json({ message: "Your account is inactive." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to load profile." });
  }
});

router.put("/update-profile", authMiddleware, async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    const normalizedEmail = clean(email).toLowerCase();
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) return res.status(400).json({ message: "Please enter a valid email address." });
    const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
    if (existingUser) return res.status(409).json({ message: "This email address is already in use." });
    user.email = normalizedEmail;

    const nextPassword = String(newPassword ?? "");
    if (nextPassword.trim()) {
      const current = String(currentPassword ?? "").trim();
      if (!current) return res.status(400).json({ message: "Current password is required to change your password." });
      if (nextPassword !== nextPassword.trim()) return res.status(400).json({ message: "New password cannot start or end with spaces." });
      if (nextPassword.length < 6 || nextPassword.length > 100) return res.status(400).json({ message: "New password must be 6–100 characters." });
      if (!(await bcrypt.compare(current, user.password))) return res.status(400).json({ message: "Current password does not match." });
      if (await bcrypt.compare(nextPassword, user.password)) return res.status(400).json({ message: "New password must be different from your current password." });
      user.password = await bcrypt.hash(nextPassword, 10);
    }
    await user.save();
    res.json({ message: "Profile updated successfully!", user: publicUser(user) });
  } catch (err) {
    console.error("Update Profile Error:", err);
    res.status(500).json({ message: "Failed to update profile." });
  }
});

module.exports = router;
