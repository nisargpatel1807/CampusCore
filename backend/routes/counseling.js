const router = require("express").Router();
const mongoose = require("mongoose");

const User = require("../models/user");
const Notification = require("../models/Notification");
const CounselingAppointment = require("../models/CounselingAppointment");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const clean = (value) => String(value ?? "").trim();

const toDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const validateWindow = (start, end) => {
  if (!start || !end) return "Please provide both start and end time.";
  if (end <= start) return "End time must be after start time.";

  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes < 15) return "Appointment must be at least 15 minutes long.";
  if (minutes > 180) return "Appointment cannot be longer than 3 hours.";

  return null;
};

const isPast = (date) => date.getTime() <= Date.now();

const makeWindowQuery = (teacherId, start, end, excludeId = null) => ({
  teacher: teacherId,
  status: { $in: ["REQUESTED", "PROPOSED", "CONFIRMED"] },
  $or: [
    {
      scheduledStart: { $ne: null, $lt: end },
      scheduledEnd: { $ne: null, $gt: start },
    },
    {
      scheduledStart: null,
      requestedStart: { $lt: end },
      requestedEnd: { $gt: start },
    },
  ],
  ...(excludeId && mongoose.isValidObjectId(excludeId)
    ? { _id: { $ne: excludeId } }
    : {}),
});

const notify = async ({ recipient, recipientRole, title, message, link }) => {
  try {
    await Notification.create({
      recipient,
      recipientRole,
      type: "COUNSELING_APPOINTMENT",
      title,
      message,
      link: link || "",
      isRead: false,
    });
  } catch (error) {
    // Notification failure should not roll back an otherwise valid appointment action.
    console.error("Counseling Notification Error:", error);
  }
};

const populateAppointment = (query) =>
  query
    .populate("student", "name id_no email course semester division department")
    .populate("teacher", "name id_no email department")
    .lean();

// =========================================================
// GET ACTIVE TEACHERS FOR STUDENTS
// GET /api/counseling/teachers
// =========================================================
router.get("/teachers", authMiddleware, requireRole("student"), async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher", status: true })
      .select("_id name id_no email department")
      .sort({ name: 1 })
      .lean();

    res.json(teachers);
  } catch (error) {
    console.error("Counseling Teachers Error:", error);
    res.status(500).json({ message: "Failed to load teachers." });
  }
});

// =========================================================
// GET BUSY WINDOWS FOR ONE TEACHER ON A DATE RANGE
// GET /api/counseling/teachers/:teacherId/busy?start=...&end=...
// =========================================================
router.get(
  "/teachers/:teacherId/busy",
  authMiddleware,
  requireRole("student"),
  async (req, res) => {
    try {
      const { teacherId } = req.params;
      if (!mongoose.isValidObjectId(teacherId)) {
        return res.status(400).json({ message: "Invalid teacher ID." });
      }

      const teacher = await User.findOne({
        _id: teacherId,
        role: "teacher",
        status: true,
      }).lean();

      if (!teacher) return res.status(404).json({ message: "Teacher not found." });

      const start = toDate(req.query.start);
      const end = toDate(req.query.end);
      const windowError = validateWindow(start, end);
      if (windowError) return res.status(400).json({ message: windowError });

      const appointments = await CounselingAppointment.find(
        makeWindowQuery(teacher._id, start, end)
      )
        .select("scheduledStart scheduledEnd requestedStart requestedEnd status")
        .sort({ scheduledStart: 1, requestedStart: 1 })
        .lean();

      res.json({
        teacher: {
          _id: teacher._id,
          name: teacher.name,
          department: teacher.department,
        },
        busy: appointments.map((a) => ({
          start: a.scheduledStart || a.requestedStart,
          end: a.scheduledEnd || a.requestedEnd,
          status: a.status,
        })),
      });
    } catch (error) {
      console.error("Counseling Busy Windows Error:", error);
      res.status(500).json({ message: "Failed to load teacher availability." });
    }
  }
);

// =========================================================
// STUDENT: CREATE APPOINTMENT REQUEST
// POST /api/counseling/appointments
// =========================================================
router.post(
  "/appointments",
  authMiddleware,
  requireRole("student"),
  async (req, res) => {
    try {
      const teacherId = clean(req.body.teacherId);
      const reason = clean(req.body.reason);
      const details = clean(req.body.details);
      const requestedStart = toDate(req.body.requestedStart);
      const requestedEnd = toDate(req.body.requestedEnd);

      if (!mongoose.isValidObjectId(teacherId)) {
        return res.status(400).json({ message: "Please select a valid teacher." });
      }
      if (reason.length < 3 || reason.length > 300) {
        return res.status(400).json({ message: "Reason must be between 3 and 300 characters." });
      }
      if (details.length > 1500) {
        return res.status(400).json({ message: "Details cannot exceed 1500 characters." });
      }

      const windowError = validateWindow(requestedStart, requestedEnd);
      if (windowError) return res.status(400).json({ message: windowError });
      if (isPast(requestedStart)) {
        return res.status(400).json({ message: "Please select a future appointment time." });
      }

      const [student, teacher] = await Promise.all([
        User.findOne({ _id: req.user.id, role: "student", status: true }).lean(),
        User.findOne({ _id: teacherId, role: "teacher", status: true }).lean(),
      ]);

      if (!student) return res.status(403).json({ message: "Active student account required." });
      if (!teacher) return res.status(404).json({ message: "Teacher not found or inactive." });

      const conflict = await CounselingAppointment.findOne(
        makeWindowQuery(teacher._id, requestedStart, requestedEnd)
      ).lean();

      if (conflict) {
        return res.status(409).json({
          message: "The selected teacher already has an appointment during this time. Please choose another time.",
        });
      }

      const studentConflict = await CounselingAppointment.findOne({
        student: student._id,
        status: { $in: ["REQUESTED", "PROPOSED", "CONFIRMED"] },
        $or: [
          {
            scheduledStart: { $ne: null, $lt: requestedEnd },
            scheduledEnd: { $ne: null, $gt: requestedStart },
          },
          {
            scheduledStart: null,
            requestedStart: { $lt: requestedEnd },
            requestedEnd: { $gt: requestedStart },
          },
        ],
      }).lean();

      if (studentConflict) {
        return res.status(409).json({
          message: "You already have another counseling appointment during this time.",
        });
      }

      const appointment = await CounselingAppointment.create({
        student: student._id,
        teacher: teacher._id,
        reason,
        details,
        requestedStart,
        requestedEnd,
        status: "REQUESTED",
      });

      await notify({
        recipient: teacher._id,
        recipientRole: "teacher",
        title: "New Counseling Request",
        message: `${student.name} requested a counseling appointment for ${reason}.`,
        link: "/teacher/dashboard?open=counseling",
      });

      const populated = await populateAppointment(
        CounselingAppointment.findById(appointment._id)
      );

      res.status(201).json({
        message: "Counseling request sent successfully.",
        appointment: populated,
      });
    } catch (error) {
      console.error("Create Counseling Appointment Error:", error);
      res.status(500).json({ message: "Failed to create counseling request." });
    }
  }
);

// =========================================================
// STUDENT: LIST OWN APPOINTMENTS
// GET /api/counseling/appointments/student
// =========================================================
router.get(
  "/appointments/student",
  authMiddleware,
  requireRole("student"),
  async (req, res) => {
    try {
      const appointments = await populateAppointment(
        CounselingAppointment.find({ student: req.user.id }).sort({
          scheduledStart: 1,
          requestedStart: 1,
          createdAt: -1,
        })
      );
      res.json(appointments);
    } catch (error) {
      console.error("Student Counseling Appointments Error:", error);
      res.status(500).json({ message: "Failed to load counseling appointments." });
    }
  }
);

// =========================================================
// TEACHER: LIST OWN APPOINTMENTS
// GET /api/counseling/appointments/teacher
// =========================================================
router.get(
  "/appointments/teacher",
  authMiddleware,
  requireRole("teacher"),
  async (req, res) => {
    try {
      const appointments = await populateAppointment(
        CounselingAppointment.find({ teacher: req.user.id }).sort({
          scheduledStart: 1,
          requestedStart: 1,
          createdAt: -1,
        })
      );
      res.json(appointments);
    } catch (error) {
      console.error("Teacher Counseling Appointments Error:", error);
      res.status(500).json({ message: "Failed to load counseling appointments." });
    }
  }
);

// =========================================================
// TEACHER: ACCEPT / PROPOSE / REJECT
// PUT /api/counseling/appointments/:id/decision
// Body: { action, scheduledStart?, scheduledEnd?, location?, message? }
// =========================================================
router.put(
  "/appointments/:id/decision",
  authMiddleware,
  requireRole("teacher"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid appointment ID." });
      }

      const action = clean(req.body.action).toUpperCase();
      if (!["ACCEPT", "PROPOSE", "REJECT"].includes(action)) {
        return res.status(400).json({ message: "Invalid appointment action." });
      }

      const appointment = await CounselingAppointment.findOne({
        _id: id,
        teacher: req.user.id,
      });
      if (!appointment) return res.status(404).json({ message: "Appointment not found." });

      if (!["REQUESTED", "PROPOSED"].includes(appointment.status)) {
        return res.status(400).json({ message: "This appointment can no longer be modified." });
      }

      const teacherMessage = clean(req.body.message);
      const location = clean(req.body.location);
      if (teacherMessage.length > 1000) {
        return res.status(400).json({ message: "Message cannot exceed 1000 characters." });
      }
      if (location.length > 200) {
        return res.status(400).json({ message: "Location cannot exceed 200 characters." });
      }

      const student = await User.findById(appointment.student).lean();
      const teacher = await User.findById(req.user.id).lean();
      if (!student || student.role !== "student") {
        return res.status(404).json({ message: "Student account no longer exists." });
      }
      if (!teacher || teacher.role !== "teacher") {
        return res.status(404).json({ message: "Teacher account no longer exists." });
      }

      if (action === "REJECT") {
        appointment.status = "REJECTED";
        appointment.teacherMessage = teacherMessage;
        await appointment.save();

        await notify({
          recipient: student._id,
          recipientRole: "student",
          title: "Counseling Request Rejected",
          message: `${teacher.name} could not accept your counseling request.`,
          link: "/student/dashboard?open=counseling",
        });

        return res.json({ message: "Counseling request rejected.", appointment });
      }

      const scheduledStart = toDate(req.body.scheduledStart) || appointment.requestedStart;
      const scheduledEnd = toDate(req.body.scheduledEnd) || appointment.requestedEnd;
      const windowError = validateWindow(scheduledStart, scheduledEnd);
      if (windowError) return res.status(400).json({ message: windowError });
      if (isPast(scheduledStart)) return res.status(400).json({ message: "Scheduled time must be in the future." });

      const conflict = await CounselingAppointment.findOne(
        makeWindowQuery(teacher._id, scheduledStart, scheduledEnd, appointment._id)
      ).lean();
      if (conflict) {
        return res.status(409).json({
          message: "You already have another counseling appointment during this time.",
        });
      }

      const studentConflict = await CounselingAppointment.findOne({
        _id: { $ne: appointment._id },
        student: student._id,
        status: { $in: ["REQUESTED", "PROPOSED", "CONFIRMED"] },
        $or: [
          {
            scheduledStart: { $ne: null, $lt: scheduledEnd },
            scheduledEnd: { $ne: null, $gt: scheduledStart },
          },
          {
            scheduledStart: null,
            requestedStart: { $lt: scheduledEnd },
            requestedEnd: { $gt: scheduledStart },
          },
        ],
      }).lean();

      if (studentConflict) {
        return res.status(409).json({
          message: "The student already has another counseling appointment during this time.",
        });
      }

      appointment.scheduledStart = scheduledStart;
      appointment.scheduledEnd = scheduledEnd;
      appointment.location = location;
      appointment.teacherMessage = teacherMessage;
      appointment.status = action === "ACCEPT" ? "CONFIRMED" : "PROPOSED";
      await appointment.save();

      await notify({
        recipient: student._id,
        recipientRole: "student",
        title: action === "ACCEPT" ? "Counseling Appointment Confirmed" : "New Counseling Time Proposed",
        message:
          action === "ACCEPT"
            ? `${teacher.name} confirmed your counseling appointment.`
            : `${teacher.name} proposed a new time for your counseling appointment.`,
        link: "/student/dashboard?open=counseling",
      });

      const populated = await populateAppointment(
        CounselingAppointment.findById(appointment._id)
      );

      res.json({
        message:
          action === "ACCEPT"
            ? "Counseling appointment confirmed."
            : "New counseling time proposed to the student.",
        appointment: populated,
      });
    } catch (error) {
      console.error("Counseling Decision Error:", error);
      res.status(500).json({ message: "Failed to update counseling request." });
    }
  }
);

// =========================================================
// STUDENT: CONFIRM A PROPOSED TIME
// PUT /api/counseling/appointments/:id/confirm
// =========================================================
router.put(
  "/appointments/:id/confirm",
  authMiddleware,
  requireRole("student"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid appointment ID." });

      const appointment = await CounselingAppointment.findOne({
        _id: id,
        student: req.user.id,
      });
      if (!appointment) return res.status(404).json({ message: "Appointment not found." });
      if (appointment.status !== "PROPOSED") {
        return res.status(400).json({ message: "Only proposed appointments can be confirmed." });
      }
      if (!appointment.scheduledStart || !appointment.scheduledEnd) {
        return res.status(400).json({ message: "The teacher has not provided a valid proposed time." });
      }
      if (isPast(appointment.scheduledStart)) {
        return res.status(400).json({ message: "The proposed appointment time has already passed." });
      }

      appointment.status = "CONFIRMED";
      appointment.studentMessage = clean(req.body.message).slice(0, 1000);
      await appointment.save();

      const teacher = await User.findById(appointment.teacher).lean();
      if (teacher) {
        const student = await User.findById(req.user.id).lean();
        await notify({
          recipient: teacher._id,
          recipientRole: "teacher",
          title: "Counseling Time Confirmed",
          message: `${student?.name || "A student"} confirmed the proposed counseling time.`,
          link: "/teacher/dashboard?open=counseling",
        });
      }

      const populated = await populateAppointment(
        CounselingAppointment.findById(appointment._id)
      );
      res.json({ message: "Proposed counseling time confirmed.", appointment: populated });
    } catch (error) {
      console.error("Confirm Counseling Appointment Error:", error);
      res.status(500).json({ message: "Failed to confirm counseling appointment." });
    }
  }
);

// =========================================================
// STUDENT OR TEACHER: CANCEL
// PUT /api/counseling/appointments/:id/cancel
// =========================================================
router.put(
  "/appointments/:id/cancel",
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid appointment ID." });

      const appointment = await CounselingAppointment.findOne({
        _id: id,
        $or: [{ student: req.user.id }, { teacher: req.user.id }],
      });
      if (!appointment) return res.status(404).json({ message: "Appointment not found." });

      if (!["REQUESTED", "PROPOSED", "CONFIRMED"].includes(appointment.status)) {
        return res.status(400).json({ message: "This appointment can no longer be cancelled." });
      }

      appointment.status = "CANCELLED";
      const message = clean(req.body.message).slice(0, 1000);
      if (String(appointment.student) === String(req.user.id)) appointment.studentMessage = message;
      if (String(appointment.teacher) === String(req.user.id)) appointment.teacherMessage = message;
      await appointment.save();

      const recipientId = String(appointment.student) === String(req.user.id)
        ? appointment.teacher
        : appointment.student;
      const recipientRole = String(appointment.student) === String(req.user.id)
        ? "teacher"
        : "student";
      const actor = await User.findById(req.user.id).lean();

      await notify({
        recipient: recipientId,
        recipientRole,
        title: "Counseling Appointment Cancelled",
        message: `${actor?.name || "User"} cancelled the counseling appointment.`,
        link: recipientRole === "teacher"
          ? "/teacher/dashboard?open=counseling"
          : "/student/dashboard?open=counseling",
      });

      res.json({ message: "Counseling appointment cancelled.", appointment });
    } catch (error) {
      console.error("Cancel Counseling Appointment Error:", error);
      res.status(500).json({ message: "Failed to cancel counseling appointment." });
    }
  }
);

// =========================================================
// TEACHER: MARK COMPLETED OR NO-SHOW
// PUT /api/counseling/appointments/:id/complete
// Body: { outcome: "COMPLETED" | "NO_SHOW", message? }
// =========================================================
router.put(
  "/appointments/:id/complete",
  authMiddleware,
  requireRole("teacher"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const outcome = clean(req.body.outcome).toUpperCase();
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid appointment ID." });
      if (!["COMPLETED", "NO_SHOW"].includes(outcome)) {
        return res.status(400).json({ message: "Invalid appointment outcome." });
      }

      const appointment = await CounselingAppointment.findOne({
        _id: id,
        teacher: req.user.id,
      });
      if (!appointment) return res.status(404).json({ message: "Appointment not found." });
      if (appointment.status !== "CONFIRMED") {
        return res.status(400).json({ message: "Only confirmed appointments can be completed or marked no-show." });
      }

      appointment.status = outcome;
      appointment.teacherMessage = clean(req.body.message).slice(0, 1000);
      await appointment.save();

      await notify({
        recipient: appointment.student,
        recipientRole: "student",
        title: outcome === "COMPLETED" ? "Counseling Completed" : "Counseling Marked No-Show",
        message:
          outcome === "COMPLETED"
            ? "Your counseling appointment has been marked completed."
            : "Your counseling appointment has been marked as no-show.",
        link: "/student/dashboard?open=counseling",
      });

      res.json({ message: `Appointment marked ${outcome.toLowerCase()}.`, appointment });
    } catch (error) {
      console.error("Complete Counseling Appointment Error:", error);
      res.status(500).json({ message: "Failed to update appointment outcome." });
    }
  }
);

module.exports = router;
