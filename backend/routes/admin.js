const router = require("express").Router();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const User = require("../models/user");
const Course = require("../models/course.JS");
const Subject = require("../models/Subject");
const ServiceRequest = require("../models/ServiceRequest");
const CalendarEvent = require("../models/CalendarEvent");
const CourseTracker = require("../models/CourseTracker");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const Notification = require("../models/Notification");
const HelpdeskStaff = require("../models/HelpdeskStaff");
const { sendHelpdeskAssignmentEmail } = require("../services/emailService");

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const profileUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG and WEBP profile photos are allowed."));
    }
    cb(null, true);
  },
});
const announcementUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Only PDF, JPG, PNG and WEBP attachments are allowed."));
    cb(null, true);
  },
});


router.use(authMiddleware, requireRole("admin"));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const idRegex = /^[A-Za-z0-9_-]+$/;
const codeRegex = /^[A-Z0-9-]+$/;

const clean = (value) => String(value ?? "").trim();
const isValidId = (id) => mongoose.isValidObjectId(id);

const validateName = (value, label = "Name") => {
  const v = clean(value);
  if (v.length < 2 || v.length > 100) return `${label} must be between 2 and 100 characters.`;
  if (!/[A-Za-z]/.test(v)) return `${label} must contain letters.`;
  return null;
};

const validateCode = (value, label) => {
  const v = clean(value).toUpperCase();
  if (v.length < 2 || v.length > 20) return `${label} must be between 2 and 20 characters.`;
  if (!codeRegex.test(v)) return `${label} may contain only letters, numbers and hyphens.`;
  return null;
};

const validateUserId = (value, label) => {
  const v = clean(value);
  if (v.length < 3 || v.length > 30) return `${label} must be between 3 and 30 characters.`;
  if (!idRegex.test(v)) return `${label} may contain only letters, numbers, hyphens and underscores.`;
  return null;
};

const validatePassword = (value) => {
  const v = String(value ?? "");
  if (v.length < 6 || v.length > 100) return "Password must be between 6 and 100 characters.";
  if (!v.trim()) return "Password cannot be blank.";
  return null;
};

const getCourseByName = async (courseName) => {
  const v = clean(courseName);
  return Course.findOne({ courseName: v });
};

const getTotalSemesters = (course) => Math.max(1, Number(course?.durationYears || 3) * 2);

const calculateYear = (semester) => {
  const year = Math.ceil(Number(semester) / 2);
  const suffix = ["st", "nd", "rd", "th"][Math.min(year - 1, 3)] || "th";
  return `${year}${suffix} Year`;
};

const removeUploadedFile = (file) => {
  if (!file?.path) return;
  try { fs.unlinkSync(file.path); } catch {}
};

// ======================= DASHBOARD =======================
router.get("/dashboard", async (req, res) => {
  try {
    const [students, teachers, courses, subjects] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "teacher" }),
      Course.countDocuments(),
      Subject.countDocuments(),
    ]);
    res.json({ students, teachers, courses, subjects });
  } catch (error) {
    console.error("Admin Dashboard:", error);
    res.status(500).json({ message: "Failed to load dashboard metrics." });
  }
});

router.get("/academic-meta", async (req, res) => {
  try {
    const [courses, teachers, subjects] = await Promise.all([
      Course.find().sort({ courseCode: 1 }).lean(),
      User.find({ role: "teacher" }).select("_id name id_no department status profilePhoto").sort({ name: 1 }).lean(),
      Subject.find()
        .populate("course", "courseName courseCode durationYears")
        .populate("teacher", "name id_no department")
        .sort({ subjectCode: 1 })
        .lean(),
    ]);
    res.json({ courses, teachers, subjects });
  } catch (error) {
    console.error("Admin Academic Meta:", error);
    res.status(500).json({ message: "Failed to fetch dropdown datasets." });
  }
});

// ======================= COURSE CRUD =======================
router.post("/course", async (req, res) => {
  try {
    const name = clean(req.body.courseName);
    const code = clean(req.body.courseCode).toUpperCase();
    const durationYears = Number(req.body.durationYears);

    const nameError = validateName(name, "Course name");
    const codeError = validateCode(code, "Course code");
    if (nameError) return res.status(400).json({ message: nameError });
    if (codeError) return res.status(400).json({ message: codeError });
    if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 5) {
      return res.status(400).json({ message: "Duration must be between 1 and 5 whole years." });
    }

    const duplicate = await Course.findOne({
      $or: [{ courseCode: code }, { courseName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }],
    });
    if (duplicate) return res.status(409).json({ message: "A course with this name or code already exists." });

    const course = await Course.create({ courseName: name, courseCode: code, durationYears });
    res.status(201).json({ message: "Course created successfully.", course });
  } catch (error) {
    console.error("Create Course:", error);
    res.status(500).json({ message: "Failed to create course." });
  }
});

router.get("/courses", async (req, res) => {
  try { res.json(await Course.find().sort({ courseCode: 1 }).lean()); }
  catch (error) { res.status(500).json({ message: "Failed to fetch courses." }); }
});

router.put("/course/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid course ID." });

    const name = clean(req.body.courseName);
    const code = clean(req.body.courseCode).toUpperCase();
    const durationYears = Number(req.body.durationYears);

    const nameError = validateName(name, "Course name");
    const codeError = validateCode(code, "Course code");
    if (nameError) return res.status(400).json({ message: nameError });
    if (codeError) return res.status(400).json({ message: codeError });
    if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 5) {
      return res.status(400).json({ message: "Duration must be between 1 and 5 whole years." });
    }

    const duplicate = await Course.findOne({
      _id: { $ne: req.params.id },
      $or: [{ courseCode: code }, { courseName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }],
    });
    if (duplicate) return res.status(409).json({ message: "Another course already uses this name or code." });

    const updated = await Course.findByIdAndUpdate(
      req.params.id,
      { courseName: name, courseCode: code, durationYears },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Course not found." });
    res.json({ message: "Course updated successfully.", course: updated });
  } catch (error) {
    console.error("Update Course:", error);
    res.status(500).json({ message: "Failed to update course." });
  }
});

// ======================= SUBJECT CRUD =======================
router.post("/subject", async (req, res) => {
  try {
    const subjectName = clean(req.body.subjectName);
    const subjectCode = clean(req.body.subjectCode).toUpperCase();
    const courseId = clean(req.body.courseId);
    const semester = Number(req.body.semester);
    const credits = Number(req.body.credits);
    const teacherId = clean(req.body.teacherId);

    const nameError = validateName(subjectName, "Subject name");
    const codeError = validateCode(subjectCode, "Subject code");
    if (nameError) return res.status(400).json({ message: nameError });
    if (codeError) return res.status(400).json({ message: codeError });
    if (!isValidId(courseId)) return res.status(400).json({ message: "Please select a valid course." });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Selected course was not found." });

    const maxSem = getTotalSemesters(course);
    if (!Number.isInteger(semester) || semester < 1 || semester > maxSem) {
      return res.status(400).json({ message: `Semester must be between 1 and ${maxSem} for this course.` });
    }
    if (!Number.isInteger(credits) || credits < 1 || credits > 10) {
      return res.status(400).json({ message: "Credits must be between 1 and 10." });
    }

    const duplicate = await Subject.findOne({
      $or: [
        { subjectCode },
        { subjectName: new RegExp(`^${subjectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), course: courseId, semester },
      ],
    });
    if (duplicate) return res.status(409).json({ message: "A subject with this code, or the same name in this course/semester, already exists." });

    let teacher = null;
    if (teacherId) {
      if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacher selected." });
      teacher = await User.findOne({ _id: teacherId, role: "teacher", status: true });
      if (!teacher) return res.status(400).json({ message: "Selected teacher is invalid or inactive." });
    }

    const subject = await Subject.create({
      subjectName,
      subjectCode,
      course: courseId,
      semester,
      credits,
      teacher: teacher?._id || null,
    });
    res.status(201).json({ message: "Subject registered successfully.", subject });
  } catch (error) {
    console.error("Create Subject:", error);
    res.status(500).json({ message: "Failed to create subject." });
  }
});

router.get("/subjects", async (req, res) => {
  try {
    const subjects = await Subject.find()
      .populate("course", "courseName courseCode durationYears")
      .populate("teacher", "name id_no department")
      .sort({ subjectCode: 1 })
      .lean();
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch subjects." });
  }
});

router.put("/subject/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid subject ID." });

    const subjectName = clean(req.body.subjectName);
    const subjectCode = clean(req.body.subjectCode).toUpperCase();
    const courseId = clean(req.body.courseId);
    const semester = Number(req.body.semester);
    const credits = Number(req.body.credits);
    const teacherId = clean(req.body.teacherId);

    const nameError = validateName(subjectName, "Subject name");
    const codeError = validateCode(subjectCode, "Subject code");
    if (nameError) return res.status(400).json({ message: nameError });
    if (codeError) return res.status(400).json({ message: codeError });
    if (!isValidId(courseId)) return res.status(400).json({ message: "Please select a valid course." });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Selected course was not found." });
    const maxSem = getTotalSemesters(course);
    if (!Number.isInteger(semester) || semester < 1 || semester > maxSem) {
      return res.status(400).json({ message: `Semester must be between 1 and ${maxSem} for this course.` });
    }
    if (!Number.isInteger(credits) || credits < 1 || credits > 10) {
      return res.status(400).json({ message: "Credits must be between 1 and 10." });
    }

    const duplicate = await Subject.findOne({
      _id: { $ne: req.params.id },
      $or: [
        { subjectCode },
        { subjectName: new RegExp(`^${subjectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), course: courseId, semester },
      ],
    });
    if (duplicate) return res.status(409).json({ message: "Another subject already uses this code or name in this course/semester." });

    let teacher = null;
    if (teacherId) {
      if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacher selected." });
      teacher = await User.findOne({ _id: teacherId, role: "teacher", status: true });
      if (!teacher) return res.status(400).json({ message: "Selected teacher is invalid or inactive." });
    }

    const updated = await Subject.findByIdAndUpdate(
      req.params.id,
      { subjectName, subjectCode, course: courseId, semester, credits, teacher: teacher?._id || null },
      { new: true, runValidators: true }
    ).populate("course", "courseName courseCode durationYears").populate("teacher", "name id_no department");

    if (!updated) return res.status(404).json({ message: "Subject not found." });
    res.json({ message: "Subject updated successfully.", subject: updated });
  } catch (error) {
    console.error("Update Subject:", error);
    res.status(500).json({ message: "Failed to update subject." });
  }
});

router.put("/assign-subject", async (req, res) => {
  try {
    const subjectId = clean(req.body.subjectId);
    const teacherId = clean(req.body.teacherId);
    if (!isValidId(subjectId) || !isValidId(teacherId)) {
      return res.status(400).json({ message: "Please select a valid subject and teacher." });
    }

    const subject = await Subject.findById(subjectId).populate("course", "courseName courseCode");
    if (!subject) return res.status(404).json({ message: "Subject not found." });

    const teacher = await User.findOne({ _id: teacherId, role: "teacher", status: true });
    if (!teacher) return res.status(400).json({ message: "Selected teacher is invalid or inactive." });

    const assigned = await Subject.findByIdAndUpdate(subjectId, { teacher: teacherId }, { new: true })
      .populate("course", "courseName courseCode durationYears")
      .populate("teacher", "name id_no department");

    res.json({ message: "Teacher assigned successfully.", subject: assigned });
  } catch (error) {
    res.status(500).json({ message: "Failed to assign teacher." });
  }
});

// ======================= TEACHER MANAGEMENT =======================
router.post("/teacher", profileUpload.single("profilePhoto"), async (req, res) => {
  try {
    const name = clean(req.body.name);
    const id_no = clean(req.body.id_no);
    const password = String(req.body.password ?? "");
    const department = clean(req.body.department);

    const nameError = validateName(name, "Teacher name");
    const idError = validateUserId(id_no, "Faculty ID");
    const passError = validatePassword(password);
    if (nameError || idError || passError) {
      removeUploadedFile(req.file);
      return res.status(400).json({ message: nameError || idError || passError });
    }
    if (department.length < 2 || department.length > 100) {
      removeUploadedFile(req.file);
      return res.status(400).json({ message: "Course / department must be between 2 and 100 characters." });
    }

    const duplicate = await User.findOne({ id_no });
    if (duplicate) {
      removeUploadedFile(req.file);
      return res.status(409).json({ message: `ID '${id_no}' is already registered.` });
    }

    const email = `${id_no.toLowerCase()}@campuscore.edu`;
    const emailTaken = await User.findOne({ email });
    if (emailTaken) {
      removeUploadedFile(req.file);
      return res.status(409).json({ message: "The generated institutional email already exists." });
    }

    const teacher = await User.create({
      name,
      id_no,
      email,
      password: await bcrypt.hash(password, 10),
      role: "teacher",
      department,
      course: department,
      profilePhoto: req.file ? `/uploads/${req.file.filename}` : "",
      status: true,
    });

    res.status(201).json({ message: "Teacher registered successfully.", teacher: { ...teacher.toObject(), password: undefined } });
  } catch (error) {
    removeUploadedFile(req.file);
    console.error("Create Teacher:", error);
    res.status(500).json({ message: "Failed to create teacher account." });
  }
});

router.get("/teachers", async (req, res) => {
  try {
    res.json(await User.find({ role: "teacher" }).select("-password").sort({ id_no: 1 }).lean());
  } catch (error) { res.status(500).json({ message: "Failed to fetch teachers." }); }
});

router.put("/teacher/:id", profileUpload.single("profilePhoto"), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) { removeUploadedFile(req.file); return res.status(400).json({ message: "Invalid teacher ID." }); }

    const teacher = await User.findOne({ _id: req.params.id, role: "teacher" });
    if (!teacher) { removeUploadedFile(req.file); return res.status(404).json({ message: "Teacher not found." }); }

    const name = clean(req.body.name);
    const id_no = clean(req.body.id_no);
    const department = clean(req.body.department);

    const nameError = validateName(name, "Teacher name");
    const idError = validateUserId(id_no, "Faculty ID");
    if (nameError || idError) { removeUploadedFile(req.file); return res.status(400).json({ message: nameError || idError }); }
    if (department.length < 2 || department.length > 100) { removeUploadedFile(req.file); return res.status(400).json({ message: "Course / department must be between 2 and 100 characters." }); }

    const duplicate = await User.findOne({ id_no, _id: { $ne: teacher._id } });
    if (duplicate) { removeUploadedFile(req.file); return res.status(409).json({ message: "This Faculty ID is already in use." }); }

    teacher.name = name;
    teacher.id_no = id_no;
    teacher.department = department;
    teacher.course = department;
    if (req.file) teacher.profilePhoto = `/uploads/${req.file.filename}`;
    await teacher.save();

    res.json({ message: "Teacher updated successfully.", teacher: { ...teacher.toObject(), password: undefined } });
  } catch (error) {
    removeUploadedFile(req.file);
    res.status(500).json({ message: "Failed to update teacher." });
  }
});

// ======================= STUDENT MANAGEMENT =======================
router.get("/student-next-id", async (req, res) => {
  try {
    const ids = await User.find({ role: "student" }).select("id_no").lean();
    let max = 0;
    ids.forEach(({ id_no }) => {
      const m = /^STU(\d+)$/i.exec(String(id_no || "").trim());
      if (m) max = Math.max(max, Number(m[1]));
    });
    res.json({ suggestedId: `STU${String(max + 1).padStart(4, "0")}` });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate the next suggested enrollment number." });
  }
});

router.post("/student", profileUpload.single("profilePhoto"), async (req, res) => {
  try {
    const name = clean(req.body.name);
    const id_no = clean(req.body.id_no);
    const password = String(req.body.password ?? "");
    const courseName = clean(req.body.course);
    const semester = Number(req.body.semester);

    const nameError = validateName(name, "Student name");
    const idError = validateUserId(id_no, "Enrollment number");
    const passError = validatePassword(password);
    if (nameError || idError || passError) {
      removeUploadedFile(req.file);
      return res.status(400).json({ message: nameError || idError || passError });
    }
    if (!courseName) { removeUploadedFile(req.file); return res.status(400).json({ message: "Please select a degree / course." }); }

    const course = await getCourseByName(courseName);
    if (!course) { removeUploadedFile(req.file); return res.status(400).json({ message: "Selected course does not exist." }); }

    const maxSem = getTotalSemesters(course);
    if (!Number.isInteger(semester) || semester < 1 || semester > maxSem) {
      removeUploadedFile(req.file);
      return res.status(400).json({ message: `Semester must be between 1 and ${maxSem}.` });
    }

    const duplicate = await User.findOne({ id_no });
    if (duplicate) {
      removeUploadedFile(req.file);
      return res.status(409).json({ message: `Enrollment number '${id_no}' is already in use.` });
    }

    const email = `${id_no.toLowerCase()}@campuscore.edu`;
    const emailTaken = await User.findOne({ email });
    if (emailTaken) {
      removeUploadedFile(req.file);
      return res.status(409).json({ message: "The generated institutional email already exists." });
    }

    const year = calculateYear(semester);
    const student = await User.create({
      name,
      id_no,
      email,
      password: await bcrypt.hash(password, 10),
      role: "student",
      course: course.courseName,
      department: course.courseName,
      semester,
      year,
      profilePhoto: req.file ? `/uploads/${req.file.filename}` : "",
      status: true,
    });

    res.status(201).json({ message: "Student enrolled successfully.", student: { ...student.toObject(), password: undefined } });
  } catch (error) {
    removeUploadedFile(req.file);
    console.error("Create Student:", error);
    res.status(500).json({ message: "Failed to enroll student." });
  }
});

router.get("/students", async (req, res) => {
  try {
    const course = clean(req.query.course);
    const semester = clean(req.query.semester);
    const filter = { role: "student" };
    if (course && course !== "ALL") filter.$or = [{ course }, { department: course }];
    if (semester && semester !== "ALL") {
      const sem = Number(semester);
      if (!Number.isInteger(sem) || sem < 1 || sem > 20) return res.status(400).json({ message: "Invalid semester filter." });
      filter.semester = sem;
    }
    res.json(await User.find(filter).select("-password").sort({ id_no: 1 }).lean());
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch students." });
  }
});

router.put("/student/:id", profileUpload.single("profilePhoto"), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) { removeUploadedFile(req.file); return res.status(400).json({ message: "Invalid student ID." }); }

    const student = await User.findOne({ _id: req.params.id, role: "student" });
    if (!student) { removeUploadedFile(req.file); return res.status(404).json({ message: "Student not found." }); }

    const name = clean(req.body.name);
    const id_no = clean(req.body.id_no);
    const courseName = clean(req.body.course);
    const semester = Number(req.body.semester);

    const nameError = validateName(name, "Student name");
    const idError = validateUserId(id_no, "Enrollment number");
    if (nameError || idError) { removeUploadedFile(req.file); return res.status(400).json({ message: nameError || idError }); }

    const course = await getCourseByName(courseName);
    if (!course) { removeUploadedFile(req.file); return res.status(400).json({ message: "Selected course does not exist." }); }

    const maxSem = getTotalSemesters(course);
    if (!Number.isInteger(semester) || semester < 1 || semester > maxSem) {
      removeUploadedFile(req.file);
      return res.status(400).json({ message: `Semester must be between 1 and ${maxSem}.` });
    }

    const duplicate = await User.findOne({ id_no, _id: { $ne: student._id } });
    if (duplicate) { removeUploadedFile(req.file); return res.status(409).json({ message: "This enrollment number is already used by another user." }); }

    student.name = name;
    student.id_no = id_no;
    student.course = course.courseName;
    student.department = course.courseName;
    student.semester = semester;
    student.year = calculateYear(semester);
    student.email = `${id_no.toLowerCase()}@campuscore.edu`;
    if (req.file) student.profilePhoto = `/uploads/${req.file.filename}`;
    await student.save();

    res.json({ message: "Student record updated successfully.", student: { ...student.toObject(), password: undefined } });
  } catch (error) {
    removeUploadedFile(req.file);
    console.error("Update Student:", error);
    res.status(500).json({ message: "Failed to update student record." });
  }
});

// ======================= STATUS =======================
router.put("/toggle/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid user ID." });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.role === "admin" && user._id.toString() === req.user.id) {
      return res.status(400).json({ message: "You cannot deactivate your own admin account." });
    }
    user.status = !user.status;
    await user.save();
    res.json({ message: `${user.name} is now ${user.status ? "Active" : "Inactive"}.`, status: user.status, user: { ...user.toObject(), password: undefined } });
  } catch (error) { res.status(500).json({ message: "Failed to toggle user status." }); }
});

// ======================= HELPDESK =======================
router.get("/service-requests", async (req, res) => {
  try {
    const requests = await ServiceRequest.find()
      .populate({ path: "student", model: User, select: "name id_no course semester profilePhoto" })
      .populate({ path: "assignedTo", model: User, select: "name id_no role department profilePhoto" })
      .populate({ path: "assignedStaff", model: HelpdeskStaff, select: "name email mobile department active" })
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to load campus requests." });
  }
});

router.get("/service-staff", async (req, res) => {
  try {
    const staff = await HelpdeskStaff.find({ active: true }).sort({ name: 1 }).lean();
    res.json(staff);
  } catch (error) {
    console.error("Helpdesk Staff Fetch:", error);
    res.status(500).json({ message: "Failed to load helpdesk staff." });
  }
});

router.post("/service-staff", async (req, res) => {
  try {
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const mobile = clean(req.body.mobile);
    const department = clean(req.body.department);

    if (name.length < 2 || name.length > 100) return res.status(400).json({ message: "Staff name must be between 2 and 100 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Please provide a valid staff email address." });
    if (mobile && !/^[0-9+()\-\s]{7,20}$/.test(mobile)) return res.status(400).json({ message: "Please provide a valid mobile number." });
    if (department.length < 2 || department.length > 100) return res.status(400).json({ message: "Department / type must be between 2 and 100 characters." });

    const existing = await HelpdeskStaff.findOne({ email });
    if (existing) return res.status(409).json({ message: "A helpdesk staff member with this email already exists." });

    const staff = await HelpdeskStaff.create({ name, email, mobile, department, active: true });
    res.status(201).json({ message: "Helpdesk staff added successfully.", staff });
  } catch (error) {
    console.error("Create Helpdesk Staff:", error);
    res.status(500).json({ message: "Failed to add helpdesk staff." });
  }
});

router.put("/service-requests/:id/assign", async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.body.staffId)) {
      return res.status(400).json({ message: "Invalid request or staff ID." });
    }

    const [request, staff] = await Promise.all([
      ServiceRequest.findById(req.params.id).populate("student", "name id_no course semester email"),
      HelpdeskStaff.findOne({ _id: req.body.staffId, active: true }).lean(),
    ]);

    if (!request) return res.status(404).json({ message: "Helpdesk request not found." });
    if (!staff) return res.status(404).json({ message: "Selected helpdesk staff member was not found or is inactive." });

    request.assignedStaff = staff._id;
    request.status = request.status === "Rejected" || request.status === "Fixed" ? "Assigned" : request.status;
    await request.save();

    let emailResult = { sent: false, skipped: false, failed: false };
    try {
      emailResult = await sendHelpdeskAssignmentEmail({ staff, request });
    } catch (emailError) {
      console.error("Helpdesk assignment email error:", emailError);
      emailResult = { sent: false, skipped: false, failed: true, error: emailError.message };
    }

    await Notification.create({
      recipient: req.user.id,
      recipientRole: "admin",
      type: "HELPDESK",
      title: "Helpdesk Request Assigned",
      message: `${request.category} request ${request._id} assigned to ${staff.name}.`,
      link: "/admin/dashboard?open=helpdesk",
    });

    res.json({
      message: "Helpdesk request assigned successfully.",
      emailSent: Boolean(emailResult.sent),
      emailSkipped: Boolean(emailResult.skipped),
      staff,
      request,
    });
  } catch (error) {
    console.error("Assign Helpdesk Request:", error);
    res.status(500).json({ message: error.message || "Failed to assign helpdesk request." });
  }
});

router.put("/service-requests/:id/status", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid request ID." });
    const allowed = ["Assigned", "In Progress", "Awaiting Verification", "Fixed", "Rejected"];
    const status = clean(req.body.status);
    if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid status value." });

    const payload = { status };
    if (req.body.adminNote !== undefined) {
      const adminNote = clean(req.body.adminNote);
      if (adminNote.length > 1000) return res.status(400).json({ message: "Admin note cannot exceed 1000 characters." });
      payload.adminNote = adminNote;
    }
    if (status === "Rejected") {
      const reason = clean(req.body.rejectionReason);
      if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: "Rejection reason must be 5–500 characters." });
      payload.rejectionReason = reason;
    }

    const updated = await ServiceRequest.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }).populate("student", "name role");
    if (!updated) return res.status(404).json({ message: "Helpdesk request not found." });
    if (updated.student?._id) {
      await Notification.create({ recipient: updated.student._id, recipientRole: "student", type: "HELPDESK", title: "Helpdesk Updated", message: `Your ${updated.category || "campus"} request is now ${status}.`, link: "/student/dashboard?open=helpdesk" });
    }
    res.json({ message: `Request status updated to ${status}.`, updated });
  } catch (error) { res.status(500).json({ message: "Failed to update request status." }); }
});

// ======================= ANNOUNCEMENTS =======================
router.post("/announcements", announcementUpload.single("attachment"), async (req,res)=>{
  try {
    const title=clean(req.body.title); const message=clean(req.body.message); const audience=clean(req.body.audience)||"all";
    const type=clean(req.body.type)||"Announcement"; const targetCourse=clean(req.body.targetCourse)||"ALL";
    const targetSemester=Number(req.body.targetSemester||0); const eventDate=clean(req.body.eventDate); const eventTime=clean(req.body.eventTime);
    if(title.length<2||title.length>160) return res.status(400).json({message:"Announcement title must be 2–160 characters."});
    if(message.length<2||message.length>1000) return res.status(400).json({message:"Announcement message must be 2–1000 characters."});
    if(!["all","students","teachers"].includes(audience)) return res.status(400).json({message:"Invalid audience."});
    if(!Number.isInteger(targetSemester)||targetSemester<0||targetSemester>20) return res.status(400).json({message:"Invalid semester target."});
    if(targetCourse!=="ALL" && !(await Course.findOne({courseName:targetCourse}))) return res.status(400).json({message:"Selected target course does not exist."});
    if(eventDate && Number.isNaN(new Date(`${eventDate}T${eventTime||"09:00"}`).getTime())) return res.status(400).json({message:"Please provide a valid calendar date."});
    const roles = audience==="all"?["student","teacher"]:audience==="students"?["student"]:["teacher"];
    const users = await User.find({ role:{ $in:roles }, status:true }).select("_id role course department semester").lean();
    const normalize=(v)=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const filtered=users.filter(u=>{ if(targetSemester && Number(u.semester)!==targetSemester) return false; if(targetCourse==="ALL") return true; return [u.course,u.department].map(normalize).includes(normalize(targetCourse)); });
    const attachmentUrl=req.file?`/uploads/${req.file.filename}`:""; const attachmentName=req.file?.originalname||"";
    const notifications=filtered.map(u=>({ recipient:u._id, recipientRole:u.role, type:type.toUpperCase().replace(/[^A-Z0-9]+/g,"_").slice(0,50), title, message, link:u.role==="student"?"/student/dashboard?open=calendar":"/teacher/dashboard?open=calendar", attachmentUrl, attachmentName }));
    if(notifications.length) await Notification.insertMany(notifications);
    if(eventDate){
      const d=new Date(`${eventDate}T${eventTime||"09:00"}`);
      let category="General Event"; if(type==="Holiday") category="Holiday"; else if(type==="Exam") category="Internal Exam";
      await CalendarEvent.create({ title, date:d, category, targetCourse, targetSemester, targetRoles:roles });
    }
    res.status(201).json({message:`Announcement sent to ${notifications.length} recipient(s).`, recipients:notifications.length});
  }catch(err){ if(req.file?.path) removeUploadedFile(req.file); console.error("Announcement Error:",err); res.status(500).json({message:err.message||"Failed to send announcement."}); }
});

// ======================= CALENDAR =======================
router.get("/calendar-events", async (req, res) => {
  try { res.json(await CalendarEvent.find().sort({ date: 1 }).lean()); }
  catch (error) { res.status(500).json({ message: "Failed to fetch calendar events." }); }
});

router.post("/calendar-event", async (req, res) => {
  try {
    const title = clean(req.body.title);
    const date = clean(req.body.date);
    const category = clean(req.body.category);
    const customCategory = clean(req.body.customCategory);
    const color = clean(req.body.color) || "#3B82F6";
    const targetCourse = clean(req.body.targetCourse) || "ALL";
    const targetSemester = Number(req.body.targetSemester || 0);

    const allowedCategories = [
      "Holiday",
      "Internal Exam",
      "External Exam",
      "Event",
      "Seminar",
      "Sports Event",
      "Hackathon",
      "Workshop",
      "Assignment Deadline",
      "Quiz",
      "Other",
    ];

    if (title.length < 2 || title.length > 160) {
      return res.status(400).json({ message: "Event title must be between 2 and 160 characters." });
    }

    const parsed = new Date(date);
    if (!date || Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ message: "Please provide a valid event date." });
    }

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ message: "Invalid calendar category." });
    }

    if (category === "Other" && (customCategory.length < 2 || customCategory.length > 80)) {
      return res.status(400).json({ message: "Custom event type must be between 2 and 80 characters." });
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ message: "Please provide a valid 6-digit hex color." });
    }

    if (!Number.isInteger(targetSemester) || targetSemester < 0 || targetSemester > 20) {
      return res.status(400).json({ message: "Invalid target semester." });
    }

    if (targetCourse !== "ALL") {
      const course = await Course.findOne({ courseName: targetCourse });
      if (!course) return res.status(400).json({ message: "Selected target course does not exist." });
      const maxSem = getTotalSemesters(course);
      if (targetSemester > maxSem) {
        return res.status(400).json({ message: `Target semester must be 0 or between 1 and ${maxSem}.` });
      }
    }

    const event = await CalendarEvent.create({
      title,
      date: parsed,
      category,
      customCategory: category === "Other" ? customCategory : "",
      color,
      targetCourse,
      targetSemester,
      targetRoles: ["admin", "teacher", "student"],
    });

    // A manually created student-facing calendar event also creates a notification.
    const recipients = await User.find({
      role: { $in: ["student", "teacher"] },
      status: true,
      ...(targetCourse === "ALL" ? {} : {
        $or: [{ course: targetCourse }, { department: targetCourse }],
      }),
      ...(targetSemester === 0 ? {} : { semester: targetSemester }),
    }).select("_id role").lean();

    if (recipients.length) {
      const displayCategory = category === "Other" && customCategory ? customCategory : category;
      await Notification.create(
        recipients.map((recipient) => ({
          recipient: recipient._id,
          recipientRole: recipient.role,
          type: "CALENDAR_EVENT",
          title,
          message: `${displayCategory} scheduled for ${parsed.toLocaleDateString()}.`,
          link: recipient.role === "student" ? "/student/dashboard?open=calendar" : "/teacher/dashboard",
          isRead: false,
        })),
      );
    }

    res.status(201).json({ message: "Calendar event published successfully.", event });
  } catch (error) {
    console.error("Create Calendar Event:", error);
    res.status(500).json({ message: error.message || "Failed to create calendar event." });
  }
});

router.delete("/calendar-event/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid event ID." });
    const deleted = await CalendarEvent.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Calendar event not found." });
    res.json({ message: "Event removed successfully." });
  } catch (error) { res.status(500).json({ message: "Failed to delete calendar event." }); }
});


// ==========================================
// 8. COURSE TRACKER MANAGER (ADMIN)
// ==========================================
router.get("/course-trackers", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only." });
    }

    const trackers = await CourseTracker.find()
      .populate("subject", "subjectName subjectCode semester course")
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json(trackers || []);
  } catch (err) {
    console.error("Fetch Course Trackers Error:", err);
    res.status(500).json({ message: "Failed to load course trackers." });
  }
});

router.get("/course-trackers/:subjectId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only." });
    }

    const tracker = await CourseTracker.findOne({ subject: req.params.subjectId })
      .populate("subject", "subjectName subjectCode semester course")
      .lean();

    res.status(200).json(tracker || null);
  } catch (err) {
    console.error("Fetch Course Tracker Error:", err);
    res.status(500).json({ message: "Failed to load course tracker." });
  }
});

router.put("/course-trackers/:subjectId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only." });
    }

    const { units, published } = req.body;
    const subject = await Subject.findById(req.params.subjectId).populate("course", "courseName durationYears").lean();

    if (!subject) return res.status(404).json({ message: "Subject not found." });

    if (!Array.isArray(units) || units.length === 0) {
      return res.status(400).json({ message: "Add at least one unit." });
    }
    if (units.length > 50) {
      return res.status(400).json({ message: "Maximum 50 units are allowed." });
    }

    const cleanedUnits = units.map((unit, unitIndex) => {
      const title = String(unit?.title || "").trim();
      if (title.length < 2 || title.length > 150) {
        throw new Error(`Unit ${unitIndex + 1} title must be 2-150 characters.`);
      }

      const subUnits = Array.isArray(unit?.subUnits) ? unit.subUnits : [];
      if (subUnits.length > 100) {
        throw new Error(`Unit ${unitIndex + 1} cannot contain more than 100 subunits.`);
      }

      return {
        title,
        order: unitIndex,
        subUnits: subUnits.map((sub, subIndex) => {
          const subTitle = String(sub?.title || "").trim();
          if (subTitle.length < 2 || subTitle.length > 150) {
            throw new Error(`Subunit ${unitIndex + 1}.${subIndex + 1} title must be 2-150 characters.`);
          }
          return { title: subTitle, order: subIndex };
        }),
      };
    });

    const existingTracker = await CourseTracker.findOne({ subject: subject._id }).lean();
    const validKeys = new Set();
    cleanedUnits.forEach((unit, unitIndex) => {
      (unit.subUnits || []).forEach((_, subIndex) => validKeys.add(`${unitIndex}-${subIndex}`));
    });
    const preservedCompleted = (existingTracker?.completedSubUnits || []).filter((key) => validKeys.has(key));

    const tracker = await CourseTracker.findOneAndUpdate(
      { subject: subject._id },
      { $set: { units: cleanedUnits, completedSubUnits: preservedCompleted, published: Boolean(published) } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).populate("subject", "subjectName subjectCode semester course");

    res.status(200).json({ message: published ? "Course tracker published successfully." : "Course tracker saved as draft.", tracker });
  } catch (err) {
    console.error("Save Course Tracker Error:", err);
    res.status(400).json({ message: err.message || "Failed to save course tracker." });
  }
});

module.exports = router;
