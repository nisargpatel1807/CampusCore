const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const User = require("../models/user");
const OtpChallenge = require("../models/OtpChallenge");
const authMiddleware = require("../middleware/authMiddleware");
const { validatePassword } = require("../utils/passwordPolicy");
const { sendAccountOtpEmail } = require("../services/emailService");

const JWT_SECRET = process.env.JWT_SECRET || "campuscore_secret_key_2026";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const clean = (v) => String(v ?? "").trim();
const normalizeEmail = (v) => clean(v).toLowerCase();
const otpHash = (otp) => crypto.createHash("sha256").update(`${otp}:${process.env.OTP_PEPPER || JWT_SECRET}`).digest("hex");
const publicUser = (u) => ({ id: u._id, name: u.name, id_no: u.id_no, email: u.email, phone: u.phone || "", role: u.role, department: u.department, course: u.course, semester: u.semester, year: u.year, division: u.division, status: u.status, profilePhoto: u.profilePhoto || "" });
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const photoStorage = multer.diskStorage({ destination: (_req, _file, cb) => cb(null, uploadDir), filename: (_req, file, cb) => cb(null, `profile-${Date.now()}-${crypto.randomBytes(5).toString("hex")}${path.extname(file.originalname).toLowerCase()}`) });
const photoUpload = multer({ storage: photoStorage, limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  if (!allowed[ext] || allowed[ext] !== file.mimetype) return cb(new Error("Profile photo must be a valid JPG, PNG or WEBP image (maximum 5 MB)."));
  cb(null, true);
} });
const makeOtp = () => String(crypto.randomInt(100000, 1000000));

async function sendOtpFor(user, purpose, targetEmail) {
  const existing = await OtpChallenge.findOne({ userId: user._id, purpose });
  if (existing && Date.now() - new Date(existing.sentAt).getTime() < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (Date.now() - new Date(existing.sentAt).getTime())) / 1000);
    const error = new Error(`Please wait ${wait} seconds before requesting another OTP.`); error.status = 429; throw error;
  }
  const otp = makeOtp();
  const sentAt = new Date();
  const challenge = { userId: user._id, purpose, targetEmail, otpHash: otpHash(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS), sentAt, attempts: 0, verifiedAt: null, consumedAt: null };
  await OtpChallenge.findOneAndUpdate({ userId: user._id, purpose }, { $set: challenge }, { upsert: true, new: true, setDefaultsOnInsert: true });
  try { await sendAccountOtpEmail({ to: targetEmail, otp, purpose }); }
  catch (e) { await OtpChallenge.deleteOne({ userId: user._id, purpose, sentAt }); throw e; }
}
async function verifyChallenge(user, purpose, otp, targetEmail) {
  const challenge = await OtpChallenge.findOne({ userId: user._id, purpose });
  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= MAX_ATTEMPTS || (targetEmail && challenge.targetEmail !== targetEmail)) {
    const e = new Error("OTP expired or attempt limit reached. Request a new OTP."); e.status = 400; throw e;
  }
  if (challenge.verifiedAt) { const e = new Error("This OTP has already been verified. Complete the action or request a new OTP."); e.status = 400; throw e; }
  if (otpHash(String(otp || "")) !== challenge.otpHash) {
    challenge.attempts += 1;
    if (challenge.attempts >= MAX_ATTEMPTS) challenge.expiresAt = new Date();
    await challenge.save();
    const e = new Error(challenge.attempts >= MAX_ATTEMPTS ? "Maximum OTP attempts reached. Request a new OTP." : "Invalid OTP."); e.status = 400; throw e;
  }
  challenge.verifiedAt = new Date(); await challenge.save(); return challenge;
}

router.post("/login", async (req, res) => {
  try {
    const id_no = clean(req.body.id_no), password = String(req.body.password ?? ""), role = clean(req.body.role).toLowerCase();
    if (!id_no || !password || !role) return res.status(400).json({ message: "ID, password and role are required." });
    if (!["admin", "teacher", "student"].includes(role)) return res.status(400).json({ message: "Invalid login role." });
    if (id_no.length < 3 || id_no.length > 30 || password.length > 100) return res.status(400).json({ message: "Invalid credentials format." });
    const user = await User.findOne({ id_no, role });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: "Invalid credentials." });
    if (user.status === false) return res.status(403).json({ message: "Your account is inactive. Please contact Admin." });
    const token = jwt.sign({ id: user._id, id_no: user.id_no, role: user.role }, JWT_SECRET, { expiresIn: "1d" });
    return res.json({ message: "Login successful", token, user: publicUser(user) });
  } catch (err) { console.error("Login Error:", err); return res.status(500).json({ message: "Server error during login." }); }
});

// Step 1: request password-reset OTP. Role is checked to prevent cross-role account recovery.
router.post("/forgot-password/request-otp", async (req, res) => {
  try {
    const id_no = clean(req.body.id_no), email = normalizeEmail(req.body.email), role = clean(req.body.role).toLowerCase();
    if (!id_no || !EMAIL_RE.test(email) || !["admin", "teacher", "student"].includes(role)) return res.status(400).json({ message: "Enter your ID, registered email and role." });
    const user = await User.findOne({ id_no, email, role, status: true });
    if (!user) return res.status(400).json({ message: "Unable to verify these details." });
    await sendOtpFor(user, "password-reset", email);
    return res.json({ message: "OTP sent to your registered email. It expires in 10 minutes." });
  } catch (err) { return res.status(err.status || 503).json({ message: err.message || "Unable to send OTP. Check Brevo configuration." }); }
});
router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const id_no = clean(req.body.id_no), email = normalizeEmail(req.body.email), role = clean(req.body.role).toLowerCase();
    const user = await User.findOne({ id_no, email, role, status: true });
    if (!user) return res.status(400).json({ message: "Invalid or expired OTP." });
    await verifyChallenge(user, "password-reset", req.body.otp, email);
    return res.json({ message: "OTP verified. Set your new password." });
  } catch (err) { return res.status(err.status || 500).json({ message: err.message || "OTP verification failed." }); }
});
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const id_no = clean(req.body.id_no), email = normalizeEmail(req.body.email), role = clean(req.body.role).toLowerCase();
    const user = await User.findOne({ id_no, email, role, status: true });
    if (!user) return res.status(400).json({ message: "Unable to reset password." });
    const challenge = await OtpChallenge.findOne({ userId: user._id, purpose: "password-reset" });
    if (!challenge || !challenge.verifiedAt || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now() || Date.now() - challenge.verifiedAt.getTime() > OTP_TTL_MS) return res.status(403).json({ message: "Verify a fresh OTP before resetting the password." });
    const next = String(req.body.newPassword ?? ""), confirm = String(req.body.confirmPassword ?? "");
    const passwordError = validatePassword(next); if (passwordError) return res.status(400).json({ message: passwordError });
    if (next !== confirm) return res.status(400).json({ message: "New password and confirmation do not match." });
    if (await bcrypt.compare(next, user.password)) return res.status(400).json({ message: "Choose a password different from your current password." });
    user.password = await bcrypt.hash(next, 10); await user.save();
    await OtpChallenge.deleteOne({ _id: challenge._id });
    return res.json({ message: "Password reset successful. You can now log in." });
  } catch (err) { return res.status(500).json({ message: "Failed to reset password." }); }
});

router.get("/me", authMiddleware, async (req, res) => {
  try { const user = await User.findById(req.user.id).select("-password"); if (!user) return res.status(404).json({ message: "User not found." }); if (user.status === false) return res.status(403).json({ message: "Your account is inactive." }); return res.json(user); }
  catch (_err) { return res.status(500).json({ message: "Failed to load profile." }); }
});

router.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword ?? ""), next = String(req.body.newPassword ?? ""), confirm = String(req.body.confirmPassword ?? "");
    if (!currentPassword) return res.status(400).json({ message: "Current password is required." });
    const error = validatePassword(next); if (error) return res.status(400).json({ message: error });
    if (next !== confirm) return res.status(400).json({ message: "New password and confirmation do not match." });
    const user = await User.findById(req.user.id); if (!user) return res.status(404).json({ message: "User not found." });
    if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ message: "Current password is incorrect." });
    if (await bcrypt.compare(next, user.password)) return res.status(400).json({ message: "Choose a password different from your current password." });
    user.password = await bcrypt.hash(next, 10); await user.save();
    await OtpChallenge.deleteMany({ userId: user._id, purpose: "password-reset" });
    return res.json({ message: "Password changed successfully." });
  } catch (_err) { return res.status(500).json({ message: "Failed to change password." }); }
});

router.post("/email/request-otp", authMiddleware, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email); if (!EMAIL_RE.test(email) || email.length > 160) return res.status(400).json({ message: "Enter a valid email address." });
    const user = await User.findById(req.user.id); if (!user) return res.status(404).json({ message: "User not found." });
    if (email === user.email) return res.status(400).json({ message: "This is already your registered email." });
    if (await User.findOne({ email, _id: { $ne: user._id } })) return res.status(409).json({ message: "This email address is already registered." });
    await sendOtpFor(user, "email-change", email);
    return res.json({ message: "OTP sent to your new email address. Your registered email has not changed yet." });
  } catch (err) { return res.status(err.status || 503).json({ message: err.message || "Unable to send verification OTP." }); }
});
router.post("/email/verify-otp", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id); if (!user) return res.status(404).json({ message: "User not found." });
    const challenge = await verifyChallenge(user, "email-change", req.body.otp);
    if (await User.findOne({ email: challenge.targetEmail, _id: { $ne: user._id } })) return res.status(409).json({ message: "This email address is already registered." });
    user.email = challenge.targetEmail; await user.save();
    await OtpChallenge.deleteOne({ _id: challenge._id });
    return res.json({ message: "Email verified and updated successfully.", user: publicUser(user) });
  } catch (err) { return res.status(err.status || 500).json({ message: err.message || "Email verification failed." }); }
});

router.post("/profile-photo", authMiddleware, (req, res, next) => photoUpload.single("profilePhoto")(req, res, (err) => {
  if (err) return res.status(err.code === "LIMIT_FILE_SIZE" ? 400 : 400).json({ message: err.message || "Profile photo upload failed." });
  next();
}), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a JPG, PNG or WEBP photo up to 5 MB." });
    const user = await User.findById(req.user.id); if (!user) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ message: "User not found." }); }
    const oldPhoto = user.profilePhoto;
    user.profilePhoto = `/uploads/${req.file.filename}`; await user.save();
    if (oldPhoto && oldPhoto.startsWith("/uploads/profile-") && oldPhoto !== user.profilePhoto) fs.unlink(path.join(uploadDir, path.basename(oldPhoto)), () => {});
    return res.json({ message: "Profile photo updated successfully.", user: publicUser(user) });
  } catch (_err) { if (req.file?.path) fs.unlink(req.file.path, () => {}); return res.status(500).json({ message: "Failed to update profile photo." }); }
});

// Compatibility endpoint: password changes remain supported, but email changes must use OTP.
router.put("/update-profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id); if (!user) return res.status(404).json({ message: "User not found." });
    const requestedEmail = normalizeEmail(req.body.email);
    if (requestedEmail && requestedEmail !== user.email) return res.status(400).json({ message: "Email changes require OTP verification. Use /email/request-otp and /email/verify-otp." });
    const next = String(req.body.newPassword ?? "");
    if (next) {
      if (!(await bcrypt.compare(String(req.body.currentPassword ?? ""), user.password))) return res.status(400).json({ message: "Current password is incorrect." });
      const error = validatePassword(next); if (error) return res.status(400).json({ message: error });
      if (next !== String(req.body.confirmPassword ?? next)) return res.status(400).json({ message: "New password and confirmation do not match." });
      user.password = await bcrypt.hash(next, 10);
    }
    await user.save(); return res.json({ message: next ? "Password changed successfully." : "Profile is up to date.", user: publicUser(user) });
  } catch (_err) { return res.status(500).json({ message: "Failed to update profile." }); }
});
module.exports = router;
