const router = require("express").Router();
const mongoose = require("mongoose");
const User = require("../models/user");
const Course = require("../models/course.JS");
const Subject = require("../models/Subject");
const Notification = require("../models/Notification");
const Classroom = require("../models/Classroom");
const TimetableEntry = require("../models/TimetableEntry");
const TimetableChange = require("../models/TimetableChange");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ENTRY_TYPES = ["Lecture", "Lab", "Practical", "Seminar", "Workshop", "Activity", "Break", "Other"];
const CHANGE_TYPES = ["Room Change", "Time Change", "Teacher Change", "Cancelled", "Extra Class", "Other"];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const clean = (value) => String(value ?? "").trim();
const isObjectId = (value) => mongoose.isValidObjectId(value);

const timeToMinutes = (value) => {
  if (!TIME_REGEX.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const overlaps = (startA, endA, startB, endB) => startA < endB && startB < endA;

const toStartOfDay = (dateString) => new Date(`${dateString}T00:00:00`);
const toEndOfDay = (dateString) => new Date(`${dateString}T23:59:59.999`);

const dateToDay = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return DAYS[(date.getDay() + 6) % 7];
};

const validateDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toStartOfDay(value).getTime());

const getDefaultAcademicYear = () => {
  const year = new Date().getFullYear();
  return `${year}-${String(year + 1).slice(-2)}`;
};

const getCourseFromStudent = async (student) => {
  const values = [clean(student.course), clean(student.department)].filter(Boolean);
  if (!values.length) return null;
  return Course.findOne({ $or: [{ courseName: { $in: values } }, { courseCode: { $in: values.map((v) => v.toUpperCase()) } }] }).lean();
};

const studentAudienceQuery = (course, semester, division) => ({
  role: "student",
  status: true,
  semester: Number(semester),
  division: String(division || "A").toUpperCase(),
  $or: [
    { course: course.courseName },
    { course: course.courseCode },
    { department: course.courseName },
    { department: course.courseCode },
  ],
});

const buildNotificationDocs = async ({ course, semester, division, entry, change, actorId }) => {
  const students = await User.find(studentAudienceQuery(course, semester, division)).select("_id").lean();
  const recipientIds = new Set(students.map((s) => String(s._id)));

  const teacherIds = [];
  if (entry?.teacher) teacherIds.push(String(entry.teacher));
  if (change?.newTeacher) teacherIds.push(String(change.newTeacher));

  teacherIds.forEach((id) => {
    if (id && id !== String(actorId)) recipientIds.add(id);
  });

  const title = change.changeType === "Extra Class"
    ? "Extra Class Added"
    : `Timetable Update: ${change.changeType}`;

  let message = change.message || "Your timetable has been updated.";
  if (change.reason) message += ` Reason: ${change.reason}`;

  return Array.from(recipientIds).map((recipient) => ({
    recipient,
    recipientRole: students.some((s) => String(s._id) === recipient) ? "student" : "teacher",
    type: "TIMETABLE_CHANGE",
    title,
    message: message.slice(0, 1000),
    link: "",
    isRead: false,
  }));
};

const findConflicts = async ({ entry, excludeId }) => {
  const start = timeToMinutes(entry.startTime);
  const end = timeToMinutes(entry.endTime);
  if (start === null || end === null || start >= end) {
    return [{ conflictType: "time", message: "End time must be later than start time." }];
  }

  const existing = await TimetableEntry.find({
    _id: excludeId ? { $ne: excludeId } : { $exists: true },
    academicYear: entry.academicYear,
    dayOfWeek: entry.dayOfWeek,
    active: true,
    $or: [
      { course: entry.course, semester: entry.semester, division: entry.division },
      ...(entry.teacher ? [{ teacher: entry.teacher }] : []),
      ...(entry.room ? [{ room: entry.room }] : []),
    ],
  }).lean();

  const conflicts = [];
  for (const item of existing) {
    const otherStart = timeToMinutes(item.startTime);
    const otherEnd = timeToMinutes(item.endTime);
    if (otherStart === null || otherEnd === null || !overlaps(start, end, otherStart, otherEnd)) continue;

    let conflictType = "group";
    let message = "This class group already has a timetable entry in this time range.";
    if (entry.teacher && item.teacher && String(entry.teacher) === String(item.teacher)) {
      conflictType = "teacher";
      message = "Selected teacher is already assigned to another class in this time range.";
    } else if (entry.room && item.room && String(entry.room) === String(item.room)) {
      conflictType = "room";
      message = "Selected classroom is already occupied in this time range.";
    }

    conflicts.push({
      conflictType,
      message,
      existingEntryId: item._id,
      existingStartTime: item.startTime,
      existingEndTime: item.endTime,
    });
  }
  return conflicts;
};

const applyChange = (entry, change) => {
  if (!change) return { ...entry };
  if (change.changeType === "Cancelled") return { ...entry, cancelled: true, changeId: change._id };
  const updated = {
    ...entry,
    changeId: change._id,
    changeType: change.changeType,
    originalStartTime: entry.startTime,
    originalEndTime: entry.endTime,
  };
  if (change.newStartTime) updated.startTime = change.newStartTime;
  if (change.newEndTime) updated.endTime = change.newEndTime;
  if (change.newTeacher) updated.teacher = change.newTeacher;
  if (change.newRoom) updated.room = change.newRoom;
  return updated;
};

const populateEntries = (query) => query
  .populate("course", "courseName courseCode durationYears")
  .populate("subject", "subjectName subjectCode semester credits teacher")
  .populate("teacher", "name id_no email department")
  .populate("room", "roomCode roomName building floor roomType capacity active");

router.use(authMiddleware);

// ===================== CLASSROOMS =====================
router.get("/classrooms", async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { active: true };
    const rooms = await Classroom.find(filter).sort({ building: 1, roomCode: 1 }).lean();
    res.json(rooms);
  } catch (err) {
    console.error("Fetch Classrooms Error:", err);
    res.status(500).json({ message: "Failed to load classrooms." });
  }
});

router.post("/classrooms", requireRole("admin"), async (req, res) => {
  try {
    const roomCode = clean(req.body.roomCode).toUpperCase();
    const roomName = clean(req.body.roomName);
    const building = clean(req.body.building);
    const floor = Number(req.body.floor || 0);
    const capacity = Number(req.body.capacity || 0);
    const roomType = clean(req.body.roomType) || "Classroom";

    if (roomCode.length < 2 || roomCode.length > 30) return res.status(400).json({ message: "Room code must be between 2 and 30 characters." });
    if (roomName.length < 2 || roomName.length > 100) return res.status(400).json({ message: "Room name must be between 2 and 100 characters." });
    if (!Number.isInteger(floor) || floor < 0 || floor > 100) return res.status(400).json({ message: "Invalid floor." });
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 5000) return res.status(400).json({ message: "Invalid room capacity." });

    const existing = await Classroom.findOne({ roomCode }).lean();
    if (existing) return res.status(409).json({ message: "A classroom with this room code already exists." });

    const room = await Classroom.create({ roomCode, roomName, building, floor, capacity, roomType });
    res.status(201).json({ message: "Classroom created successfully.", room });
  } catch (err) {
    console.error("Create Classroom Error:", err);
    res.status(500).json({ message: err.message || "Failed to create classroom." });
  }
});

router.put("/classrooms/:id", requireRole("admin"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid classroom ID." });
    const room = await Classroom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Classroom not found." });

    const roomCode = clean(req.body.roomCode || room.roomCode).toUpperCase();
    const roomName = clean(req.body.roomName || room.roomName);
    const building = clean(req.body.building ?? room.building);
    const floor = Number(req.body.floor ?? room.floor);
    const capacity = Number(req.body.capacity ?? room.capacity);
    const roomType = clean(req.body.roomType || room.roomType);
    const active = typeof req.body.active === "boolean" ? req.body.active : room.active;

    const duplicate = await Classroom.findOne({ _id: { $ne: room._id }, roomCode }).lean();
    if (duplicate) return res.status(409).json({ message: "Another classroom already uses this room code." });
    if (roomCode.length < 2 || roomCode.length > 30) return res.status(400).json({ message: "Room code must be between 2 and 30 characters." });
    if (roomName.length < 2 || roomName.length > 100) return res.status(400).json({ message: "Room name must be between 2 and 100 characters." });
    if (!Number.isInteger(floor) || floor < 0 || floor > 100) return res.status(400).json({ message: "Invalid floor." });
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 5000) return res.status(400).json({ message: "Invalid room capacity." });

    room.roomCode = roomCode;
    room.roomName = roomName;
    room.building = building;
    room.floor = floor;
    room.capacity = capacity;
    room.roomType = roomType;
    room.active = active;
    await room.save();

    res.json({ message: "Classroom updated successfully.", room });
  } catch (err) {
    console.error("Update Classroom Error:", err);
    res.status(500).json({ message: err.message || "Failed to update classroom." });
  }
});

router.delete("/classrooms/:id", requireRole("admin"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid classroom ID." });
    const room = await Classroom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Classroom not found." });

    const inUse = await TimetableEntry.exists({ room: room._id, active: true });
    if (inUse) {
      room.active = false;
      await room.save();
      return res.json({ message: "Classroom is currently used by the timetable, so it has been deactivated instead of deleted." });
    }

    await room.deleteOne();
    res.json({ message: "Classroom deleted successfully." });
  } catch (err) {
    console.error("Delete Classroom Error:", err);
    res.status(500).json({ message: "Failed to delete classroom." });
  }
});

// ===================== WEEKLY TIMETABLE CRUD =====================
router.get("/entries", requireRole("admin"), async (req, res) => {
  try {
    const filter = { active: true };
    if (req.query.academicYear) filter.academicYear = clean(req.query.academicYear);
    if (req.query.course && isObjectId(req.query.course)) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.division) filter.division = clean(req.query.division).toUpperCase();
    if (req.query.dayOfWeek && DAYS.includes(req.query.dayOfWeek)) filter.dayOfWeek = req.query.dayOfWeek;

    const entries = await populateEntries(TimetableEntry.find(filter).sort({ dayOfWeek: 1, startTime: 1 })).lean();
    res.json(entries);
  } catch (err) {
    console.error("Fetch Timetable Entries Error:", err);
    res.status(500).json({ message: "Failed to load timetable entries." });
  }
});

router.post("/entries", requireRole("admin"), async (req, res) => {
  try {
    const academicYear = clean(req.body.academicYear) || getDefaultAcademicYear();
    const dayOfWeek = clean(req.body.dayOfWeek);
    const startTime = clean(req.body.startTime);
    const endTime = clean(req.body.endTime);
    const type = clean(req.body.type) || "Lecture";
    const courseId = clean(req.body.courseId);
    const semester = Number(req.body.semester);
    const division = clean(req.body.division || "A").toUpperCase();
    const subjectId = clean(req.body.subjectId);
    const teacherId = clean(req.body.teacherId);
    const roomId = clean(req.body.roomId);
    const notes = clean(req.body.notes);

    if (academicYear.length < 7 || academicYear.length > 20) return res.status(400).json({ message: "Academic year is required and must be valid." });
    if (!DAYS.includes(dayOfWeek)) return res.status(400).json({ message: "Invalid day of week." });
    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime) || timeToMinutes(startTime) >= timeToMinutes(endTime)) return res.status(400).json({ message: "Start and end times must be valid, and end time must be later." });
    if (!ENTRY_TYPES.includes(type)) return res.status(400).json({ message: "Invalid timetable entry type." });
    if (!isObjectId(courseId)) return res.status(400).json({ message: "Please select a valid course." });
    if (!Number.isInteger(semester) || semester < 1 || semester > 20) return res.status(400).json({ message: "Semester must be between 1 and 20." });
    if (division.length < 1 || division.length > 10) return res.status(400).json({ message: "Division is invalid." });

    const course = await Course.findById(courseId).lean();
    if (!course) return res.status(404).json({ message: "Course not found." });
    const maxSemester = Math.max(1, Number(course.durationYears || 3) * 2);
    if (semester > maxSemester) return res.status(400).json({ message: `Semester must be between 1 and ${maxSemester} for this course.` });

    if (type !== "Break") {
      if (!isObjectId(subjectId)) return res.status(400).json({ message: "Subject is required for this timetable entry." });
      const subject = await Subject.findById(subjectId).lean();
      if (!subject) return res.status(404).json({ message: "Subject not found." });
      if (String(subject.course) !== String(courseId) || Number(subject.semester) !== semester) return res.status(400).json({ message: "Selected subject does not belong to the selected course/semester." });
    }

    if (teacherId) {
      if (!isObjectId(teacherId)) return res.status(400).json({ message: "Invalid teacher." });
      const teacher = await User.findOne({ _id: teacherId, role: "teacher", status: true }).lean();
      if (!teacher) return res.status(400).json({ message: "Selected teacher is invalid or inactive." });
    }

    if (roomId) {
      if (!isObjectId(roomId)) return res.status(400).json({ message: "Invalid classroom." });
      const room = await Classroom.findOne({ _id: roomId, active: true }).lean();
      if (!room) return res.status(400).json({ message: "Selected classroom is invalid or inactive." });
    }

    const entry = { academicYear, dayOfWeek, startTime, endTime, type, course: courseId, semester, division, subject: subjectId || null, teacher: teacherId || null, room: roomId || null, notes };
    const conflicts = await findConflicts({ entry });
    if (conflicts.length) return res.status(409).json({ message: "Timetable conflict detected.", conflicts });

    const created = await TimetableEntry.create(entry);
    const populated = await populateEntries(TimetableEntry.findById(created._id));
    res.status(201).json({ message: "Timetable entry created successfully.", entry: await populated });
  } catch (err) {
    console.error("Create Timetable Entry Error:", err);
    res.status(500).json({ message: err.message || "Failed to create timetable entry." });
  }
});

router.put("/entries/:id", requireRole("admin"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid timetable entry ID." });
    const current = await TimetableEntry.findById(req.params.id);
    if (!current) return res.status(404).json({ message: "Timetable entry not found." });

    const updated = {
      academicYear: clean(req.body.academicYear || current.academicYear),
      dayOfWeek: clean(req.body.dayOfWeek || current.dayOfWeek),
      startTime: clean(req.body.startTime || current.startTime),
      endTime: clean(req.body.endTime || current.endTime),
      type: clean(req.body.type || current.type),
      course: clean(req.body.courseId || current.course),
      semester: Number(req.body.semester ?? current.semester),
      division: clean(req.body.division || current.division).toUpperCase(),
      subject: req.body.subjectId !== undefined ? clean(req.body.subjectId) || null : current.subject,
      teacher: req.body.teacherId !== undefined ? clean(req.body.teacherId) || null : current.teacher,
      room: req.body.roomId !== undefined ? clean(req.body.roomId) || null : current.room,
      notes: req.body.notes !== undefined ? clean(req.body.notes) : current.notes,
    };

    if (!DAYS.includes(updated.dayOfWeek)) return res.status(400).json({ message: "Invalid day of week." });
    if (!TIME_REGEX.test(updated.startTime) || !TIME_REGEX.test(updated.endTime) || timeToMinutes(updated.startTime) >= timeToMinutes(updated.endTime)) return res.status(400).json({ message: "Start and end times must be valid, and end time must be later." });
    if (!ENTRY_TYPES.includes(updated.type)) return res.status(400).json({ message: "Invalid timetable entry type." });
    if (!isObjectId(updated.course)) return res.status(400).json({ message: "Invalid course." });
    if (!Number.isInteger(updated.semester) || updated.semester < 1 || updated.semester > 20) return res.status(400).json({ message: "Semester must be between 1 and 20." });

    const course = await Course.findById(updated.course).lean();
    if (!course) return res.status(404).json({ message: "Course not found." });
    const maxSemester = Math.max(1, Number(course.durationYears || 3) * 2);
    if (updated.semester > maxSemester) return res.status(400).json({ message: `Semester must be between 1 and ${maxSemester} for this course.` });

    if (updated.type !== "Break") {
      if (!isObjectId(updated.subject)) return res.status(400).json({ message: "Subject is required for this timetable entry." });
      const subject = await Subject.findById(updated.subject).lean();
      if (!subject) return res.status(404).json({ message: "Subject not found." });
      if (String(subject.course) !== String(updated.course) || Number(subject.semester) !== updated.semester) return res.status(400).json({ message: "Selected subject does not belong to the selected course/semester." });
    } else {
      updated.subject = null;
    }

    if (updated.teacher) {
      if (!isObjectId(updated.teacher)) return res.status(400).json({ message: "Invalid teacher." });
      const teacher = await User.findOne({ _id: updated.teacher, role: "teacher", status: true }).lean();
      if (!teacher) return res.status(400).json({ message: "Selected teacher is invalid or inactive." });
    }
    if (updated.room) {
      if (!isObjectId(updated.room)) return res.status(400).json({ message: "Invalid classroom." });
      const room = await Classroom.findOne({ _id: updated.room, active: true }).lean();
      if (!room) return res.status(400).json({ message: "Selected classroom is invalid or inactive." });
    }

    const conflicts = await findConflicts({ entry: updated, excludeId: current._id });
    if (conflicts.length) return res.status(409).json({ message: "Timetable conflict detected.", conflicts });

    Object.assign(current, updated);
    await current.save();
    const populated = await populateEntries(TimetableEntry.findById(current._id));
    res.json({ message: "Timetable entry updated successfully.", entry: await populated });
  } catch (err) {
    console.error("Update Timetable Entry Error:", err);
    res.status(500).json({ message: err.message || "Failed to update timetable entry." });
  }
});

router.delete("/entries/:id", requireRole("admin"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid timetable entry ID." });
    const entry = await TimetableEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Timetable entry not found." });
    entry.active = false;
    await entry.save();
    await TimetableChange.updateMany({ entry: entry._id, active: true }, { $set: { active: false } });
    res.json({ message: "Timetable entry removed successfully." });
  } catch (err) {
    console.error("Delete Timetable Entry Error:", err);
    res.status(500).json({ message: "Failed to remove timetable entry." });
  }
});

// ===================== TIMETABLE CHANGES =====================
router.post("/changes", requireRole("admin"), async (req, res) => {
  try {
    const entryId = clean(req.body.entryId);
    const date = clean(req.body.date);
    const changeType = clean(req.body.changeType);
    const message = clean(req.body.message);
    const reason = clean(req.body.reason);
    const newStartTime = clean(req.body.newStartTime);
    const newEndTime = clean(req.body.newEndTime);
    const newTeacher = clean(req.body.newTeacher || "");
    const newRoom = clean(req.body.newRoom || "");

    if (!validateDate(date)) return res.status(400).json({ message: "Please provide a valid change date." });
    if (!CHANGE_TYPES.includes(changeType)) return res.status(400).json({ message: "Invalid timetable change type." });
    if (message.length > 500 || reason.length > 300) return res.status(400).json({ message: "Change message/reason is too long." });

    let baseEntry = null;
    if (entryId) {
      if (!isObjectId(entryId)) return res.status(400).json({ message: "Invalid timetable entry ID." });
      baseEntry = await TimetableEntry.findOne({ _id: entryId, active: true }).lean();
      if (!baseEntry) return res.status(404).json({ message: "Original timetable entry not found or inactive." });
    }

    if (changeType !== "Extra Class" && !baseEntry) return res.status(400).json({ message: "An original timetable entry is required for this change type." });

    const academicYear = clean(req.body.academicYear || baseEntry?.academicYear || getDefaultAcademicYear());
    let courseId = baseEntry?.course || clean(req.body.courseId);
    const semester = Number(baseEntry?.semester ?? req.body.semester);
    const division = clean(baseEntry?.division || req.body.division || "A").toUpperCase();
    if (!isObjectId(courseId)) return res.status(400).json({ message: "A valid course is required." });
    if (!Number.isInteger(semester) || semester < 1 || semester > 20) return res.status(400).json({ message: "Semester must be between 1 and 20." });

    const course = await Course.findById(courseId).lean();
    if (!course) return res.status(404).json({ message: "Course not found." });
    if (academicYear.length < 7 || academicYear.length > 20) return res.status(400).json({ message: "Academic year is invalid." });

    if (changeType === "Time Change" || changeType === "Extra Class") {
      if (!TIME_REGEX.test(newStartTime) || !TIME_REGEX.test(newEndTime) || timeToMinutes(newStartTime) >= timeToMinutes(newEndTime)) return res.status(400).json({ message: "A valid new start/end time is required." });
    }

    if (newTeacher) {
      if (!isObjectId(newTeacher)) return res.status(400).json({ message: "Invalid replacement teacher." });
      const teacher = await User.findOne({ _id: newTeacher, role: "teacher", status: true }).lean();
      if (!teacher) return res.status(400).json({ message: "Replacement teacher is invalid or inactive." });
    }

    if (newRoom) {
      if (!isObjectId(newRoom)) return res.status(400).json({ message: "Invalid replacement classroom." });
      const room = await Classroom.findOne({ _id: newRoom, active: true }).lean();
      if (!room) return res.status(400).json({ message: "Replacement classroom is invalid or inactive." });
    }

    let changeSubjectId = baseEntry?.subject || null;

    if (changeType === "Extra Class") {
      const subjectId = clean(req.body.subjectId);
      const teacherId = newTeacher || clean(req.body.teacherId);
      const roomId = newRoom || clean(req.body.roomId);
      if (!isObjectId(subjectId)) return res.status(400).json({ message: "Subject is required for an extra class." });
      const subject = await Subject.findById(subjectId).lean();
      if (!subject || String(subject.course) !== String(courseId) || Number(subject.semester) !== semester) return res.status(400).json({ message: "Extra class subject does not match the selected course/semester." });
      changeSubjectId = subjectId;

      const dayOfWeek = dateToDay(date);
      const conflictEntry = { academicYear, dayOfWeek, startTime: newStartTime, endTime: newEndTime, course: courseId, semester, division, teacher: teacherId || null, room: roomId || null };
      const conflicts = await findConflicts({ entry: conflictEntry });
      if (conflicts.length) return res.status(409).json({ message: "Extra class conflict detected.", conflicts });
    }

    const change = await TimetableChange.create({
      entry: baseEntry?._id || null,
      academicYear,
      date: toStartOfDay(date),
      changeType,
      course: courseId,
      semester,
      division,
      subject: changeSubjectId || null,
      newStartTime: newStartTime || "",
      newEndTime: newEndTime || "",
      newTeacher: newTeacher || null,
      newRoom: newRoom || null,
      message,
      reason,
      active: true,
      createdBy: req.user.id,
    });

    const notificationDocs = await buildNotificationDocs({ course, semester, division, entry: baseEntry, change, actorId: req.user.id });
    if (notificationDocs.length) await Notification.insertMany(notificationDocs);

    const populated = await TimetableChange.findById(change._id)
      .populate("entry")
      .populate("course", "courseName courseCode")
      .populate("newTeacher", "name id_no email")
      .populate("newRoom", "roomCode roomName building floor roomType")
      .lean();

    res.status(201).json({
      message: "Timetable change saved and affected users notified.",
      change: populated,
      notificationCount: notificationDocs.length,
    });
  } catch (err) {
    console.error("Create Timetable Change Error:", err);
    res.status(500).json({ message: err.message || "Failed to save timetable change." });
  }
});

router.get("/changes", requireRole("admin"), async (req, res) => {
  try {
    const filter = { active: true, academicYear: clean(req.query.academicYear) || getDefaultAcademicYear() };
    if (req.query.date && validateDate(clean(req.query.date))) {
      filter.date = { $gte: toStartOfDay(clean(req.query.date)), $lte: toEndOfDay(clean(req.query.date)) };
    }
    if (req.query.course && isObjectId(req.query.course)) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.division) filter.division = clean(req.query.division).toUpperCase();

    const changes = await TimetableChange.find(filter)
      .sort({ date: 1, createdAt: -1 })
      .populate("entry")
      .populate("course", "courseName courseCode")
      .populate("newTeacher", "name id_no email")
      .populate("newRoom", "roomCode roomName building floor roomType")
      .lean();
    res.json(changes);
  } catch (err) {
    console.error("Fetch Timetable Changes Error:", err);
    res.status(500).json({ message: "Failed to load timetable changes." });
  }
});

router.delete("/changes/:id", requireRole("admin"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid timetable change ID." });
    const change = await TimetableChange.findById(req.params.id);
    if (!change) return res.status(404).json({ message: "Timetable change not found." });
    change.active = false;
    await change.save();
    res.json({ message: "Timetable change cancelled successfully." });
  } catch (err) {
    console.error("Cancel Timetable Change Error:", err);
    res.status(500).json({ message: "Failed to cancel timetable change." });
  }
});

// ===================== MY WEEKLY TIMETABLE =====================
router.get("/me/week", requireRole("admin", "teacher", "student"), async (req, res) => {
  try {
    const referenceDate = clean(req.query.date) || new Date().toISOString().slice(0, 10);
    if (!validateDate(referenceDate)) return res.status(400).json({ message: "Please provide a valid reference date." });
    const ref = toStartOfDay(referenceDate);
    const monday = new Date(ref);
    const shift = (ref.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - shift);

    const dates = DAYS.map((day, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return { date: date.toISOString().slice(0, 10), dayOfWeek: day };
    });

    const academicYear = clean(req.query.academicYear) || getDefaultAcademicYear();
    const baseFilter = { active: true, academicYear };

    if (req.user.role === "teacher") baseFilter.teacher = req.user.id;
    if (req.user.role === "student") {
      const student = await User.findById(req.user.id).select("course department semester division").lean();
      if (!student) return res.status(404).json({ message: "Student not found." });
      const course = await getCourseFromStudent(student);
      if (!course) return res.status(404).json({ message: "Student course could not be matched with a configured course." });
      baseFilter.course = course._id;
      baseFilter.semester = Number(student.semester || 1);
      baseFilter.division = String(student.division || "A").toUpperCase();
    }

    let entries = await populateEntries(TimetableEntry.find(baseFilter)).lean();
    const changes = await TimetableChange.find({
      active: true,
      academicYear,
      date: { $gte: toStartOfDay(dates[0].date), $lte: toEndOfDay(dates[dates.length - 1].date) },
    })
      .populate("course", "courseName courseCode")
      .populate("subject", "subjectName subjectCode semester credits")
      .populate("newTeacher", "name id_no email department")
      .populate("newRoom", "roomCode roomName building floor roomType capacity active")
      .lean();

    if (req.user.role === "teacher") {
      const replacementIds = changes
        .filter((change) => change.newTeacher && String(change.newTeacher._id) === String(req.user.id) && change.entry)
        .map((change) => change.entry);
      if (replacementIds.length) {
        const additional = await populateEntries(TimetableEntry.find({ _id: { $in: replacementIds }, active: true, academicYear })).lean();
        const seen = new Set(entries.map((entry) => String(entry._id)));
        entries = entries.concat(additional.filter((entry) => !seen.has(String(entry._id))));
      }
    }

    const week = dates.map((day) => {
      let dayEntries = entries.filter((entry) => entry.dayOfWeek === day.dayOfWeek).map((entry) => ({ ...entry }));
      const dayChanges = changes.filter((change) => String(change.date).slice(0, 10) === day.date && dayEntries.some((e) => String(e._id) === String(change.entry)));

      for (const change of dayChanges) {
        const index = dayEntries.findIndex((e) => String(e._id) === String(change.entry));
        if (index !== -1) {
          const effective = applyChange(dayEntries[index], change);
          if (effective.cancelled) dayEntries.splice(index, 1, effective);
          else dayEntries[index] = effective;
        }
      }

      if (req.user.role === "teacher") {
        dayEntries = dayEntries.filter((entry) => String(entry.teacher?._id || entry.teacher) === String(req.user.id) && !entry.cancelled);
      }

      const extraChanges = changes.filter((change) => String(change.date).slice(0, 10) === day.date && change.changeType === "Extra Class");
      if (extraChanges.length) {
        for (const change of extraChanges) {
          if (req.user.role === "teacher" && change.newTeacher && String(change.newTeacher._id) !== String(req.user.id)) continue;
          if (req.user.role === "student") {
            const matchingCourse = baseFilter.course && change.course && String(change.course._id) === String(baseFilter.course);
            const matchingGroup = Number(change.semester) === Number(baseFilter.semester) && String(change.division) === String(baseFilter.division);
            if (!matchingCourse || !matchingGroup) continue;
          }
          dayEntries.push({
            _id: `extra-${change._id}`,
            date: day.date,
            dayOfWeek: day.dayOfWeek,
            academicYear: change.academicYear || academicYear,
            startTime: change.newStartTime,
            endTime: change.newEndTime,
            type: "Extra Class",
            course: change.course,
            semester: change.semester,
            division: change.division,
            subject: change.subject || null,
            teacher: change.newTeacher,
            room: change.newRoom,
            notes: change.message || change.reason || "",
            isExtraClass: true,
            changeId: change._id,
          });
        }
      }

      dayEntries.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      return { date: day.date, dayOfWeek: day.dayOfWeek, entries: dayEntries };
    });

    res.json({ academicYear, week });
  } catch (err) {
    console.error("Fetch My Weekly Timetable Error:", err);
    res.status(500).json({ message: "Failed to load your weekly timetable." });
  }
});

// ===================== ROOM OCCUPANCY =====================
router.get("/room-occupancy", requireRole("admin"), async (req, res) => {
  try {
    const date = clean(req.query.date);
    if (!validateDate(date)) return res.status(400).json({ message: "Please provide a valid date." });
    const dayOfWeek = dateToDay(date);
    const academicYear = clean(req.query.academicYear) || getDefaultAcademicYear();

    const rooms = await Classroom.find({ active: true }).sort({ building: 1, roomCode: 1 }).lean();
    const entries = await populateEntries(TimetableEntry.find({ academicYear, dayOfWeek, active: true, room: { $ne: null } })).lean();
    const changes = await TimetableChange.find({ date: { $gte: toStartOfDay(date), $lte: toEndOfDay(date) }, active: true })
      .populate("newRoom", "roomCode roomName building floor roomType capacity active")
      .lean();

    const effective = [];
    for (const entry of entries) {
      const relevant = changes.find((change) => String(change.entry) === String(entry._id));
      if (relevant?.changeType === "Cancelled") continue;
      const item = applyChange(entry, relevant);
      if (item.room) effective.push(item);
    }

    const rows = rooms.map((room) => {
      const occupied = effective
        .filter((entry) => entry.room && String(entry.room._id || entry.room) === String(room._id))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      return { room, occupied }; 
    });

    res.json({ date, dayOfWeek, academicYear, rooms: rows });
  } catch (err) {
    console.error("Room Occupancy Error:", err);
    res.status(500).json({ message: "Failed to load room occupancy." });
  }
});

module.exports = router;
