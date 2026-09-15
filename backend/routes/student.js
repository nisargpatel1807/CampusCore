const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const User = require("../models/user");
const Subject = require("../models/Subject");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Attendance = require("../models/Attendance");
const Material = require("../models/Material");
const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");
const ServiceRequest = require("../models/ServiceRequest");
const CalendarEvent = require("../models/CalendarEvent");
const CourseTracker = require("../models/CourseTracker");
const CourseProgress = require("../models/CourseProgress");
const authMiddleware = require("../middleware/authMiddleware");
const Notification = require("../models/Notification");

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const makeStorage = () =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const safeName = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 120);
      cb(null, `${Date.now()}-${safeName}`);
    },
  });

const photoUpload = multer({
  storage: makeStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG and WEBP images are allowed."));
    }
    cb(null, true);
  },
});

const pdfUpload = multer({
  storage: makeStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed for assignment submissions."));
    }
    cb(null, true);
  },
});

const studentSubjectQuery = async (student) => {
  const all = await Subject.find({
    semester: Number(student.semester || 1),
  })
    .populate("course", "courseName courseCode")
    .populate("teacher", "name id_no email")
    .sort({ subjectCode: 1, subjectName: 1 })
    .lean();

  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const studentValues = [
    normalize(student.course),
    normalize(student.department),
  ].filter(Boolean);

  return all.filter((subject) => {
    const subjectValues = [
      normalize(subject.course?.courseName),
      normalize(subject.course?.courseCode),
    ].filter(Boolean);

    return subjectValues.some((subjectValue) =>
      studentValues.some(
        (studentValue) =>
          studentValue === subjectValue ||
          studentValue.startsWith(subjectValue) ||
          subjectValue.startsWith(studentValue)
      )
    );
  });
};

const getPendingAssignments = async (studentId, subjectIds) => {
  const assignments = await Assignment.find({ subject: { $in: subjectIds } })
    .populate("subject", "subjectName subjectCode")
    .sort({ dueDate: 1 })
    .lean();

  const submissions = await Submission.find({ student: studentId }).lean();
  const submittedIds = new Set(submissions.map((s) => String(s.assignment)));

  return assignments.filter((a) => !submittedIds.has(String(a._id)));
};

// GET DASHBOARD DATA
router.get("/dashboard-data", authMiddleware, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).lean();
    if (!student) return res.status(404).json({ message: "Student not found." });
    if (student.role !== "student") return res.status(403).json({ message: "Students only." });

    const matchedSubjects = await studentSubjectQuery(student);
    const subjectIds = matchedSubjects.map((s) => s._id);

    const pendingAssignments = await getPendingAssignments(student._id, subjectIds);

    const materials = await Material.find({ subject: { $in: subjectIds } })
      .populate("subject", "subjectName subjectCode")
      .populate("uploadedBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    const attendanceRecords = await Attendance.find({
      subject: { $in: subjectIds },
      "records.student": student._id,
    }).lean();

    let totalClasses = 0;
    let attended = 0;
    const breakdownMap = {};

    matchedSubjects.forEach((subject) => {
      breakdownMap[String(subject._id)] = {
        name: subject.subjectName,
        total: 0,
        attended: 0,
      };
    });

    attendanceRecords.forEach((record) => {
      const studentRecord = record.records.find(
        (r) => String(r.student) === String(student._id),
      );
      if (!studentRecord) return;

      totalClasses += 1;
      const subjectKey = String(record.subject);
      if (breakdownMap[subjectKey]) breakdownMap[subjectKey].total += 1;

      if (studentRecord.status === "present") {
        attended += 1;
        if (breakdownMap[subjectKey]) breakdownMap[subjectKey].attended += 1;
      }
    });

    const breakdown = Object.values(breakdownMap).map((item) => {
      const missed = item.total - item.attended;
      const pct = item.total > 0 ? Math.round((item.attended / item.total) * 100) : null;
      return [item.name, item.total, item.attended, missed, pct === null ? "—" : `${pct}%`];
    });

    const overallPct = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : null;

    return res.status(200).json({
      studentInfo: {
        name: student.name,
        id_no: student.id_no,
        email: student.email,
        role: student.role,
        profilePhoto: student.profilePhoto || "",
        course: student.course || student.department || "General",
        semester: student.semester || 1,
        year: student.year || "1st Year",
      },
      coursesCount: matchedSubjects.length,
      mySubjects: matchedSubjects,
      pendingCount: pendingAssignments.length,
      pendingAssignments,
      materials,
      attendance: {
        overallPct,
        attended,
        missed: totalClasses - attended,
        total: totalClasses,
        breakdown,
      },
    });
  } catch (err) {
    console.error("Student Dashboard Error:", err);
    res.status(500).json({ message: "Failed to fetch student data." });
  }
});

// GET AVAILABLE QUIZZES FOR CURRENT STUDENT
router.get("/quizzes", authMiddleware, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).lean();
    if (!student || student.role !== "student") {
      return res.status(403).json({ message: "Students only." });
    }

    const mySubjects = await studentSubjectQuery(student);
    const subjectIds = mySubjects.map((s) => s._id);

    const quizzes = await Quiz.find({ subject: { $in: subjectIds } })
      .populate("subject", "subjectName subjectCode")
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    const myAttempts = await QuizAttempt.find({ student: student._id }).lean();
    const attemptedMap = {};
    myAttempts.forEach((attempt) => {
      attemptedMap[String(attempt.quiz)] = attempt;
    });

    const now = new Date();
    const enriched = quizzes.map((quiz) => {
      const attempted = attemptedMap[String(quiz._id)];
      const closeDate = quiz.closeDate || quiz.dueDate;
      const openDate = quiz.openDate || quiz.createdAt;
      const isExpired = closeDate ? new Date(closeDate) < now : false;
      const isNotOpen = openDate ? new Date(openDate) > now : false;
      return {
        ...quiz,
        hasAttempted: Boolean(attempted),
        attemptData: attempted || null,
        isExpired,
        isNotOpen,
        isOpen: !isNotOpen && !isExpired,
      };
    });

    res.status(200).json(enriched);
  } catch (err) {
    console.error("Student Quizzes Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch student quizzes." });
  }
});

// SUBMIT QUIZ ATTEMPT
router.post("/quizzes/:id/submit", authMiddleware, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).lean();
    if (!student || student.role !== "student") {
      return res.status(403).json({ message: "Students only." });
    }

    const quiz = await Quiz.findById(req.params.id).lean();
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    const subjectIds = (await studentSubjectQuery(student)).map((s) => String(s._id));
    if (!subjectIds.includes(String(quiz.subject))) {
      return res.status(403).json({ message: "You are not enrolled for this quiz subject." });
    }

    if (quiz.dueDate && new Date(quiz.dueDate) < new Date()) {
      return res.status(400).json({ message: "This quiz is already closed." });
    }

    const existing = await QuizAttempt.findOne({ quiz: quiz._id, student: student._id }).lean();
    if (existing) {
      return res.status(409).json({ message: "You have already submitted this quiz." });
    }

    const { userAnswers, reason = "normal" } = req.body;
    if (!Array.isArray(userAnswers) || userAnswers.length !== quiz.questions.length) {
      return res.status(400).json({ message: "Invalid quiz answer data." });
    }

    const validAnswers = userAnswers.every(
      (answer) => Number.isInteger(answer) && (answer === -1 || answer >= 0),
    );
    if (!validAnswers) {
      return res.status(400).json({ message: "Quiz answers contain invalid values." });
    }

    let score = 0;
    quiz.questions.forEach((question, index) => {
      const answer = userAnswers[index];
      if (answer >= 0 && answer === question.correctAnswer) score += 1;
    });

    const attempt = await QuizAttempt.create({
      quiz: quiz._id,
      student: student._id,
      score,
      totalQuestions: quiz.questions.length,
      answers: userAnswers,
      submissionReason: ["normal", "timeout", "tab_switch"].includes(reason) ? reason : "normal",
    });

    res.status(201).json({
      message: `Quiz submitted successfully! Score: ${score}/${quiz.questions.length}`,
      attempt,
    });
  } catch (err) {
    console.error("Quiz Submit Error:", err);
    res.status(500).json({ message: "Failed to evaluate and submit quiz." });
  }
});

// SUBMIT ASSIGNMENT PDF
router.post("/assignments/:id/submit", authMiddleware, pdfUpload.single("file"), async (req, res) => {
  try {
    const student = await User.findById(req.user.id).lean();
    if (!student || student.role !== "student") {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: "Students only." });
    }

    const assignment = await Assignment.findById(req.params.id).lean();
    if (!assignment) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "Assignment not found." });
    }

    const subjectIds = (await studentSubjectQuery(student)).map((s) => String(s._id));
    if (!subjectIds.includes(String(assignment.subject))) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: "You are not enrolled in this assignment subject." });
    }

    if (!req.file) return res.status(400).json({ message: "Please attach a solution PDF document." });

    const notes = String(req.body.notes || "").trim();
    if (notes.length > 1000) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Submission notes cannot exceed 1000 characters." });
    }

    const existing = await Submission.findOne({
      assignment: assignment._id,
      student: student._id,
    });
    if (existing) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ message: "You have already submitted this assignment." });
    }

    const isLate = assignment.dueDate ? new Date() > new Date(assignment.dueDate) : false;
    const fileUrl = `/uploads/${req.file.filename}`;

    const submission = await Submission.create({
      assignment: assignment._id,
      student: student._id,
      fileUrl,
      notes,
      submittedAt: new Date(),
      isLate,
    });

    res.status(201).json({
      message: isLate
        ? "Assignment submitted successfully. Note: this submission was after the due date."
        : "Assignment turned in successfully! 🎉",
      submission,
      isLate,
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("Assignment Submission Error:", err);
    res.status(500).json({ message: err.message || "Failed to submit assignment." });
  }
});

// GET STUDENT SERVICE REQUESTS
router.get("/service-requests", authMiddleware, async (req, res) => {
  try {
    const requests = await ServiceRequest.find({ student: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(requests || []);
  } catch (err) {
    res.status(500).json({ message: "Failed to load requests." });
  }
});

// SUBMIT SERVICE REQUEST
router.post("/service-requests", authMiddleware, photoUpload.array("photos", 3), async (req, res) => {
  try {
    const student = await User.findById(req.user.id).lean();
    if (!student || student.role !== "student") {
      if (req.files?.length) req.files.forEach((file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); });
      return res.status(403).json({ message: "Students only." });
    }

    const allowedCategories = [
      "Projector Issue",
      "Computer Breakdown",
      "Fan / AC Problem",
      "Classroom Light",
      "Washroom Maintenance",
      "Wi-Fi Connectivity",
    ];

    const category = String(req.body.category || "").trim();
    const location = String(req.body.location || "").trim();
    const description = String(req.body.description || "").trim();

    if (!allowedCategories.includes(category)) {
      if (req.files?.length) req.files.forEach((file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); });
      return res.status(400).json({ message: "Please select a valid complaint category." });
    }

    if (location.length < 2 || location.length > 100) {
      if (req.files?.length) req.files.forEach((file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); });
      return res.status(400).json({ message: "Location must be between 2 and 100 characters." });
    }

    if (description.length < 10 || description.length > 1000) {
      if (req.files?.length) req.files.forEach((file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); });
      return res.status(400).json({ message: "Description must be between 10 and 1000 characters." });
    }

    const duplicate = await ServiceRequest.findOne({
      student: student._id,
      category,
      location,
      status: { $in: ["Assigned", "In Progress", "Awaiting Verification"] },
    }).lean();

    if (duplicate) {
      if (req.files?.length) req.files.forEach((file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); });
      return res.status(409).json({
        message: "You already have an active complaint for the same issue and location.",
      });
    }

    const photoUrls = (req.files || []).map((file) => `/uploads/${file.filename}`);
    const request = await ServiceRequest.create({
      student: student._id,
      category,
      location,
      description,
      photoUrl: photoUrls[0] || "",
      photoUrls,
      status: "Assigned",
    });
    const admins = await User.find({ role:"admin", status:true }).select("_id").lean();
    if(admins.length) await Notification.insertMany(admins.map(a=>({ recipient:a._id, recipientRole:"admin", type:"HELPDESK", title:"New Helpdesk Request", message:`${student.name} submitted a ${category} request for ${location}.`, link:"/admin/dashboard?open=helpdesk" })));

    res.status(201).json({ message: "Complaint registered successfully. 🛠️", request });
  } catch (err) {
    if (req.files?.length) req.files.forEach((file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); });
    console.error("Service Request Error:", err);
    res.status(500).json({ message: err.message || "Failed to submit service request." });
  }
});

// GET RELEVANT CALENDAR EVENTS + AUTOMATIC ASSIGNMENT / QUIZ DATES
router.get("/calendar-events", authMiddleware, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).lean();
    if (!student || student.role !== "student") return res.status(403).json({ message: "Students only." });
    const matchedSubjects = await studentSubjectQuery(student);
    const subjectIds = matchedSubjects.map(s=>s._id);
    const [adminEvents, assignments, quizzes] = await Promise.all([
      CalendarEvent.find({ $or:[{targetRoles:{ $in:["student"] }},{targetRoles:{ $exists:false }}], $and:[{ $or:[{targetCourse:"ALL"},{targetCourse:student.course},{targetCourse:student.department}] },{ $or:[{targetSemester:0},{targetSemester:student.semester||1}] }] }).sort({date:1}).lean(),
      Assignment.find({subject:{$in:subjectIds}}).populate("subject","subjectName subjectCode").lean(),
      Quiz.find({subject:{$in:subjectIds}}).populate("subject","subjectName subjectCode").lean(),
    ]);
    const events=[];
    for(const a of assignments){
      events.push({
        _id:`assignment-open-${a._id}`,
        date:a.publishDate||a.createdAt,
        title:a.title,
        category:"Assignment Open",
        subject:a.subject,
        color:"#3B82F6",
      });
      events.push({
        _id:`assignment-close-${a._id}`,
        date:a.dueDate,
        title:a.title,
        category:"Assignment Deadline",
        subject:a.subject,
        color:"#2563EB",
      });
    }
    for(const q of quizzes){
      const open=q.openDate||q.createdAt, close=q.closeDate||q.dueDate;
      events.push({
        _id:`quiz-open-${q._id}`,
        date:open,
        title:q.title,
        category:"Quiz Open",
        subject:q.subject,
        color:"#F59E0B",
      });
      if(close) events.push({
        _id:`quiz-close-${q._id}`,
        date:close,
        title:q.title,
        category:"Quiz Close",
        subject:q.subject,
        color:"#EF4444",
      });
    }
    for(const e of adminEvents){
      events.push({ ...e, color: e.color || ({
        "Holiday":"#DC2626",
        "Internal Exam":"#16A34A",
        "External Exam":"#7C3AED",
        "Event":"#2563EB",
        "Seminar":"#0891B2",
        "Sports Event":"#EA580C",
        "Hackathon":"#9333EA",
        "Workshop":"#0F766E",
        "General Event":"#64748B",
        "Other":"#475569",
      }[e.category] || "#3B82F6") });
    }
    events.sort((a,b)=>new Date(a.date)-new Date(b.date));
    res.status(200).json(events);
  } catch (err) { console.error("Fetch Student Calendar Error:", err); res.status(500).json({ message: "Failed to load calendar events." }); }
});

// GET COURSE TRACKER STRUCTURE + STUDENT PROGRESS
router.get("/course-tracker", authMiddleware, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).lean();
    if (!student || student.role !== "student") {
      return res.status(403).json({ message: "Students only." });
    }

    const subjects = await studentSubjectQuery(student);
    const subjectIds = subjects.map((s) => s._id);
    const trackers = await CourseTracker.find({ subject: { $in: subjectIds }, published: true })
      .populate("subject", "subjectName subjectCode")
      .lean();

    const result = trackers.map((tracker) => ({
      subject: tracker.subject,
      units: tracker.units || [],
      completedSubUnits: tracker.completedSubUnits || [],
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error("Course Tracker Fetch Error:", err);
    res.status(500).json({ message: "Failed to load course tracker." });
  }
});

// STUDENTS ONLY VIEW FACULTY-MARKED SYLLABUS PROGRESS.
router.put("/course-tracker/:subjectId/progress", authMiddleware, async (req, res) => {
  return res.status(403).json({ message: "Syllabus progress is controlled by faculty." });
});

module.exports = router;
