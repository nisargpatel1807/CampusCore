const router = require("express").Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const User = require("../models/user");
const Subject = require("../models/Subject");
const Assignment = require("../models/Assignment");
const Attendance = require("../models/Attendance");
const Material = require("../models/Material");
const Submission = require("../models/Submission");
const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");
const CourseTracker = require("../models/CourseTracker");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const CalendarEvent = require("../models/CalendarEvent");
const Notification = require("../models/Notification");

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const assignmentUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Only PDF, DOC, DOCX, PPT, PPTX or TXT files are allowed."));
    cb(null, true);
  },
});

const materialUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Unsupported material file type."));
    cb(null, true);
  },
});

router.use(authMiddleware, requireRole("teacher"));

const clean = (v) => String(v ?? "").trim();
const isObjectId = (v) => mongoose.isValidObjectId(v);
const removeFile = (file) => { if (file?.path) { try { fs.unlinkSync(file.path); } catch {} } };

const getMySubject = async (subjectId, teacherId) => {
  if (!isObjectId(subjectId)) return null;
  return Subject.findOne({ _id: subjectId, teacher: teacherId }).populate("course", "courseName courseCode durationYears").lean();
};

const studentMatchesSubject = (student, subject) => {
  const courseName = clean(subject?.course?.courseName).toLowerCase();
  const courseCode = clean(subject?.course?.courseCode).toLowerCase();
  const studentCourse = clean(student.course).toLowerCase();
  const studentDepartment = clean(student.department).toLowerCase();
  return (studentCourse === courseName || studentCourse === courseCode || studentDepartment === courseName || studentDepartment === courseCode)
    && Number(student.semester) === Number(subject.semester);
};

const validateQuestions = (questions) => {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100) return "Quiz must contain between 1 and 100 questions.";
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] || {};
    const qText = clean(q.questionText);
    if (qText.length < 3 || qText.length > 500) return `Question ${i + 1} must be between 3 and 500 characters.`;
    if (!Array.isArray(q.options) || q.options.length !== 4) return `Question ${i + 1} must have exactly 4 options.`;
    for (let j = 0; j < 4; j++) {
      const opt = clean(q.options[j]);
      if (opt.length < 1 || opt.length > 200) return `Question ${i + 1}, option ${j + 1} is invalid.`;
    }
    const answer = Number(q.correctAnswer);
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) return `Question ${i + 1} has an invalid correct answer.`;
  }
  return null;
};

// ===================== COURSE TRACKER =====================
// Admin defines the syllabus structure; faculty controls what has been completed.
router.get("/course-trackers", async (req, res) => {
  try {
    const subjects = await Subject.find({ teacher: req.user.id })
      .select("_id subjectName subjectCode semester course")
      .populate("course", "courseName courseCode")
      .lean();

    const subjectIds = subjects.map((subject) => subject._id);
    const trackers = await CourseTracker.find({ subject: { $in: subjectIds } })
      .populate("subject", "subjectName subjectCode semester course")
      .lean();

    const trackerMap = new Map(trackers.map((tracker) => [String(tracker.subject._id), tracker]));
    const result = subjects.map((subject) => trackerMap.get(String(subject._id)) || {
      subject,
      units: [],
      completedSubUnits: [],
      published: false,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("Fetch Teacher Course Trackers Error:", err);
    res.status(500).json({ message: "Failed to load course trackers." });
  }
});

router.put("/course-trackers/:subjectId/progress", async (req, res) => {
  try {
    const subjectId = clean(req.params.subjectId);
    if (!isObjectId(subjectId)) return res.status(400).json({ message: "Invalid subject ID." });

    const subject = await getMySubject(subjectId, req.user.id);
    if (!subject) return res.status(403).json({ message: "This subject is not assigned to you." });

    const tracker = await CourseTracker.findOne({ subject: subject._id });
    if (!tracker) return res.status(404).json({ message: "Course tracker has not been created by Admin yet." });
    if (!tracker.published) return res.status(400).json({ message: "Admin has not published this course tracker yet." });

    if (!Array.isArray(req.body.completedSubUnits)) {
      return res.status(400).json({ message: "completedSubUnits must be an array." });
    }

    const completedSubUnits = [...new Set(
      req.body.completedSubUnits.filter((key) => typeof key === "string" && /^\d+-\d+$/.test(key))
    )];

    const validKeys = new Set();
    (tracker.units || []).forEach((unit, unitIndex) => {
      (unit.subUnits || []).forEach((_, subIndex) => validKeys.add(`${unitIndex}-${subIndex}`));
    });

    const invalidKey = completedSubUnits.find((key) => !validKeys.has(key));
    if (invalidKey) {
      return res.status(400).json({ message: "One or more syllabus items are invalid." });
    }

    tracker.completedSubUnits = completedSubUnits;
    await tracker.save();

    res.status(200).json({
      message: "Syllabus progress updated successfully.",
      completedSubUnits: tracker.completedSubUnits,
    });
  } catch (err) {
    console.error("Update Teacher Course Tracker Progress Error:", err);
    res.status(500).json({ message: "Failed to update syllabus progress." });
  }
});

// ===================== QUIZZES =====================
router.post("/quizzes", async (req, res) => {
  try {
    const title = clean(req.body.title);
    const subjectId = clean(req.body.subject);
    const dueDate = new Date(req.body.dueDate);
    const timeLimitMinutes = Number(req.body.timeLimitMinutes);
    const questions = req.body.questions;

    if (title.length < 3 || title.length > 150) {
      return res.status(400).json({
        message: "Quiz title must be between 3 and 150 characters."
      });
    }

    const subject = await getMySubject(subjectId, req.user.id);

    if (!subject) {
      return res.status(403).json({
        message: "You can create quizzes only for your allocated subjects."
      });
    }

    if (!req.body.dueDate || Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({
        message: "Please provide a valid quiz due date."
      });
    }

    if (dueDate <= new Date()) {
      return res.status(400).json({
        message: "Quiz due date must be in the future."
      });
    }

    if (
      !Number.isInteger(timeLimitMinutes) ||
      timeLimitMinutes < 1 ||
      timeLimitMinutes > 180
    ) {
      return res.status(400).json({
        message: "Time limit must be between 1 and 180 minutes."
      });
    }

    const questionError = validateQuestions(questions);

    if (questionError) {
      return res.status(400).json({
        message: questionError
      });
    }

    const cleanedQuestions = questions.map((q) => ({
      questionText: clean(q.questionText),
      options: q.options.map((o) => clean(o)),
      correctAnswer: Number(q.correctAnswer),
    }));

    const quiz = await Quiz.create({
      title,
      subject: subjectId,
      teacher: req.user.id,
      timeLimitMinutes,
      dueDate,
      questions: cleanedQuestions,
    });

    res.status(201).json({
      message: "Quiz published successfully!",
      quiz
    });

  } catch (err) {
    console.error("Create Quiz Error:", err);

    res.status(500).json({
      message: err.message || "Failed to create quiz."
    });
  }
});

router.get("/quizzes", async (req, res) => {
  try {
    const quizzes = await Quiz.find({ teacher: req.user.id })
      .populate("subject", "subjectName subjectCode")
      .sort({ createdAt: -1 })
      .lean();
    res.json(quizzes);
  } catch (err) { res.status(500).json({ message: "Failed to load quizzes." }); }
});

router.get("/quizzes/:id/results", async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid quiz ID." });
    const quiz = await Quiz.findOne({ _id: req.params.id, teacher: req.user.id }).populate("subject", "subjectName subjectCode").lean();
    if (!quiz) return res.status(404).json({ message: "Quiz not found or unauthorized." });

    const attempts = await QuizAttempt.find({ quiz: quiz._id })
      .populate({ path: "student", model: User, select: "name id_no course semester email" })
      .sort({ score: -1, submittedAt: 1 })
      .lean();

    res.json({ quiz, attempts: attempts || [] });
  } catch (err) {
    res.status(500).json({ message: "Failed to load quiz results." });
  }
});

// ===================== DASHBOARD =====================
router.get("/dashboard-stats", async (req, res) => {
  try {
    const mySubjects = await Subject.find({ teacher: req.user.id })
      .populate("course", "courseName courseCode")
      .lean();

    const students = await User.find({ role: "student", status: true })
      .select("name id_no course department semester year status")
      .sort({ id_no: 1 })
      .lean();

    const myStudents = students.filter((student) => mySubjects.some((subject) => studentMatchesSubject(student, subject)));

    const assignments = await Assignment.find({ teacher: req.user.id })
      .populate("subject", "subjectName subjectCode")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      totalStudents: myStudents.length,
      totalAssignments: assignments.length,
      totalSubjects: mySubjects.length,
      recentAssignments: assignments.slice(0, 5),
      studentList: myStudents,
      subjects: mySubjects,
    });
  } catch (err) {
    console.error("Teacher Dashboard Stats:", err);
    res.status(500).json({ message: "Failed to load dashboard metrics." });
  }
});

// ===================== ASSIGNMENTS =====================
router.post("/assignments", assignmentUpload.single("file"), async (req, res) => {
  try {
    const title = clean(req.body.title);
    const description = clean(req.body.description);
    const subjectId = clean(req.body.subject);
    const dueDate = new Date(req.body.dueDate);

    if (title.length < 3 || title.length > 120) { removeFile(req.file); return res.status(400).json({ message: "Assignment title must be between 3 and 120 characters." }); }
    if (description.length > 3000) { removeFile(req.file); return res.status(400).json({ message: "Assignment description cannot exceed 3000 characters." }); }
    const subject = await getMySubject(subjectId, req.user.id);
    if (!subject) { removeFile(req.file); return res.status(403).json({ message: "You can publish assignments only for your allocated subjects." }); }
    if (!req.body.dueDate || Number.isNaN(dueDate.getTime())) { removeFile(req.file); return res.status(400).json({ message: "Please provide a valid due date." }); }
    if (dueDate <= new Date()) { removeFile(req.file); return res.status(400).json({ message: "Assignment due date must be in the future." }); }
    if (!description && !req.file) { return res.status(400).json({ message: "Provide assignment instructions, attach a file, or both." }); }

    const assignment = await Assignment.create({
      title,
      description,
      fileUrl: req.file ? `/uploads/${req.file.filename}` : "",
      subject: subjectId,
      teacher: req.user.id,
      publishDate: new Date(),
      dueDate,
    });
   try {
  const students = await User.find({
    role: "student",
    status: true
  })
    .select("_id course department semester")
    .lean();

  const matchedStudents = students.filter((st) =>
    studentMatchesSubject(st, subject)
  );

  if (matchedStudents.length) {
    await Notification.insertMany(
      matchedStudents.map((s) => ({
        recipient: s._id,
        recipientRole: "student",
        type: "ASSIGNMENT",
        title: `New Assignment: ${title}`,
        message: `${subject.subjectName} assignment is available. Due: ${dueDate.toLocaleString()}.`,
        link: "/student/dashboard?open=assignments",
        attachmentUrl: assignment.fileUrl || "",
        attachmentName: req.file?.originalname || "",
      }))
    );
  }
} catch (notificationError) {
  console.error(
    "Assignment notification failed:",
    notificationError
  );
}

    res.status(201).json({ message: "Assignment published successfully!", assignment });
  } catch (err) {
  console.error("Create Assignment:", err);

  res.status(500).json({
    message: err.message || "Failed to publish assignment."
  });
}
});

router.get("/assignments/:id/submissions", async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid assignment ID." });
    const assignment = await Assignment.findOne({ _id: req.params.id, teacher: req.user.id })
      .populate("subject", "subjectName subjectCode")
      .lean();
    if (!assignment) return res.status(404).json({ message: "Assignment not found or unauthorized." });

    const submissions = await Submission.find({ assignment: assignment._id })
      .populate({ path: "student", model: User, select: "name id_no course semester email profilePhoto" })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ assignment, submissions: submissions || [] });
  } catch (error) {
    res.status(500).json({ message: "Failed to load submissions." });
  }
});

// ===================== MATERIALS =====================
router.post("/upload-material", materialUpload.single("file"), async (req, res) => {
  try {
    const title = clean(req.body.title);
    const description = clean(req.body.description);
    const subjectId = clean(req.body.subjectId);

    if (title.length < 3 || title.length > 150) { removeFile(req.file); return res.status(400).json({ message: "Material title must be between 3 and 150 characters." }); }
    if (description.length > 2000) { removeFile(req.file); return res.status(400).json({ message: "Material description cannot exceed 2000 characters." }); }
    if (!req.file) return res.status(400).json({ message: "A study material file is required." });

    const subject = await getMySubject(subjectId, req.user.id);
    if (!subject) { removeFile(req.file); return res.status(403).json({ message: "You can upload material only for your allocated subjects." }); }

    const material = await Material.create({
      title,
      description,
      subject: subjectId,
      uploadedBy: req.user.id,
      fileUrl: `/uploads/${req.file.filename}`,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    });
    const students = await User.find({ role:"student", status:true }).select("_id course department semester").lean();
    const matchedStudents = students.filter(st=>studentMatchesSubject(st, subject));
    if(matchedStudents.length) await Notification.insertMany(matchedStudents.map(s=>({ recipient:s._id, recipientRole:"student", type:"MATERIAL", title:`New Material: ${title}`, message:`New study material was uploaded for ${subject.subjectName}.`, link:"/student/dashboard?open=materials", attachmentUrl:material.fileUrl, attachmentName:req.file.originalname })));

    res.status(201).json({ message: "Study material uploaded successfully!", material });
    } catch (err) {
    console.error("Upload Material Error:", err);

    res.status(500).json({
      message: err.message || "Failed to upload study material."
    });
  }
});

router.get("/materials", async (req, res) => {
  try {
    const materials = await Material.find({ uploadedBy: req.user.id })
      .populate("subject", "subjectName subjectCode")
      .sort({ createdAt: -1 })
      .lean();
    res.json(materials);
  } catch (err) { res.status(500).json({ message: "Failed to fetch study materials." }); }
});

router.delete("/materials/:id", async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid material ID." });
    const material = await Material.findOne({ _id: req.params.id, uploadedBy: req.user.id });
    if (!material) return res.status(404).json({ message: "Material not found or unauthorized." });

    const filePath = material.fileUrl?.startsWith("/uploads/") ? path.join(uploadDir, path.basename(material.fileUrl)) : "";
    await material.deleteOne();
    if (filePath) { try { fs.unlinkSync(filePath); } catch {} }
    res.json({ message: "Material deleted successfully!" });
  } catch (err) { res.status(500).json({ message: "Failed to delete material." }); }
});

// ===================== ATTENDANCE =====================
router.post("/attendance", async (req, res) => {
  try {
    const subjectId = clean(req.body.subjectId);
    const date = clean(req.body.date);
    const records = req.body.records;

    const subject = await getMySubject(subjectId, req.user.id);
    if (!subject) return res.status(403).json({ message: "You can mark attendance only for your allocated subjects." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "Please provide a valid attendance date." });
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ message: "Student attendance records are required." });

    const selectedDate = new Date(`${date}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (Number.isNaN(selectedDate.getTime())) return res.status(400).json({ message: "Invalid attendance date." });
    if (selectedDate.getDay() === 0) return res.status(400).json({ message: "Attendance cannot be recorded on Sundays." });
    if (selectedDate < today) return res.status(400).json({ message: "Past dates are not allowed for marking attendance." });

    const uniqueIds = new Set();
    const validStatuses = new Set(["present", "absent"]);
    const studentIds = [];
    for (const record of records) {
      if (!isObjectId(record?.student) || !validStatuses.has(record?.status)) return res.status(400).json({ message: "Attendance contains an invalid student or status." });
      const key = String(record.student);
      if (uniqueIds.has(key)) return res.status(400).json({ message: "Duplicate student found in attendance records." });
      uniqueIds.add(key);
      studentIds.push(record.student);
    }

    const students = await User.find({ _id: { $in: studentIds }, role: "student", status: true })
      .select("course department semester")
      .lean();
    if (students.length !== studentIds.length) return res.status(400).json({ message: "Attendance includes an invalid or inactive student." });
    if (students.some((student) => !studentMatchesSubject(student, subject))) return res.status(400).json({ message: "Attendance includes a student outside this subject's course/semester." });

    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    const exists = await Attendance.findOne({ subject: subjectId, date: { $gte: start, $lte: end } });
    if (exists) return res.status(409).json({ message: "Attendance for this subject has already been submitted for this date." });

    const entry = await Attendance.create({
      subject: subjectId,
      teacher: req.user.id,
      date: start,
      records,
    });

    res.status(201).json({ message: "Attendance registered successfully!", entry });
  } catch (err) {
    console.error("Save Attendance:", err);
    res.status(500).json({ message: "Failed to save attendance." });
  }
});

router.get("/attendance/history", async (req, res) => {
  try {
    const subjectId = clean(req.query.subjectId);
    const date = clean(req.query.date);
    const studentId = clean(req.query.studentId);

    const subject = await getMySubject(subjectId, req.user.id);
    if (!subject) return res.status(403).json({ message: "You can view attendance only for your allocated subjects." });

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "Invalid date." });
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      const record = await Attendance.findOne({ subject: subjectId, teacher: req.user.id, date: { $gte: start, $lte: end } })
        .populate({ path: "records.student", model: User, select: "name id_no course semester" })
        .lean();
      return res.json({ type: "byDate", date, records: record?.records || [] });
    }

    if (studentId) {
      if (!isObjectId(studentId)) return res.status(400).json({ message: "Invalid student ID." });
      const student = await User.findOne({ _id: studentId, role: "student", status: true }).select("course department semester name id_no").lean();
      if (!student || !studentMatchesSubject(student, subject)) return res.status(400).json({ message: "Selected student does not belong to this subject." });

      const history = await Attendance.find({ subject: subjectId, teacher: req.user.id, "records.student": studentId })
        .sort({ date: -1 })
        .lean();

      return res.json({
        type: "byStudent",
        studentId,
        history: history.map((att) => {
          const entry = att.records.find((r) => String(r.student) === String(studentId));
          return { date: att.date, status: entry?.status || "absent" };
        }),
      });
    }

    const summary = await Attendance.find({ subject: subjectId, teacher: req.user.id })
      .select("date records")
      .sort({ date: -1 })
      .lean();

    res.json({
      type: "summary",
      summary: summary.map((s) => ({
        _id: s._id,
        date: s.date,
        presentCount: s.records.filter((r) => r.status === "present").length,
        totalCount: s.records.length,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load attendance history." });
  }
});

// ===================== AUTOMATIC FACULTY CALENDAR =====================
router.get("/calendar-events", async (req,res)=>{
  try{
    const subjectIds=(await Subject.find({teacher:req.user.id}).select("_id").lean()).map(s=>s._id);
    const [assignments,quizzes,adminEvents]=await Promise.all([
      Assignment.find({teacher:req.user.id}).populate("subject","subjectName subjectCode").lean(),
      Quiz.find({teacher:req.user.id}).populate("subject","subjectName subjectCode").lean(),
      CalendarEvent.find({ $or:[{targetRoles:{ $in:["teacher"] }},{targetRoles:{ $exists:false }}] }).sort({date:1}).lean(),
    ]);
    const events=[];
    for(const a of assignments){ events.push({ _id:`assignment-open-${a._id}`, date:a.publishDate||a.createdAt, title:a.title, category:"Assignment Open", subject:a.subject }); events.push({ _id:`assignment-close-${a._id}`, date:a.dueDate, title:a.title, category:"Assignment Deadline", subject:a.subject }); }
    for(const q of quizzes){ const open=q.openDate||q.createdAt, close=q.closeDate||q.dueDate; events.push({ _id:`quiz-open-${q._id}`, date:open, title:q.title, category:"Quiz Open", subject:q.subject }); if(close) events.push({ _id:`quiz-close-${q._id}`, date:close, title:q.title, category:"Quiz Close", subject:q.subject }); }
    for(const e of adminEvents) events.push(e);
    events.sort((a,b)=>new Date(a.date)-new Date(b.date));
    res.json(events);
  }catch(err){ console.error("Teacher Automatic Calendar Error:",err); res.status(500).json({message:"Failed to load automatic calendar."}); }
});

module.exports = router;
