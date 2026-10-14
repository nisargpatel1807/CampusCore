const router = require("express").Router();
const mongoose = require("mongoose");
const XLSX = require("xlsx");
const multer = require("multer");

const User = require("../models/user");
const Course = require("../models/course.JS");
const Subject = require("../models/Subject");
const Result = require("../models/Result");
const AssessmentScheme = require("../models/AssessmentScheme");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
      "application/octet-stream",
    ];
    const ext = String(file.originalname || "").toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith(".xlsx") || ext.endsWith(".xls") || ext.endsWith(".csv")) return cb(null, true);
    return cb(new Error("Only Excel (.xlsx/.xls) or CSV files are allowed."));
  },
});

const clean = (v) => String(v ?? "").trim();
const lower = (v) => clean(v).toLowerCase();
const num = (v) => {
  if (v === null || v === undefined || clean(v) === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (v) => Math.round(Number(v) * 100) / 100;

// Grade bands kept in one place so all modules calculate identically.
const GRADE_SCALE = [
  { min: 85, grade: "O+", point: 10 },
  { min: 70, grade: "O", point: 9 },
  { min: 60, grade: "A", point: 8 },
  { min: 55, grade: "B+", point: 7 },
  { min: 48, grade: "B", point: 6 },
  { min: 40, grade: "C", point: 5 },
  { min: 0, grade: "F", point: 0 },
];

const gradeFromPercentage = (percentage, passingPercent = 40) => {
  if (percentage < Number(passingPercent)) return { grade: "F", gradePoint: 0 };
  for (const item of GRADE_SCALE) {
    if (percentage >= item.min) return { grade: item.grade, gradePoint: item.point };
  }
  return { grade: "F", gradePoint: 0 };
};

const calculateMarks = ({ cec, midterm, external, scheme }) => {
  const components = [cec, midterm, external];
  const hasMissing = components.some((v) => v === null || v === undefined);
  const maxTotal = round2(Number(scheme.cecMax) + Number(scheme.midtermMax) + Number(scheme.externalMax));

  if (hasMissing) {
    return {
      total: null,
      maxTotal,
      percentage: null,
      grade: "",
      gradePoint: null,
      gpe: null,
      complete: false,
    };
  }

  const total = round2(cec + midterm + external);
  const percentage = maxTotal > 0 ? round2((total / maxTotal) * 100) : 0;
  const gradeData = gradeFromPercentage(percentage, scheme.passingPercent);

  return {
    total,
    maxTotal,
    percentage,
    grade: gradeData.grade,
    gradePoint: gradeData.gradePoint,
    gpe: round2(Number(gradeData.gradePoint) * Number(scheme.credit || 0)),
    complete: true,
  };
};

const normalizeHeader = (h) =>
  clean(h)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_.-]/g, "");

const HEADER_ALIASES = {
  studentid: "studentId",
  idno: "studentId",
  enrollmentno: "studentId",
  enrollno: "studentId",
  studentidno: "studentId",
  studentname: "studentName",
  subjectcode: "subjectCode",
  coursecode: "courseCode",
  semester: "semester",
  academicyear: "academicYear",
  academicyr: "academicYear",
  credit: "credit",
  credits: "credit",
  cec: "cec",
  internal: "cec",
  cecmarks: "cec",
  mid: "midterm",
  midterm: "midterm",
  midtermmarks: "midterm",
  external: "external",
  externalmarks: "external",
};

const readRowsFromWorkbook = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true });
  const firstSheet = workbook.SheetNames?.[0];
  if (!firstSheet) throw new Error("Excel file does not contain a worksheet.");
  const sheet = workbook.Sheets[firstSheet];

  // Supports both:
  // 1) old row-wise format: one Student + one Subject per row
  // 2) new wide format: one Student per row and subject groups across columns
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });

  const oldHeaderIndex = matrix.findIndex((row) =>
    row.some((cell) => HEADER_ALIASES[normalizeHeader(cell)] === "subjectCode")
  );

  if (oldHeaderIndex >= 0) {
    const headerRow = matrix[oldHeaderIndex] || [];
    const rows = [];
    for (let r = oldHeaderIndex + 1; r < matrix.length; r += 1) {
      const values = matrix[r] || [];
      if (!values.some((v) => clean(v) !== "")) continue;

      const row = {};
      headerRow.forEach((key, index) => {
        const mapped = HEADER_ALIASES[normalizeHeader(key)];
        if (mapped) row[mapped] = values[index] ?? "";
      });
      row.__rowNumber = r + 1;
      rows.push(row);
    }
    return rows;
  }

  // New wide template:
  // Row 1 = title
  // Row 2 = Course / Semester / Academic Year
  // Row 4 = subject group headers
  // Row 5 = CEC / Midterm / External / Total
  // Row 6+ = one student per row
  const subjectHeaderRowIndex = matrix.findIndex((row) =>
    row.some((cell) => /\b[A-Za-z0-9_-]+\s*\|\s*.+/.test(clean(cell)))
  );

  if (subjectHeaderRowIndex < 0) {
    throw new Error("Excel format not recognized. Download the latest CampusCore template and fill only the marks.");
  }

  const subjectHeaderRow = matrix[subjectHeaderRowIndex] || [];
  const groups = [];

  for (let start = 2; start < subjectHeaderRow.length; start += 4) {
    const groupHeader = clean(subjectHeaderRow[start]);
    if (!groupHeader) continue;

    const separator = groupHeader.indexOf("|");
    const subjectCode = clean(separator >= 0 ? groupHeader.slice(0, separator) : groupHeader);
    if (!subjectCode) continue;

    groups.push({
      subjectCode,
      cecIndex: start,
      midtermIndex: start + 1,
      externalIndex: start + 2,
    });
  }

  if (!groups.length) {
    throw new Error("No subject columns found. Please use the latest generated template.");
  }

  const rows = [];
  for (let r = subjectHeaderRowIndex + 2; r < matrix.length; r += 1) {
    const values = matrix[r] || [];
    const studentId = clean(values[0]);
    if (!studentId) continue;

    groups.forEach((group) => {
      rows.push({
        studentId,
        studentName: clean(values[1]),
        subjectCode: group.subjectCode,
        cec: values[group.cecIndex] ?? "",
        midterm: values[group.midtermIndex] ?? "",
        external: values[group.externalIndex] ?? "",
        __rowNumber: r + 1,
        __wideFormat: true,
      });
    });
  }

  return rows;
};

const schemeQuery = (courseId, semester, academicYear) => ({
  course: courseId,
  semester: Number(semester),
  academicYear: clean(academicYear),
  active: true,
});

const populateResult = (query) =>
  query
    .populate("student", "name id_no course semester division")
    .populate("subject", "subjectName subjectCode credits semester")
    .populate("course", "courseName courseCode");

const getCurrentUser = async (id) => User.findById(id).select("name id_no role course semester division status").lean();

// Recalculate an existing result when a CEC mark changes.
const recalculateExisting = (result, scheme) => {
  const calculated = calculateMarks({
    cec: result.cec,
    midterm: result.midterm,
    external: result.external,
    scheme: { ...scheme, credit: result.credit },
  });
  Object.assign(result, calculated);
  return result;
};

router.use(authMiddleware);

/* ===================== ADMIN ===================== */
router.get("/schemes", requireRole("admin"), async (req, res) => {
  try {
    const filter = { active: true };
    if (req.query.courseId && mongoose.isValidObjectId(req.query.courseId)) filter.course = req.query.courseId;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.academicYear) filter.academicYear = clean(req.query.academicYear);

    const rows = await AssessmentScheme.find(filter)
      .populate("course", "courseName courseCode")
      .sort({ academicYear: -1, semester: 1 })
      .lean();
    res.json({ schemes: rows });
  } catch (err) {
    console.error("Result Scheme List Error:", err);
    res.status(400).json({ message: err.message || "Failed to load assessment schemes." });
  }
});

router.post("/schemes", requireRole("admin"), async (req, res) => {
  try {
    const courseId = clean(req.body.courseId);
    const semester = Number(req.body.semester);
    const academicYear = clean(req.body.academicYear);
    const cecMax = num(req.body.cecMax);
    const midtermMax = num(req.body.midtermMax);
    const externalMax = num(req.body.externalMax);
    const passingPercent = req.body.passingPercent === undefined || req.body.passingPercent === "" ? 40 : num(req.body.passingPercent);

    if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Valid course is required." });
    if (!Number.isInteger(semester) || semester < 1 || semester > 20) return res.status(400).json({ message: "Valid semester is required." });
    if (!academicYear) return res.status(400).json({ message: "Academic year is required." });
    if ([cecMax, midtermMax, externalMax, passingPercent].some((v) => v === null || Number.isNaN(v))) return res.status(400).json({ message: "Marks and passing percentage must be valid numbers." });
    if (cecMax < 0 || midtermMax < 0 || externalMax < 0 || cecMax + midtermMax + externalMax <= 0) return res.status(400).json({ message: "Assessment maxima are invalid." });
    if (passingPercent < 0 || passingPercent > 100) return res.status(400).json({ message: "Passing percentage must be 0–100." });

    const scheme = await AssessmentScheme.findOneAndUpdate(
      { course: courseId, semester, academicYear },
      { $set: { cecMax, midtermMax, externalMax, passingPercent, active: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ message: "Assessment scheme saved successfully.", scheme });
  } catch (err) {
    console.error("Result Scheme Save Error:", err);
    res.status(400).json({ message: err.message || "Failed to save assessment scheme." });
  }
});

router.get("/template", requireRole("admin"), async (req, res) => {
  try {
    const courseId = clean(req.query.courseId);
    const semester = Number(req.query.semester);
    const academicYear = clean(req.query.academicYear);

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Pehle valid Course select karo." });
    }
    if (!Number.isInteger(semester) || semester < 1) {
      return res.status(400).json({ message: "Valid semester select karo." });
    }
    if (!academicYear) {
      return res.status(400).json({ message: "Academic Year enter karo." });
    }

    const course = await Course.findById(courseId).select("courseName courseCode").lean();
    if (!course) return res.status(404).json({ message: "Selected course not found." });

    const subjects = await Subject.find({ course: courseId, semester })
      .sort({ subjectCode: 1 })
      .select("subjectName subjectCode credits")
      .lean();

    if (!subjects.length) {
      return res.status(400).json({
        message: `Selected course ke Semester ${semester} me koi subject nahi mila.`,
      });
    }

    // Existing CampusCore stores the student's course as courseName.
    const students = await User.find({
      role: "student",
      status: true,
      semester,
      course: course.courseName,
    })
      .select("name id_no course")
      .sort({ id_no: 1 })
      .lean();

    const rows = [
      ["CAMPUSCORE – RESULT ENTRY TEMPLATE"],
      ["Course", course.courseName || "", "Semester", semester, "Academic Year", academicYear],
      [],
      [
        "StudentID",
        "StudentName",
        ...subjects.flatMap((subject) => [
          `${subject.subjectCode} | ${subject.subjectName}`,
          "",
          "",
          "",
        ]),
      ],
      ["", "", ...subjects.flatMap(() => ["CEC", "Midterm", "External", "Total"])],
    ];

    students.forEach((student) => {
      rows.push([
        student.id_no,
        student.name,
        ...subjects.flatMap(() => ["", "", "", ""]),
      ]);
    });

    if (!students.length) {
      rows.push([
        "",
        "No active student found for this course/semester.",
        ...subjects.flatMap(() => ["", "", "", ""]),
      ]);
    }

    rows.push(
      [],
      ["Instructions"],
      ["1. Course, Semester and Academic Year are selected in CampusCore; do not change them here."],
      ["2. StudentID and StudentName are generated automatically. Do not edit them."],
      ["3. Subject columns are generated automatically from Course + Semester subjects."],
      ["4. Fill only CEC, Midterm and External. Total is calculated by CampusCore."],
      ["5. Do not rename subject columns or component headers."],
      ["6. After filling marks, upload this file in Result Management → Excel Import."],
    );

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const lastSubjectCol = 2 + subjects.length * 4;

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: lastSubjectCol - 1 } },
    ];

    subjects.forEach((_subject, index) => {
      const startCol = 2 + index * 4;
      ws["!merges"].push({
        s: { r: 3, c: startCol },
        e: { r: 3, c: startCol + 3 },
      });
    });

    ws["!freeze"] = { xSplit: 2, ySplit: 5 };
    ws["!cols"] = [
      { wch: 18 },
      { wch: 24 },
      ...subjects.flatMap(() => [
        { wch: 13 },
        { wch: 12 },
        { wch: 12 },
        { wch: 11 },
      ]),
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Results");
    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const safeCourse = String(course.courseCode || course.courseName || "Course")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=CampusCore_${safeCourse}_Sem${semester}_Result_Template.xlsx`
    );
    return res.send(out);
  } catch (err) {
    console.error("Result Template Error:", err);
    return res.status(500).json({
      message: err.message || "Failed to generate result template.",
    });
  }
});

router.post("/import", requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "Please select an Excel/CSV file." });
    const courseId = clean(req.body.courseId);
    const semester = Number(req.body.semester);
    const academicYear = clean(req.body.academicYear);
    if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Valid course is required for import." });
    if (!Number.isInteger(semester) || semester < 1) return res.status(400).json({ message: "Valid semester is required for import." });
    if (!academicYear) return res.status(400).json({ message: "Academic year is required for import." });

    const scheme = await AssessmentScheme.findOne(schemeQuery(courseId, semester, academicYear)).lean();
    if (!scheme) return res.status(400).json({ message: "Assessment Scheme not found. Pehle scheme save karo." });

    const rows = readRowsFromWorkbook(req.file.buffer);
    if (!rows.length) return res.status(400).json({ message: "Excel sheet is empty." });

    const subjects = await Subject.find({ course: courseId, semester })
      .populate("course", "courseName courseCode")
      .lean();
    const subjectByCode = new Map(subjects.map((s) => [lower(s.subjectCode), s]));

    const studentIds = [...new Set(rows.map((r) => clean(r.studentId)).filter(Boolean))];
    const students = studentIds.length
      ? await User.find({ id_no: { $in: studentIds }, role: "student", status: true }).lean()
      : [];
    const studentById = new Map(students.map((s) => [lower(s.id_no), s]));

    const errors = [];
    const seen = new Set();
    const validRows = [];

    rows.forEach((row) => {
      const rowNo = row.__rowNumber;
      const studentId = clean(row.studentId);
      const subjectCode = clean(row.subjectCode).toUpperCase();
      if (!studentId) errors.push(`Row ${rowNo}: StudentID is required.`);
      if (!subjectCode) errors.push(`Row ${rowNo}: SubjectCode is required.`);
      const student = studentById.get(lower(studentId));
      const subject = subjectByCode.get(lower(subjectCode));
      if (studentId && !student) errors.push(`Row ${rowNo}: StudentID ${studentId} was not found.`);
      if (subjectCode && !subject) errors.push(`Row ${rowNo}: SubjectCode ${subjectCode} is not assigned to this course/semester.`);
      if (!student || !subject) return;

      if (Number(student.semester) !== semester) errors.push(`Row ${rowNo}: ${studentId} is currently in semester ${student.semester}, not ${semester}.`);
      const sameCourse = lower(student.course) === lower(subject.course?.courseName) || lower(student.course) === lower(subject.course?.courseCode);
      if (!sameCourse) errors.push(`Row ${rowNo}: ${studentId} is not mapped to ${subject.course?.courseName || "the selected course"}.`);

      const key = `${student._id}:${subject._id}:${academicYear}:${semester}`;
      if (seen.has(key)) errors.push(`Row ${rowNo}: Duplicate StudentID + SubjectCode combination.`);
      seen.add(key);

      const cec = num(row.cec);
      const midterm = num(row.midterm);
      const external = num(row.external);
      if (cec !== null && Number.isNaN(cec)) errors.push(`Row ${rowNo}: CEC must be a number.`);
      if (midterm !== null && Number.isNaN(midterm)) errors.push(`Row ${rowNo}: Midterm must be a number.`);
      if (external !== null && Number.isNaN(external)) errors.push(`Row ${rowNo}: External must be a number.`);
      if (cec !== null && !Number.isNaN(cec) && cec > scheme.cecMax) errors.push(`Row ${rowNo}: CEC ${cec} exceeds maximum ${scheme.cecMax}.`);
      if (midterm !== null && !Number.isNaN(midterm) && midterm > scheme.midtermMax) errors.push(`Row ${rowNo}: Midterm ${midterm} exceeds maximum ${scheme.midtermMax}.`);
      if (external !== null && !Number.isNaN(external) && external > scheme.externalMax) errors.push(`Row ${rowNo}: External ${external} exceeds maximum ${scheme.externalMax}.`);
      if ([cec, midterm, external].some((v) => v !== null && Number.isNaN(v))) return;
      if ([cec, midterm, external].some((v) => v !== null && v < 0)) errors.push(`Row ${rowNo}: Marks cannot be negative.`);

      const calculated = calculateMarks({ cec, midterm, external, scheme: { ...scheme, credit: subject.credits } });
      validRows.push({
        rowNo,
        student,
        subject,
        course: subject.course,
        academicYear,
        semester,
        credit: Number(subject.credits || 0),
        cec,
        midterm,
        external,
        ...calculated,
      });
    });

    if (errors.length) {
      return res.status(400).json({
        message: "Import validation failed. Koi record save nahi hua.",
        totalRows: rows.length,
        validRows: validRows.length,
        errorCount: errors.length,
        errors: errors.slice(0, 150),
        preview: validRows.slice(0, 100).map((r) => ({
          rowNo: r.rowNo, studentId: r.student.id_no, studentName: r.student.name,
          subjectCode: r.subject.subjectCode, subjectName: r.subject.subjectName,
          credit: r.credit, cec: r.cec, midterm: r.midterm, external: r.external,
          total: r.total, maxTotal: r.maxTotal, percentage: r.percentage,
          grade: r.grade, gradePoint: r.gradePoint, status: r.complete ? "Complete" : "CEC Pending",
        })),
      });
    }

    const ops = validRows.map((r) => ({
      updateOne: {
        filter: { student: r.student._id, subject: r.subject._id, academicYear, semester },
        update: {
          $set: {
            course: r.subject.course?._id || courseId,
            credit: r.credit,
            cec: r.cec,
            midterm: r.midterm,
            external: r.external,
            total: r.total,
            maxTotal: r.maxTotal,
            percentage: r.percentage,
            grade: r.grade,
            gradePoint: r.gradePoint,
            gpe: r.gpe,
            status: "draft",
            importedBy: req.user.id,
            publishedAt: null,
            publishedBy: null,
          },
        },
        upsert: true,
      },
    }));
    await Result.bulkWrite(ops, { ordered: true });

    return res.json({
      message: `Import successful. ${validRows.length} result row(s) draft me save ho gaye.`,
      totalRows: rows.length,
      importedRows: validRows.length,
      completeRows: validRows.filter((r) => r.complete).length,
      cecPendingRows: validRows.filter((r) => !r.complete).length,
      preview: validRows.slice(0, 100).map((r) => ({
        rowNo: r.rowNo, studentId: r.student.id_no, studentName: r.student.name,
        subjectCode: r.subject.subjectCode, subjectName: r.subject.subjectName,
        credit: r.credit, cec: r.cec, midterm: r.midterm, external: r.external,
        total: r.total, maxTotal: r.maxTotal, percentage: r.percentage,
        grade: r.grade, gradePoint: r.gradePoint, status: r.complete ? "Complete" : "CEC Pending",
      })),
    });
  } catch (err) {
    console.error("Result Import Error:", err);
    res.status(400).json({ message: err.message || "Result import failed." });
  }
});

router.get("/admin", requireRole("admin"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.courseId && mongoose.isValidObjectId(req.query.courseId)) filter.course = req.query.courseId;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.academicYear) filter.academicYear = clean(req.query.academicYear);
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) filter.subject = req.query.subjectId;
    if (req.query.status && ["draft", "published"].includes(req.query.status)) filter.status = req.query.status;

    const rows = await populateResult(Result.find(filter).sort({ semester: 1, student: 1, subject: 1 })).lean();
    res.json({ results: rows });
  } catch (err) {
    console.error("Admin Result List Error:", err);
    res.status(400).json({ message: err.message || "Failed to load admin results." });
  }
});

router.post("/publish", requireRole("admin"), async (req, res) => {
  try {
    const filter = {};
    if (req.body.courseId && mongoose.isValidObjectId(req.body.courseId)) filter.course = req.body.courseId;
    if (req.body.semester) filter.semester = Number(req.body.semester);
    if (req.body.academicYear) filter.academicYear = clean(req.body.academicYear);
    if (req.body.subjectId && mongoose.isValidObjectId(req.body.subjectId)) filter.subject = req.body.subjectId;
    filter.status = "draft";

    if (!filter.course || !filter.semester || !filter.academicYear) {
      return res.status(400).json({ message: "Course, semester and academic year are required to publish." });
    }

    const pending = await Result.find(filter).select("cec midterm external total").lean();
    if (!pending.length) return res.status(404).json({ message: "No draft result rows found for this selection." });
    const incomplete = pending.filter((r) => [r.cec, r.midterm, r.external, r.total].some((v) => v === null || v === undefined));
    if (incomplete.length) return res.status(400).json({ message: `${incomplete.length} result row(s) still have missing marks. CEC/marks complete karo before publish.` });

    const now = new Date();
    const result = await Result.updateMany(filter, { $set: { status: "published", publishedAt: now, publishedBy: req.user.id } });
    res.json({ message: `${result.modifiedCount || 0} result row(s) published successfully.`, publishedCount: result.modifiedCount || 0 });
  } catch (err) {
    console.error("Result Publish Error:", err);
    res.status(400).json({ message: err.message || "Failed to publish results." });
  }
});

/* ===================== TEACHER ===================== */
router.get("/teacher", requireRole("teacher"), async (req, res) => {
  try {
    const subjectId = clean(req.query.subjectId);
    const status = ["draft", "published"].includes(req.query.status) ? req.query.status : "draft";
    const subjects = await Subject.find({ teacher: req.user.id }).select("_id subjectName subjectCode credits semester course").lean();
    const subjectIds = subjects.map((s) => s._id);
    const filter = { subject: { $in: subjectIds }, status };
    if (subjectId) {
      if (!mongoose.isValidObjectId(subjectId)) return res.status(400).json({ message: "Invalid subject ID." });
      filter.subject = subjectId;
    }
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.academicYear) filter.academicYear = clean(req.query.academicYear);

    const rows = await populateResult(Result.find(filter).sort({ semester: 1, student: 1, subject: 1 })).lean();
    res.json({ results: rows, subjects });
  } catch (err) {
    console.error("Teacher Result List Error:", err);
    res.status(400).json({ message: err.message || "Failed to load teacher results." });
  }
});

router.patch("/teacher/:id/cec", requireRole("teacher"), async (req, res) => {
  try {
    const resultId = clean(req.params.id);
    if (!mongoose.isValidObjectId(resultId)) return res.status(400).json({ message: "Invalid result ID." });
    const cec = num(req.body.cec);
    if (cec === null || Number.isNaN(cec) || cec < 0) return res.status(400).json({ message: "CEC must be a valid non-negative number." });

    const result = await Result.findById(resultId).populate({ path: "subject", select: "subjectName subjectCode credits teacher course" });
    if (!result) return res.status(404).json({ message: "Result row not found." });
    if (!result.subject?.teacher || String(result.subject.teacher) !== String(req.user.id)) return res.status(403).json({ message: "This subject is not allocated to you." });

    const scheme = await AssessmentScheme.findOne(schemeQuery(result.course, result.semester, result.academicYear)).lean();
    if (!scheme) return res.status(400).json({ message: "Assessment Scheme not found for this result." });
    if (cec > scheme.cecMax) return res.status(400).json({ message: `CEC cannot exceed ${scheme.cecMax}.` });

    result.cec = cec;
    result.cecEnteredBy = req.user.id;
    result.status = "draft";
    recalculateExisting(result, scheme);
    await result.save();

    const populated = await Result.findById(result._id)
      .populate("student", "name id_no course semester division")
      .populate("subject", "subjectName subjectCode credits semester")
      .lean();
    res.json({ message: "CEC saved and result recalculated.", result: populated });
  } catch (err) {
    console.error("Teacher CEC Update Error:", err);
    res.status(400).json({ message: err.message || "Failed to save CEC." });
  }
});

/* ===================== STUDENT ===================== */
router.get("/student", requireRole("student"), async (req, res) => {
  try {
    const results = await populateResult(
      Result.find({ student: req.user.id, status: "published" }).sort({ semester: 1, subject: 1 })
    ).lean();

    const bySemester = new Map();
    for (const row of results) {
      const semKey = `${row.academicYear}::${row.semester}`;
      if (!bySemester.has(semKey)) bySemester.set(semKey, { academicYear: row.academicYear, semester: row.semester, rows: [] });
      bySemester.get(semKey).rows.push(row);
    }

    const semesters = [...bySemester.values()].map((sem) => {
      const creditTotal = sem.rows.reduce((s, r) => s + Number(r.credit || 0), 0);
      const gpe = sem.rows.reduce((s, r) => s + Number(r.gpe || 0), 0);
      const obtainedMarks = sem.rows.reduce((s, r) => s + Number(r.total || 0), 0);
      const maxMarks = sem.rows.reduce((s, r) => s + Number(r.maxTotal || 0), 0);
      return {
        ...sem,
        creditTotal,
        gpe: round2(gpe),
        sgpa: creditTotal ? round2(gpe / creditTotal) : 0,
        obtainedMarks,
        maxMarks,
        percentage: maxMarks ? round2((obtainedMarks / maxMarks) * 100) : 0,
      };
    });

    const overallCredits = results.reduce((s, r) => s + Number(r.credit || 0), 0);
    const overallGpe = results.reduce((s, r) => s + Number(r.gpe || 0), 0);
    res.json({
      results,
      semesters,
      cgpa: overallCredits ? round2(overallGpe / overallCredits) : 0,
      totalCredits: overallCredits,
      message: "Published results loaded successfully.",
    });
  } catch (err) {
    console.error("Student Result Error:", err);
    res.status(400).json({ message: err.message || "Failed to load student results." });
  }
});

module.exports = router;
