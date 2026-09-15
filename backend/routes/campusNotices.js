const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const User = require("../models/user");
const Course = require("../models/course.JS");
const Notice = require("../models/Notice");
const Notification = require("../models/Notification");
const CalendarEvent = require("../models/CalendarEvent");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 140);

    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF, JPG, PNG and WEBP files are allowed."));
    }

    cb(null, true);
  },
});

const clean = (value) => String(value ?? "").trim();

const removeFile = (file) => {
  if (!file?.path) return;

  try {
    fs.unlinkSync(file.path);
  } catch (_) {}
};

const getStudentAudienceQuery = (targetCourse, targetSemester) => {
  const course = clean(targetCourse) || "ALL";
  const semester = Number(targetSemester || 0);

  const courseCondition =
    course === "ALL"
      ? {}
      : {
          $or: [
            { course },
            { department: course },
          ],
        };

  const semesterCondition =
    semester === 0 ? {} : { semester };

  return {
    role: "student",
    status: true,
    ...courseCondition,
    ...semesterCondition,
  };
};

router.use(authMiddleware);

/*
 * ADMIN: Publish campus notice/event.
 * POST /api/campus-notices
 */
router.post(
  "/",
  requireRole("admin"),
  upload.single("attachment"),
  async (req, res) => {
    try {
      const title = clean(req.body.title);
      const type = clean(req.body.type) || "Announcement";
      const message = clean(req.body.message);
      const eventDateRaw = clean(req.body.eventDate);
      const startTime = clean(req.body.startTime);
      const endTime = clean(req.body.endTime);
      const venue = clean(req.body.venue);
      const audience = clean(req.body.audience) || "students";
      const targetCourse = clean(req.body.targetCourse) || "ALL";
      const targetSemester = Number(req.body.targetSemester || 0);

      const allowedTypes = [
        "Announcement",
        "Hackathon",
        "Sports Event",
        "Seminar",
        "Workshop",
        "Cultural Event",
        "Exam",
        "Fees",
        "Holiday",
        "Circular",
        "Important Notice",
        "Other",
      ];

      if (title.length < 2 || title.length > 160) {
        removeFile(req.file);
        return res.status(400).json({
          message: "Title must be between 2 and 160 characters.",
        });
      }

      if (message.length < 2 || message.length > 5000) {
        removeFile(req.file);
        return res.status(400).json({
          message: "Message must be between 2 and 5000 characters.",
        });
      }

      if (!allowedTypes.includes(type)) {
        removeFile(req.file);
        return res.status(400).json({
          message: "Invalid notice type.",
        });
      }

      if (!["students", "teachers", "all"].includes(audience)) {
        removeFile(req.file);
        return res.status(400).json({
          message: "Invalid audience.",
        });
      }

      if (!Number.isInteger(targetSemester) || targetSemester < 0 || targetSemester > 20) {
        removeFile(req.file);
        return res.status(400).json({
          message: "Target semester must be 0 or between 1 and 20.",
        });
      }

      if (venue.length > 200) {
        removeFile(req.file);
        return res.status(400).json({
          message: "Venue cannot exceed 200 characters.",
        });
      }

      let eventDate = null;

      if (eventDateRaw) {
        eventDate = new Date(eventDateRaw);

        if (Number.isNaN(eventDate.getTime())) {
          removeFile(req.file);
          return res.status(400).json({
            message: "Please provide a valid event date.",
          });
        }
      }

      if (targetCourse !== "ALL") {
        const courseExists = await Course.findOne({
          courseName: targetCourse,
        }).lean();

        if (!courseExists) {
          removeFile(req.file);
          return res.status(400).json({
            message: "Selected course does not exist.",
          });
        }
      }

      const notice = await Notice.create({
        title,
        type,
        message,
        eventDate,
        startTime,
        endTime,
        venue,
        audience,
        targetCourse,
        targetSemester,
        attachmentUrl: req.file
          ? `/uploads/${req.file.filename}`
          : "",
        attachmentName: req.file?.originalname || "",
        attachmentType: req.file?.mimetype || "",
        createdBy: req.user.id,
      });

      const recipients = await User.find({
        $or: [
          ...(audience === "teachers" || audience === "all"
            ? [
                {
                  role: "teacher",
                  status: true,
                },
              ]
            : []),
          ...(audience === "students" || audience === "all"
            ? [getStudentAudienceQuery(targetCourse, targetSemester)]
            : []),
        ],
      })
        .select("_id role")
        .lean();

      const notificationDocs = recipients.map((recipient) => ({
        recipient: recipient._id,
        recipientRole: recipient.role,
        type: "CAMPUS_NOTICE",
        title,
        message:
          message.length > 950
            ? `${message.slice(0, 947)}...`
            : message,
        link:
  recipient.role === "student"
    ? `/student/dashboard?open=notices&noticeId=${notice._id}`
    : "",
        attachmentUrl: notice.attachmentUrl || "",
        attachmentName: notice.attachmentName || "",
        isRead: false,
      }));

      if (notificationDocs.length > 0) {
        await Notification.create(notificationDocs);
      }

      let calendarEvent = null;

      /*
       * A notice is added to the shared academic calendar only
       * when it is relevant to students and has an event date.
       */
      if (
        eventDate &&
        (audience === "students" || audience === "all")
      ) {
        calendarEvent = await CalendarEvent.create({
          title: `${type}: ${title}`,
          date: eventDate,
          category: "General Event",
          targetCourse,
          targetSemester,
        });
      }

      return res.status(201).json({
        message: "Campus notice published successfully! 📢",
        notice,
        recipientCount: recipients.length,
        calendarEvent,
      });
    } catch (error) {
      console.error("Publish Campus Notice Error:", error);
      removeFile(req.file);

      return res.status(500).json({
        message:
          error.message ||
          "Failed to publish campus notice.",
      });
    }
  }
);

/*
 * ADMIN: View notices created by admin.
 */
router.get(
  "/admin",
  requireRole("admin"),
  async (req, res) => {
    try {
      const notices = await Notice.find({
        createdBy: req.user.id,
      })
        .sort({ createdAt: -1 })
        .lean();

      res.json(notices || []);
    } catch (error) {
      console.error("Admin Notices Fetch Error:", error);
      res.status(500).json({
        message: "Failed to load campus notices.",
      });
    }
  }
);

/*
 * STUDENT: View relevant notices.
 */
router.get(
  "/student",
  async (req, res) => {
    try {
      const student = await User.findOne({
        _id: req.user.id,
        role: "student",
        status: true,
      })
        .select("course department semester")
        .lean();

      if (!student) {
        return res.status(403).json({
          message: "Students only.",
        });
      }

      const notices = await Notice.find({
        $or: [
          {
            audience: { $in: ["students", "all"] },
            $and: [
              {
                $or: [
                  { targetCourse: "ALL" },
                  { targetCourse: student.course },
                  { targetCourse: student.department },
                ],
              },
              {
                $or: [
                  { targetSemester: 0 },
                  { targetSemester: Number(student.semester || 0) },
                ],
              },
            ],
          },
        ],
      })
        .sort({ eventDate: 1, createdAt: -1 })
        .lean();

      res.json(notices || []);
    } catch (error) {
      console.error("Student Notices Fetch Error:", error);
      res.status(500).json({
        message: "Failed to load campus notices.",
      });
    }
  }
);

module.exports = router;
