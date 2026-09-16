const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ServiceRequest = require("../models/ServiceRequest");
const HelpdeskStaff = require("../models/HelpdeskStaff");
const User = require("../models/user");
const Notification = require("../models/Notification");
const helpdeskStaffAuth = require("../middleware/helpdeskStaffAuth");

const uploadDir = path.join(__dirname, "../uploads/helpdesk-proofs");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    cb(null, `${Date.now()}-${safe}`);
  },
});

const proofUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(new Error("Proof photos must be JPG, PNG or WEBP."));
    cb(null, true);
  },
});

const populateRequest = (query) => query
  .populate({ path: "student", model: User, select: "name id_no course semester email profilePhoto" })
  .populate({ path: "assignedStaff", model: HelpdeskStaff, select: "name email mobile department active" });

const notifyAdmins = async ({ title, message, link }) => {
  const admins = await User.find({ role: "admin", status: true }).select("_id").lean();
  if (admins.length) await Notification.insertMany(admins.map((admin) => ({ recipient: admin._id, recipientRole: "admin", type: "HELPDESK", title, message, link })));
};

const notifyStudent = async ({ request, title, message }) => {
  if (!request.student?._id) return;
  await Notification.create({ recipient: request.student._id, recipientRole: "student", type: "HELPDESK", title, message, link: `/student/dashboard?open=helpdesk&ticketId=${request._id}` });
};

const addHistory = (request, entry) => {
  if (!Array.isArray(request.history)) request.history = [];
  request.history.push({ ...entry, createdAt: new Date() });
};

// Staff credential login is intentionally public. All other staff routes below
// remain protected by helpdeskStaffAuth.
router.post("/login", async (req, res) => {
  try {
    const staffId = String(req.body.staffId || "").trim().toUpperCase();
    const password = String(req.body.password || "");

    if (staffId.length < 3 || staffId.length > 30 || !/^[A-Z0-9_-]+$/.test(staffId)) {
      return res.status(400).json({ message: "Please enter a valid Staff ID." });
    }
    if (!password) {
      return res.status(400).json({ message: "Please enter your password." });
    }

    const staff = await HelpdeskStaff.findOne({ staffId, active: true }).select("+password");
    if (!staff || !staff.password) {
      return res.status(401).json({ message: "Invalid Staff ID or password." });
    }

    const passwordOk = await bcrypt.compare(password, staff.password);
    if (!passwordOk) {
      return res.status(401).json({ message: "Invalid Staff ID or password." });
    }

    const secret = process.env.JWT_SECRET || "campuscore_secret_key_2026";
    const token = jwt.sign(
      { id: staff._id.toString(), role: "helpdesk_staff", type: "helpdesk_access" },
      secret,
      { expiresIn: "12h" }
    );

    const safeStaff = staff.toObject();
    delete safeStaff.password;

    return res.json({
      message: "Staff login successful.",
      token,
      staff: safeStaff,
    });
  } catch (error) {
    console.error("Helpdesk Staff Login:", error);
    return res.status(500).json({ message: "Unable to login right now. Please try again." });
  }
});

router.use(helpdeskStaffAuth);

router.get("/me", async (req, res) => {
  res.json({ staff: req.helpdeskStaff });
});

router.get("/requests", async (req, res) => {
  try {
    const requests = await populateRequest(ServiceRequest.find({ assignedStaff: req.helpdeskStaff._id }).sort({ createdAt: -1 }));
    res.json(requests || []);
  } catch (error) {
    console.error("Staff Requests:", error);
    res.status(500).json({ message: "Failed to load assigned helpdesk requests." });
  }
});

router.get("/requests/:id", async (req, res) => {
  try {
    const request = await populateRequest(ServiceRequest.findOne({ _id: req.params.id, assignedStaff: req.helpdeskStaff._id }));
    if (!request) return res.status(404).json({ message: "Assigned helpdesk request not found." });
    res.json(request);
  } catch (error) {
    res.status(400).json({ message: "Invalid request ID." });
  }
});

router.put("/requests/:id/accept", async (req, res) => {
  try {
    const request = await populateRequest(ServiceRequest.findOne({ _id: req.params.id, assignedStaff: req.helpdeskStaff._id }));
    if (!request) return res.status(404).json({ message: "Assigned helpdesk request not found." });
    if (request.status !== "Assigned") return res.status(409).json({ message: `This request is already ${request.status}.` });

    request.status = "In Progress";
    request.acceptedAt = new Date();
    addHistory(request, { action: "Staff accepted request", fromStatus: "Assigned", toStatus: "In Progress", actorType: "staff", actorName: req.helpdeskStaff.name, staffId: req.helpdeskStaff._id, note: "Staff accepted the ticket and started work." });
    await request.save();

    await notifyAdmins({ title: "Helpdesk Work Started", message: `${req.helpdeskStaff.name} accepted request ${request._id} and started work.`, link: `/admin/dashboard?open=helpdesk&ticketId=${request._id}` });
    await notifyStudent({ request, title: "Helpdesk Work Started", message: `${req.helpdeskStaff.name} has accepted your request and started working on it.` });

    res.json({ message: "Request accepted. Status is now In Progress.", request: await populateRequest(ServiceRequest.findById(request._id)) });
  } catch (error) {
    console.error("Staff Accept:", error);
    res.status(500).json({ message: error.message || "Failed to accept request." });
  }
});

router.put("/requests/:id/resolve", proofUpload.array("proofPhotos", 2), async (req, res) => {
  try {
    const cleanup = () => (req.files || []).forEach((file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); });
    const request = await ServiceRequest.findOne({ _id: req.params.id, assignedStaff: req.helpdeskStaff._id }).populate("student", "name id_no course semester email");
    if (!request) { cleanup(); return res.status(404).json({ message: "Assigned helpdesk request not found." }); }
    if (request.status !== "In Progress") { cleanup(); return res.status(409).json({ message: "Only In Progress requests can be submitted for verification." }); }

    const resolutionNote = String(req.body.resolutionNote || "").trim();
    if (resolutionNote.length < 10 || resolutionNote.length > 1000) { cleanup(); return res.status(400).json({ message: "Resolution details must be between 10 and 1000 characters." }); }
    if (!Array.isArray(req.files) || req.files.length < 1) { cleanup(); return res.status(400).json({ message: "Please upload at least 1 completion proof photo." }); }

    const proofUrls = req.files.map((file) => `/uploads/helpdesk-proofs/${file.filename}`);
    const previousStatus = request.status;
    request.status = "Awaiting Verification";
    request.staffNote = resolutionNote;
    request.resolutionNote = resolutionNote;
    request.resolutionPhotos = proofUrls;
    request.verificationSubmittedAt = new Date();
    addHistory(request, { action: "Staff submitted resolution", fromStatus: previousStatus, toStatus: "Awaiting Verification", actorType: "staff", actorName: req.helpdeskStaff.name, staffId: req.helpdeskStaff._id, note: resolutionNote });
    await request.save();

    await notifyAdmins({ title: "Helpdesk Awaiting Verification", message: `${req.helpdeskStaff.name} submitted completion proof for request ${request._id}.`, link: `/admin/dashboard?open=helpdesk&ticketId=${request._id}` });
    await notifyStudent({ request, title: "Helpdesk Update", message: `${req.helpdeskStaff.name} submitted a completion update. Your request is awaiting admin verification.` });

    res.json({ message: "Resolution submitted for admin verification.", request: await populateRequest(ServiceRequest.findById(request._id)) });
  } catch (error) {
    (req.files || []).forEach((file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); });
    console.error("Staff Resolve:", error);
    res.status(500).json({ message: error.message || "Failed to submit resolution." });
  }
});

module.exports = router;
