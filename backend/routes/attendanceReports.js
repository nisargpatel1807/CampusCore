const router = require("express").Router();
const mongoose = require("mongoose");

const User = require("../models/user");
const Subject = require("../models/Subject");
const Attendance = require("../models/Attendance");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const MIN_ATTENDANCE_PERCENT = (() => {
  const value = Number(process.env.ATTENDANCE_MIN_PERCENT || 80);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : 80;
})();

const clean = (value) => String(value ?? "").trim();
const isObjectId = (value) => mongoose.isValidObjectId(value);

const normalize = (value) => clean(value).toLowerCase();

const studentMatchesSubject = (student, subject) => {
  const courseName = normalize(subject?.course?.courseName);
  const courseCode = normalize(subject?.course?.courseCode);
  const studentCourse = normalize(student?.course);
  const studentDepartment = normalize(student?.department);
  const matchesCourse = [studentCourse, studentDepartment].filter(Boolean).some(
    (value) => value === courseName || value === courseCode,
  );
  return matchesCourse && Number(student?.semester) === Number(subject?.semester);
};

const buildWindow = (fromDate, toDate) => {
  const from = clean(fromDate);
  const to = clean(toDate);
  if (!from && !to) return null;

  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    throw new Error("From date must use YYYY-MM-DD format.");
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("To date must use YYYY-MM-DD format.");
  }

  const start = from ? new Date(`${from}T00:00:00`) : null;
  const end = to ? new Date(`${to}T23:59:59.999`) : null;
  if (start && Number.isNaN(start.getTime())) throw new Error("Invalid from date.");
  if (end && Number.isNaN(end.getTime())) throw new Error("Invalid to date.");
  if (start && end && start > end) throw new Error("From date cannot be after to date.");

  return { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
};

const attendanceStats = (total, attended) => {
  const percentage = total > 0 ? Number(((attended / total) * 100).toFixed(2)) : 0;
  const minimum = MIN_ATTENDANCE_PERCENT;

  let lecturesNeeded = 0;
  if (percentage < minimum && minimum < 100) {
    const threshold = minimum / 100;
    lecturesNeeded = Math.ceil((threshold * total - attended) / (1 - threshold));
    lecturesNeeded = Math.max(0, lecturesNeeded);
  }

  let maxFutureAbsences = 0;
  if (minimum > 0 && total > 0) {
    maxFutureAbsences = Math.max(0, Math.floor(attended / (minimum / 100) - total));
  }

  return {
    totalLectures: total,
    attended,
    absent: Math.max(0, total - attended),
    percentage,
    requiredPercent: minimum,
    belowRequired: percentage < minimum,
    lecturesNeeded,
    maxFutureAbsences,
  };
};

const buildStudentSubjectRows = (subjects, attendanceRows, studentId) => {
  const rows = [];

  for (const subject of subjects) {
    const subjectAttendance = attendanceRows.filter((entry) => String(entry.subject) === String(subject._id));
    let total = 0;
    let attended = 0;

    for (const entry of subjectAttendance) {
      const record = (entry.records || []).find((item) => String(item.student) === String(studentId));
      if (!record) continue;
      total += 1;
      if (record.status === "present") attended += 1;
    }

    rows.push({
      subjectId: subject._id,
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      credit: subject.credits,
      semester: subject.semester,
      ...attendanceStats(total, attended),
    });
  }

  return rows;
};

router.use(authMiddleware);

/* ===================== STUDENT ===================== */
router.get("/student", requireRole("student"), async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.user.id, role: "student", status: true }).lean();
    if (!student) return res.status(404).json({ message: "Student account not found." });

    const subjects = await Subject.find().populate("course", "courseName courseCode durationYears").sort({ semester: 1, subjectCode: 1 }).lean();
    const matchedSubjects = subjects.filter((subject) => studentMatchesSubject(student, subject));
    const subjectIds = matchedSubjects.map((subject) => subject._id);

    const attendanceRows = subjectIds.length
      ? await Attendance.find({ subject: { $in: subjectIds }, "records.student": student._id }).sort({ date: -1 }).lean()
      : [];

    const rows = buildStudentSubjectRows(matchedSubjects, attendanceRows, student._id);
    const overallTotal = rows.reduce((sum, row) => sum + row.totalLectures, 0);
    const overallAttended = rows.reduce((sum, row) => sum + row.attended, 0);
    const overall = attendanceStats(overallTotal, overallAttended);

    res.json({
      student: {
        name: student.name,
        id_no: student.id_no,
        course: student.course || student.department || "General",
        semester: student.semester,
        division: student.division || "A",
      },
      minimumRequiredPercent: MIN_ATTENDANCE_PERCENT,
      overall,
      lowAttendanceCount: rows.filter((row) => row.belowRequired).length,
      subjects: rows,
      message: "Attendance report loaded successfully.",
    });
  } catch (err) {
    console.error("Student Attendance Report Error:", err);
    res.status(400).json({ message: err.message || "Failed to load student attendance report." });
  }
});

/* ===================== TEACHER ===================== */
router.get("/teacher", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.user.id;
    const subjectId = clean(req.query.subjectId);
    const division = clean(req.query.division);
    const fromDate = clean(req.query.fromDate);
    const toDate = clean(req.query.toDate);
    const dateWindow = buildWindow(fromDate, toDate);

    const subjectFilter = { teacher: teacherId };
    if (subjectId) {
      if (!isObjectId(subjectId)) return res.status(400).json({ message: "Invalid subject ID." });
      subjectFilter._id = subjectId;
    }

    const subjects = await Subject.find(subjectFilter)
      .populate("course", "courseName courseCode durationYears")
      .sort({ semester: 1, subjectCode: 1 })
      .lean();

    if (subjectId && subjects.length === 0) {
      return res.status(404).json({ message: "Subject not found or not allocated to you." });
    }

    const subjectIds = subjects.map((subject) => subject._id);
    const attendanceQuery = subjectIds.length ? { subject: { $in: subjectIds } } : { subject: null };
    if (dateWindow) attendanceQuery.date = dateWindow;

    const attendanceRows = subjectIds.length ? await Attendance.find(attendanceQuery).sort({ date: -1 }).lean() : [];
    const studentQuery = { role: "student", status: true };
    if (division) studentQuery.division = division;
    const allStudents = await User.find(studentQuery).select("name id_no course department semester division").sort({ id_no: 1 }).lean();

    const rows = [];
    const subjectSummaries = [];

    for (const subject of subjects) {
      const enrolledStudents = allStudents.filter((student) => studentMatchesSubject(student, subject));
      const subjectAttendance = attendanceRows.filter((entry) => String(entry.subject) === String(subject._id));
      const studentRows = enrolledStudents.map((student) => {
        let total = 0;
        let attended = 0;
        for (const entry of subjectAttendance) {
          const record = (entry.records || []).find((item) => String(item.student) === String(student._id));
          if (!record) continue;
          total += 1;
          if (record.status === "present") attended += 1;
        }
        return {
          subjectId: subject._id,
          subjectCode: subject.subjectCode,
          subjectName: subject.subjectName,
          credit: subject.credits,
          studentId: student._id,
          studentName: student.name,
          enrollmentNo: student.id_no,
          course: student.course || student.department || "General",
          semester: student.semester,
          division: student.division || "A",
          ...attendanceStats(total, attended),
        };
      });

      const subjectTotal = subjectRows.reduce((sum, row) => sum + row.totalLectures, 0);
      const subjectAttended = subjectRows.reduce((sum, row) => sum + row.attended, 0);
      const summaryStats = attendanceStats(subjectTotal, subjectAttended);

      subjectSummaries.push({
        subjectId: subject._id,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        semester: subject.semester,
        course: subject.course?.courseName || "General",
        lecturesConducted: subjectAttendance.length,
        studentCount: studentRows.length,
        lowAttendanceCount: studentRows.filter((row) => row.belowRequired).length,
        averageAttendance: studentRows.length
          ? Number((studentRows.reduce((sum, row) => sum + row.percentage, 0) / studentRows.length).toFixed(2))
          : 0,
        ...summaryStats,
      });

      rows.push(...studentRows);
    }

    res.json({
      teacher: { id: teacherId },
      minimumRequiredPercent: MIN_ATTENDANCE_PERCENT,
      filters: { subjectId: subjectId || "ALL", division: division || "ALL", fromDate: fromDate || "", toDate: toDate || "" },
      subjects: subjectSummaries,
      rows,
    });
  } catch (err) {
    console.error("Teacher Attendance Report Error:", err);
    res.status(400).json({ message: err.message || "Failed to load teacher attendance report." });
  }
});

/* ===================== ADMIN ===================== */
router.get("/admin", requireRole("admin"), async (req, res) => {
  try {
    const course = clean(req.query.course);
    const semester = clean(req.query.semester);
    const division = clean(req.query.division);
    const subjectId = clean(req.query.subjectId);
    const fromDate = clean(req.query.fromDate);
    const toDate = clean(req.query.toDate);
    const dateWindow = buildWindow(fromDate, toDate);

    if (subjectId && !isObjectId(subjectId)) return res.status(400).json({ message: "Invalid subject ID." });

    const studentQuery = { role: "student", status: true };
    if (course && course !== "ALL") studentQuery.$or = [{ course }, { department: course }];
    if (semester && semester !== "ALL") {
      const sem = Number(semester);
      if (!Number.isInteger(sem) || sem < 1 || sem > 20) return res.status(400).json({ message: "Invalid semester." });
      studentQuery.semester = sem;
    }
    if (division && division !== "ALL") studentQuery.division = division;

    const students = await User.find(studentQuery).select("_id name id_no course department semester division").sort({ id_no: 1 }).lean();
    const studentIds = students.map((student) => student._id);

    let subjects = await Subject.find(subjectId ? { _id: subjectId } : {})
      .populate("course", "courseName courseCode durationYears")
      .sort({ semester: 1, subjectCode: 1 })
      .lean();

    if (subjectId && subjects.length === 0) return res.status(404).json({ message: "Subject not found." });

    const matchedSubjectIds = subjects
      .filter((subject) => students.some((student) => studentMatchesSubject(student, subject)))
      .map((subject) => subject._id);
    subjects = subjects.filter((subject) => matchedSubjectIds.some((id) => String(id) === String(subject._id)));

    const attendanceQuery = {
      subject: { $in: matchedSubjectIds },
      ...(studentIds.length ? { "records.student": { $in: studentIds } } : { _id: null }),
    };
    if (dateWindow) attendanceQuery.date = dateWindow;
    const attendanceRows = matchedSubjectIds.length && studentIds.length
      ? await Attendance.find(attendanceQuery).sort({ date: -1 }).lean()
      : [];

    const rows = [];
    const subjectSummaries = [];

    for (const subject of subjects) {
      const subjectAttendance = attendanceRows.filter((entry) => String(entry.subject) === String(subject._id));
      const enrolledStudents = students.filter((student) => studentMatchesSubject(student, subject));

      const studentRows = enrolledStudents.map((student) => {
        let total = 0;
        let attended = 0;
        for (const entry of subjectAttendance) {
          const record = (entry.records || []).find((item) => String(item.student) === String(student._id));
          if (!record) continue;
          total += 1;
          if (record.status === "present") attended += 1;
        }
        return {
          subjectId: subject._id,
          subjectCode: subject.subjectCode,
          subjectName: subject.subjectName,
          credit: subject.credits,
          studentId: student._id,
          studentName: student.name,
          enrollmentNo: student.id_no,
          course: student.course || student.department || "General",
          semester: student.semester,
          division: student.division || "A",
          ...attendanceStats(total, attended),
        };
      });

      subjectSummaries.push({
        subjectId: subject._id,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        course: subject.course?.courseName || "General",
        semester: subject.semester,
        lecturesConducted: subjectAttendance.length,
        studentCount: studentRows.length,
        lowAttendanceCount: studentRows.filter((row) => row.belowRequired).length,
        averageAttendance: studentRows.length
          ? Number((studentRows.reduce((sum, row) => sum + row.percentage, 0) / studentRows.length).toFixed(2))
          : 0,
      });

      rows.push(...studentRows);
    }

    res.json({
      minimumRequiredPercent: MIN_ATTENDANCE_PERCENT,
      filters: {
        course: course || "ALL",
        semester: semester || "ALL",
        division: division || "ALL",
        subjectId: subjectId || "ALL",
        fromDate: fromDate || "",
        toDate: toDate || "",
      },
      totals: {
        students: new Set(rows.map((row) => String(row.studentId))).size,
        belowRequired: rows.filter((row) => row.belowRequired).length,
        subjects: subjectSummaries.length,
      },
      subjects: subjectSummaries,
      rows,
    });
  } catch (err) {
    console.error("Admin Attendance Report Error:", err);
    res.status(400).json({ message: err.message || "Failed to load admin attendance report." });
  }
});

module.exports = router;
