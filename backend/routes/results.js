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
    if (
      allowed.includes(file.mimetype) ||
      ext.endsWith(".xlsx") ||
      ext.endsWith(".xls") ||
      ext.endsWith(".csv")
    ) {
      return cb(null, true);
    }
    return cb(new Error("Only Excel (.xlsx/.xls) or CSV files are allowed."));
  },
});

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const num = (value) => {
  if (value === null || value === undefined || clean(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
};
const round2 = (value) => Math.round(Number(value) * 100) / 100;

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
  return GRADE_SCALE.find((item) => percentage >= item.min) || { grade: "F", gradePoint: 0 };
};

const calculateMarks = ({ cec, midterm, external, scheme, credit }) => {
  const numericCredit = Number(credit);

  if (!Number.isFinite(numericCredit) || numericCredit < 0) {
    throw new Error("Subject credit is missing or invalid. Please set a valid credit value for the subject.");
  }

  const values = { cec, midterm, external };
  for (const [name, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && !Number.isFinite(Number(value))) {
      throw new Error(`${name} marks must be a valid number.`);
    }
    if (value !== null && value !== undefined && Number(value) < 0) {
      throw new Error(`${name} marks cannot be negative.`);
    }
  }

  // Fixed CampusCore formula:
  // CEC: 30 raw marks -> 30 final marks
  // Midterm: 50 raw marks -> 20 final marks
  // External: 70 raw marks -> 50 final marks
  const cecMax = 30;
  const midtermMax = 50;
  const externalMax = 70;
  const cecWeight = 30;
  const midtermWeight = 20;
  const externalWeight = 50;

  const weightedCEC =
    cec === null || cec === undefined
      ? null
      : round2((Number(cec) / cecMax) * cecWeight);

  const weightedMidterm =
    midterm === null || midterm === undefined
      ? null
      : round2((Number(midterm) / midtermMax) * midtermWeight);

  const weightedExternal =
    external === null || external === undefined
      ? null
      : round2((Number(external) / externalMax) * externalWeight);

  const hasMissing = [cec, midterm, external].some(
    (value) => value === null || value === undefined
  );

  if (hasMissing) {
    return {
      cecWeighted: weightedCEC,
      midtermWeighted: weightedMidterm,
      externalWeighted: weightedExternal,
      total: null,
      maxTotal: 100,
      percentage: null,
      grade: "",
      gradePoint: null,
      gpe: null,
      complete: false,
    };
  }

  const total = round2(weightedCEC + weightedMidterm + weightedExternal);
  const percentage = total;
  const passingPercent = Number.isFinite(Number(scheme?.passingPercent))
    ? Number(scheme.passingPercent)
    : 40;

  const gradeData = gradeFromPercentage(percentage, passingPercent);
  const gradePoint = Number(gradeData.point ?? gradeData.gradePoint);
  const gpe = round2(gradePoint * numericCredit);

  if (
    !Number.isFinite(total) ||
    !Number.isFinite(percentage) ||
    !Number.isFinite(gradePoint) ||
    !Number.isFinite(gpe)
  ) {
    throw new Error("The calculated result contains an invalid numeric value.");
  }

  return {
    cecWeighted: weightedCEC,
    midtermWeighted: weightedMidterm,
    externalWeighted: weightedExternal,
    total,
    maxTotal: 100,
    percentage,
    grade: gradeData.grade,
    gradePoint,
    gpe,
    complete: true,
  };
};

const normalizeHeader = (header) =>
  clean(header)
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
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });

  const oldHeaderIndex = matrix.findIndex((row) =>
    row.some((cell) => HEADER_ALIASES[normalizeHeader(cell)] === "subjectCode")
  );

  if (oldHeaderIndex >= 0) {
    const headerRow = matrix[oldHeaderIndex] || [];
    const rows = [];
    for (let rowIndex = oldHeaderIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const values = matrix[rowIndex] || [];
      if (!values.some((value) => clean(value) !== "")) continue;

      const row = {};
      headerRow.forEach((header, columnIndex) => {
        const mapped = HEADER_ALIASES[normalizeHeader(header)];
        if (mapped) row[mapped] = values[columnIndex] ?? "";
      });
      row.__rowNumber = rowIndex + 1;
      rows.push(row);
    }
    return rows;
  }

  const subjectHeaderRowIndex = matrix.findIndex((row) =>
    row.some((cell) => /\b[A-Za-z0-9_-]+\s*\|\s*.+/.test(clean(cell)))
  );

  if (subjectHeaderRowIndex < 0) {
    throw new Error("Excel format not recognized. Download the latest CampusCore result template.");
  }

  const subjectHeaderRow = matrix[subjectHeaderRowIndex] || [];
  const groups = [];

  for (let start = 2; start < subjectHeaderRow.length; start += 3) {
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
    throw new Error("No subject columns were found in the workbook.");
  }

  const rows = [];
  for (let rowIndex = subjectHeaderRowIndex + 2; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] || [];
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
        __rowNumber: rowIndex + 1,
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
    .populate("student", "name id_no email course semester year division profilePhoto")
    .populate("subject", "subjectName subjectCode credits semester")
    .populate("course", "courseName courseCode");

const recalculateExisting = (result, scheme) => {
  const calculated = calculateMarks({
    cec: result.cec,
    midterm: result.midterm,
    external: result.external,
    scheme,
    credit: result.credit,
  });
  Object.assign(result, calculated);
  return result;
};

router.use(authMiddleware);

/* ===================== ADMIN ===================== */

router.get("/schemes", requireRole("admin"), async (req, res) => {
  try {
    const filter = { active: true };
    if (req.query.courseId && mongoose.isValidObjectId(req.query.courseId)) {
      filter.course = req.query.courseId;
    }
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.academicYear) filter.academicYear = clean(req.query.academicYear);

    const schemes = await AssessmentScheme.find(filter)
      .populate("course", "courseName courseCode")
      .sort({ academicYear: -1, semester: 1 })
      .lean();

    res.json({ schemes });
  } catch (error) {
    console.error("Result Scheme List Error:", error);
    res.status(400).json({ message: error.message || "Failed to load assessment schemes." });
  }
});

router.post("/schemes", requireRole("admin"), async (req, res) => {
  try {
    const courseId = clean(req.body.courseId);
    const semester = Number(req.body.semester);
    const academicYear = clean(req.body.academicYear);

    const cecMax = 30;
    const midtermMax = 50;
    const externalMax = 70;
    const cecWeight = 30;
    const midtermWeight = 20;
    const externalWeight = 50;
    const passingPercent =
      req.body.passingPercent === undefined || req.body.passingPercent === ""
        ? 40
        : num(req.body.passingPercent);

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "A valid course is required." });
    }
    if (!Number.isInteger(semester) || semester < 1 || semester > 20) {
      return res.status(400).json({ message: "A valid semester is required." });
    }
    if (!academicYear) return res.status(400).json({ message: "Academic year is required." });

    if ([cecMax, midtermMax, externalMax, cecWeight, midtermWeight, externalWeight, passingPercent]
      .some((value) => value === null || Number.isNaN(value))) {
      return res.status(400).json({ message: "Assessment values must be valid numbers." });
    }

    if (cecMax !== 30 || midtermMax !== 50 || externalMax !== 70) {
      return res.status(400).json({
        message: "The result scheme requires CEC 30, Midterm raw maximum 50, and External raw maximum 70.",
      });
    }

    if (cecWeight !== 30 || midtermWeight !== 20 || externalWeight !== 50) {
      return res.status(400).json({
        message: "The result weighting must be CEC 30%, Midterm 20%, and External 50%.",
      });
    }

    if (passingPercent < 0 || passingPercent > 100) {
      return res.status(400).json({ message: "Passing percentage must be between 0 and 100." });
    }

    const scheme = await AssessmentScheme.findOneAndUpdate(
      { course: courseId, semester, academicYear },
      {
        $set: {
          cecMax: 30,
          midtermMax: 50,
          externalMax: 70,
          cecWeight: 30,
          midtermWeight: 20,
          externalWeight: 50,
          passingPercent,
          active: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: "Assessment scheme saved successfully.", scheme });
  } catch (error) {
    console.error("Result Scheme Save Error:", error);
    res.status(400).json({ message: error.message || "Failed to save assessment scheme." });
  }
});

router.get("/template", requireRole("admin"), async (req, res) => {
  try {
    const courseId = clean(req.query.courseId);
    const semester = Number(req.query.semester);
    const academicYear = clean(req.query.academicYear);

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Please select a valid course." });
    }

    if (!Number.isInteger(semester) || semester < 1 || semester > 20) {
      return res.status(400).json({ message: "Please select a valid semester." });
    }

    if (!academicYear) {
      return res.status(400).json({ message: "Academic year is required." });
    }

    const course = await Course.findById(courseId)
      .select("courseName courseCode")
      .lean();

    if (!course) {
      return res.status(404).json({ message: "Selected course was not found." });
    }

    const subjects = await Subject.find({ course: courseId, semester })
      .sort({ subjectCode: 1 })
      .select("subjectName subjectCode credits")
      .lean();

    if (!subjects.length) {
      return res.status(400).json({
        message: `No subjects were found for ${course.courseName}, Semester ${semester}.`,
      });
    }

    const invalidSubject = subjects.find(
      (subject) =>
        !Number.isFinite(Number(subject.credits)) ||
        Number(subject.credits) < 0
    );

    if (invalidSubject) {
      return res.status(400).json({
        message: `Subject ${invalidSubject.subjectCode} has an invalid credit value. Please correct the subject before generating the template.`,
      });
    }

    const students = await User.find({
      role: "student",
      status: true,
      semester,
      course: { $in: [course.courseName, course.courseCode] },
    })
      .select("name id_no course")
      .sort({ id_no: 1 })
      .lean();

    const rows = [
      ["CampusCore Result Entry"],
      ["Course", course.courseName || "", "Semester", semester, "Academic Year", academicYear],
      ["Enter only raw marks: CEC /30, Midterm /50, External /70. Total is calculated automatically."],
      [],
      [
        "StudentID",
        "StudentName",
        ...subjects.flatMap((subject) => [
          `${subject.subjectCode} | ${subject.subjectName} | Credit ${subject.credits}`,
          "",
          "",
        ]),
      ],
      [
        "",
        "",
        ...subjects.flatMap(() => ["CEC", "Midterm", "External"]),
      ],
    ];

    students.forEach((student) => {
      rows.push([
        student.id_no,
        student.name,
        ...subjects.flatMap(() => ["", "", ""]),
      ]);
    });

    if (!students.length) {
      rows.push([
        "",
        "No active students were found for this course and semester.",
        ...subjects.flatMap(() => ["", "", ""]),
      ]);
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    const lastSubjectCol = 2 + subjects.length * 3;

    worksheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: lastSubjectCol - 1 } },
      ...subjects.map((_subject, index) => {
        const startCol = 2 + index * 3;
        return {
          s: { r: 4, c: startCol },
          e: { r: 4, c: startCol + 2 },
        };
      }),
    ];

    worksheet["!freeze"] = { xSplit: 2, ySplit: 6 };

    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 28 },
      ...subjects.flatMap(() => [
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
      ]),
    ];

    const headerRange = XLSX.utils.decode_range(worksheet["!ref"]);
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 5, c: 0 },
        e: { r: Math.max(headerRange.e.r, 5), c: lastSubjectCol - 1 },
      }),
    };

    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");

    const output = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const safeCourse = String(course.courseCode || course.courseName || "Course")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=CampusCore_${safeCourse}_Sem${semester}_Result_Entry.xlsx`
    );

    return res.send(output);
  } catch (error) {
    console.error("Result Template Error:", error);
    return res.status(500).json({
      message: error.message || "Failed to generate result template.",
    });
  }
});

router.post("/import", requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Please select an Excel or CSV file." });
    }

    const courseId = clean(req.body.courseId);
    const semester = Number(req.body.semester);
    const academicYear = clean(req.body.academicYear);

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "A valid course is required for import." });
    }
    if (!Number.isInteger(semester) || semester < 1) {
      return res.status(400).json({ message: "A valid semester is required for import." });
    }
    if (!academicYear) {
      return res.status(400).json({ message: "Academic year is required for import." });
    }

    const scheme = await AssessmentScheme.findOne(
      schemeQuery(courseId, semester, academicYear)
    ).lean();

    if (!scheme) {
      return res.status(400).json({
        message: "Assessment scheme not found. Save the assessment scheme first.",
      });
    }

    const rows = readRowsFromWorkbook(req.file.buffer);
    if (!rows.length) return res.status(400).json({ message: "The Excel sheet is empty." });

    const subjects = await Subject.find({ course: courseId, semester })
      .populate("course", "courseName courseCode")
      .lean();

    const subjectByCode = new Map(subjects.map((subject) => [lower(subject.subjectCode), subject]));

    const studentIds = [...new Set(rows.map((row) => clean(row.studentId)).filter(Boolean))];
    const students = studentIds.length
      ? await User.find({
          id_no: { $in: studentIds },
          role: "student",
          status: true,
        }).lean()
      : [];

    const studentById = new Map(students.map((student) => [lower(student.id_no), student]));
    const errors = [];
    const seen = new Set();
    const validRows = [];

    rows.forEach((row) => {
      const rowNumber = row.__rowNumber;
      const studentId = clean(row.studentId);
      const subjectCode = clean(row.subjectCode).toUpperCase();

      if (!studentId) errors.push(`Row ${rowNumber}: StudentID is required.`);
      if (!subjectCode) errors.push(`Row ${rowNumber}: SubjectCode is required.`);

      const student = studentById.get(lower(studentId));
      const subject = subjectByCode.get(lower(subjectCode));

      if (studentId && !student) {
        errors.push(`Row ${rowNumber}: StudentID ${studentId} was not found.`);
      }
      if (subjectCode && !subject) {
        errors.push(`Row ${rowNumber}: SubjectCode ${subjectCode} is not assigned to this course and semester.`);
      }
      if (!student || !subject) return;

      if (Number(student.semester) !== semester) {
        errors.push(`Row ${rowNumber}: ${studentId} belongs to Semester ${student.semester}, not Semester ${semester}.`);
      }

      const studentCourse = lower(student.course);
      const subjectCourseName = lower(subject.course?.courseName);
      const subjectCourseCode = lower(subject.course?.courseCode);
      if (![subjectCourseName, subjectCourseCode].includes(studentCourse)) {
        errors.push(`Row ${rowNumber}: ${studentId} is not mapped to the selected course.`);
      }

      const key = `${student._id}:${subject._id}:${academicYear}:${semester}`;
      if (seen.has(key)) {
        errors.push(`Row ${rowNumber}: Duplicate StudentID and SubjectCode combination.`);
      }
      seen.add(key);

      const cec = num(row.cec);
      const midterm = num(row.midterm);
      const external = num(row.external);

      if (cec !== null && Number.isNaN(cec)) errors.push(`Row ${rowNumber}: CEC must be a number.`);
      if (midterm !== null && Number.isNaN(midterm)) errors.push(`Row ${rowNumber}: Midterm must be a number.`);
      if (external !== null && Number.isNaN(external)) errors.push(`Row ${rowNumber}: External must be a number.`);

      if (cec !== null && !Number.isNaN(cec) && cec > 30) {
        errors.push(`Row ${rowNumber}: CEC ${cec} exceeds the maximum 30.`);
      }
      if (midterm !== null && !Number.isNaN(midterm) && midterm > 50) {
        errors.push(`Row ${rowNumber}: Midterm ${midterm} exceeds the raw maximum 50.`);
      }
      if (external !== null && !Number.isNaN(external) && external > 70) {
        errors.push(`Row ${rowNumber}: External ${external} exceeds the raw maximum 70.`);
      }

      if ([cec, midterm, external].some((value) => value !== null && Number.isNaN(value))) return;
      if ([cec, midterm, external].some((value) => value !== null && value < 0)) {
        errors.push(`Row ${rowNumber}: Marks cannot be negative.`);
      }

      const credit = num(subject.credits);
      if (credit === null || Number.isNaN(credit) || credit < 0) {
        errors.push(`Row ${rowNumber}: Subject ${subjectCode} has an invalid credit value in the database.`);
        return;
      }

      let calculated;
      try {
        calculated = calculateMarks({
          cec,
          midterm,
          external,
          scheme,
          credit,
        });
      } catch (calculationError) {
        errors.push(`Row ${rowNumber}: ${calculationError.message}`);
        return;
      }

      validRows.push({
        rowNumber,
        student,
        subject,
        academicYear,
        semester,
        credit,
        cec,
        midterm,
        external,
        ...calculated,
      });
    });

    if (errors.length) {
      return res.status(400).json({
        message: "Import validation failed. No records were saved.",
        totalRows: rows.length,
        validRows: validRows.length,
        errorCount: errors.length,
        errors: errors.slice(0, 150),
        preview: validRows.slice(0, 100).map((row) => ({
          rowNo: row.rowNumber,
          studentId: row.student.id_no,
          studentName: row.student.name,
          subjectCode: row.subject.subjectCode,
          subjectName: row.subject.subjectName,
          credit: row.credit,
          cec: row.cec,
          midterm: row.midterm,
          external: row.external,
          cecWeighted: row.cecWeighted,
          midtermWeighted: row.midtermWeighted,
          externalWeighted: row.externalWeighted,
          total: row.total,
          maxTotal: row.maxTotal,
          percentage: row.percentage,
          grade: row.grade,
          gradePoint: row.gradePoint,
          status: row.complete ? "Complete" : "Pending Marks",
        })),
      });
    }

    const invalidCalculatedRows = validRows.filter((row) => {
      if (!Number.isFinite(Number(row.credit))) return true;

      if (!row.complete) {
        return [row.cecWeighted, row.midtermWeighted, row.externalWeighted]
          .some((value) => value !== null && !Number.isFinite(Number(value)));
      }

      return [
        row.cecWeighted,
        row.midtermWeighted,
        row.externalWeighted,
        row.total,
        row.percentage,
        row.gradePoint,
        row.gpe,
      ].some((value) => !Number.isFinite(Number(value)));
    });

    if (invalidCalculatedRows.length) {
      return res.status(400).json({
        message: "Import validation failed because one or more calculated result values are invalid.",
        errors: invalidCalculatedRows.map(
          (row) =>
            `Row ${row.rowNumber}: Invalid calculated result for ${row.student.id_no} / ${row.subject.subjectCode}.`
        ),
      });
    }

    const operations = validRows.map((row) => ({
      updateOne: {
        filter: {
          student: row.student._id,
          subject: row.subject._id,
          academicYear,
          semester,
        },
        update: {
          $set: {
            course: row.subject.course?._id || courseId,
            credit: row.credit,
            cec: row.cec,
            midterm: row.midterm,
            external: row.external,
            cecWeighted: row.cecWeighted,
            midtermWeighted: row.midtermWeighted,
            externalWeighted: row.externalWeighted,
            total: row.total,
            maxTotal: row.maxTotal,
            percentage: row.percentage,
            grade: row.grade,
            gradePoint: row.gradePoint,
            gpe: row.gpe,
            status: "draft",
            importedBy: req.user.id,
            publishedAt: null,
            publishedBy: null,
          },
        },
        upsert: true,
      },
    }));

    await Result.bulkWrite(operations, { ordered: true });

    return res.json({
      message: `Import completed. ${validRows.length} result record(s) are saved as Draft.`,
      totalRows: rows.length,
      importedRows: validRows.length,
      completeRows: validRows.filter((row) => row.complete).length,
      pendingRows: validRows.filter((row) => !row.complete).length,
      preview: validRows.slice(0, 100).map((row) => ({
        rowNo: row.rowNumber,
        studentId: row.student.id_no,
        studentName: row.student.name,
        subjectCode: row.subject.subjectCode,
        subjectName: row.subject.subjectName,
        credit: row.credit,
        cec: row.cec,
        midterm: row.midterm,
        external: row.external,
        cecWeighted: row.cecWeighted,
        midtermWeighted: row.midtermWeighted,
        externalWeighted: row.externalWeighted,
        total: row.total,
        maxTotal: row.maxTotal,
        percentage: row.percentage,
        grade: row.grade,
        gradePoint: row.gradePoint,
        status: row.complete ? "Complete" : "Pending Marks",
      })),
    });
  } catch (error) {
    console.error("Result Import Error:", error);
    res.status(400).json({ message: error.message || "Result import failed." });
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

    const rows = await populateResult(
      Result.find(filter).sort({ semester: 1, student: 1, subject: 1 })
    ).lean();

    res.json({ results: rows });
  } catch (error) {
    console.error("Admin Result List Error:", error);
    res.status(400).json({ message: error.message || "Failed to load admin results." });
  }
});

router.post("/publish", requireRole("admin"), async (req, res) => {
  try {
    const filter = {};
    if (req.body.courseId && mongoose.isValidObjectId(req.body.courseId)) filter.course = req.body.courseId;
    if (req.body.semester) filter.semester = Number(req.body.semester);
    if (req.body.academicYear) filter.academicYear = clean(req.body.academicYear);
    filter.status = "draft";

    if (!filter.course || !filter.semester || !filter.academicYear) {
      return res.status(400).json({
        message: "Course, semester and academic year are required before publishing.",
      });
    }

    const pending = await Result.find(filter)
      .select("cec midterm external total")
      .lean();

    if (!pending.length) {
      return res.status(404).json({ message: "No Draft result records were found for this selection." });
    }

    const incomplete = pending.filter((row) =>
      [row.cec, row.midterm, row.external, row.total].some(
        (value) => value === null || value === undefined
      )
    );

    if (incomplete.length) {
      return res.status(400).json({
        message: `${incomplete.length} result record(s) still have missing marks. Complete all marks before publishing.`,
      });
    }

    const publishedAt = new Date();
    const result = await Result.updateMany(
      filter,
      { $set: { status: "published", publishedAt, publishedBy: req.user.id } }
    );

    res.json({
      message: `${result.modifiedCount || 0} result record(s) published successfully.`,
      publishedCount: result.modifiedCount || 0,
      publishedAt,
      status: "published",
    });
  } catch (error) {
    console.error("Result Publish Error:", error);
    res.status(400).json({ message: error.message || "Failed to publish results." });
  }
});

/* ===================== TEACHER ===================== */

router.get("/teacher", requireRole("teacher"), async (req, res) => {
  try {
    const subjectId = clean(req.query.subjectId);
    const status = ["draft", "published"].includes(req.query.status)
      ? req.query.status
      : "draft";

    const subjects = await Subject.find({ teacher: req.user.id })
      .select("_id subjectName subjectCode credits semester course")
      .lean();

    const subjectIds = subjects.map((subject) => subject._id);
    const filter = { subject: { $in: subjectIds }, status };

    if (subjectId) {
      if (!mongoose.isValidObjectId(subjectId)) {
        return res.status(400).json({ message: "Invalid subject ID." });
      }
      filter.subject = subjectId;
    }
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.academicYear) filter.academicYear = clean(req.query.academicYear);

    const rows = await populateResult(
      Result.find(filter).sort({ semester: 1, student: 1, subject: 1 })
    ).lean();

    res.json({ results: rows, subjects });
  } catch (error) {
    console.error("Teacher Result List Error:", error);
    res.status(400).json({ message: error.message || "Failed to load teacher results." });
  }
});

router.patch("/teacher/:id/cec", requireRole("teacher"), async (req, res) => {
  try {
    const resultId = clean(req.params.id);
    if (!mongoose.isValidObjectId(resultId)) {
      return res.status(400).json({ message: "Invalid result ID." });
    }

    const cec = num(req.body.cec);
    if (cec === null || Number.isNaN(cec) || cec < 0) {
      return res.status(400).json({ message: "CEC must be a valid non-negative number." });
    }

    const result = await Result.findById(resultId).populate({
      path: "subject",
      select: "subjectName subjectCode credits teacher course",
    });

    if (!result) return res.status(404).json({ message: "Result record not found." });

    if (!result.subject?.teacher || String(result.subject.teacher) !== String(req.user.id)) {
      return res.status(403).json({ message: "This subject is not assigned to you." });
    }

    const scheme = await AssessmentScheme.findOne(
      schemeQuery(result.course, result.semester, result.academicYear)
    ).lean();

    if (!scheme) {
      return res.status(400).json({ message: "Assessment scheme not found for this result." });
    }

    if (cec > scheme.cecMax) {
      return res.status(400).json({ message: `CEC cannot exceed ${scheme.cecMax}.` });
    }

    result.cec = cec;
    result.cecEnteredBy = req.user.id;
    result.status = "draft";
    recalculateExisting(result, scheme);
    await result.save();

    const populated = await populateResult(Result.findById(result._id)).lean();
    res.json({
      message: "CEC saved and the result was recalculated.",
      result: populated,
    });
  } catch (error) {
    console.error("Teacher CEC Update Error:", error);
    res.status(400).json({ message: error.message || "Failed to save CEC." });
  }
});

/* ===================== STUDENT ===================== */

router.get("/student", requireRole("student"), async (req, res) => {
  try {
    const student = await User.findById(req.user.id)
      .select("name id_no email course semester year division profilePhoto")
      .lean();

    const results = await populateResult(
      Result.find({ student: req.user.id, status: "published" })
        .sort({ academicYear: -1, semester: 1, subject: 1 })
    ).lean();

    const bySemester = new Map();

    for (const row of results) {
      const key = `${row.academicYear}::${row.semester}`;
      if (!bySemester.has(key)) {
        bySemester.set(key, {
          academicYear: row.academicYear,
          semester: row.semester,
          rows: [],
        });
      }
      bySemester.get(key).rows.push(row);
    }

    const semesters = [...bySemester.values()].map((semesterData) => {
      const creditTotal = semesterData.rows.reduce(
        (sum, row) => sum + Number(row.credit || 0),
        0
      );
      const gpe = semesterData.rows.reduce(
        (sum, row) => sum + Number(row.gpe || 0),
        0
      );
      const obtainedMarks = semesterData.rows.reduce(
        (sum, row) => sum + Number(row.total || 0),
        0
      );
      const maxMarks = semesterData.rows.reduce(
        (sum, row) => sum + Number(row.maxTotal || 100),
        0
      );

      return {
        ...semesterData,
        creditTotal,
        gpe: round2(gpe),
        sgpa: creditTotal ? round2(gpe / creditTotal) : 0,
        obtainedMarks: round2(obtainedMarks),
        maxMarks: round2(maxMarks),
        percentage: maxMarks ? round2((obtainedMarks / maxMarks) * 100) : 0,
      };
    });

    const overallCredits = results.reduce(
      (sum, row) => sum + Number(row.credit || 0),
      0
    );
    const overallGpe = results.reduce(
      (sum, row) => sum + Number(row.gpe || 0),
      0
    );

    res.json({
      student,
      results,
      semesters,
      cgpa: overallCredits ? round2(overallGpe / overallCredits) : 0,
      totalCredits: overallCredits,
      message: "Published results loaded successfully.",
    });
  } catch (error) {
    console.error("Student Result Error:", error);
    res.status(400).json({ message: error.message || "Failed to load student results." });
  }
});

module.exports = router;
