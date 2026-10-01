import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ENTRY_TYPES = ["Lecture", "Lab", "Practical", "Seminar", "Workshop", "Activity", "Break", "Other"];
const CHANGE_TYPES = ["Room Change", "Time Change", "Teacher Change", "Cancelled", "Extra Class", "Other"];

const getDefaultAcademicYear = () => {
  const year = new Date().getFullYear();
  return `${year}-${String(year + 1).slice(-2)}`;
};

const emptyClassForm = (academicYear) => ({
  id: "",
  academicYear,
  dayOfWeek: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  type: "Lecture",
  courseId: "",
  semester: 1,
  division: "A",
  subjectId: "",
  teacherId: "",
  roomId: "",
  notes: "",
});

const emptyRoomForm = () => ({
  id: "",
  roomCode: "",
  roomName: "",
  building: "",
  floor: 0,
  roomType: "Classroom",
  capacity: 0,
  active: true,
});

const emptyChangeForm = (academicYear) => ({
  id: "",
  academicYear,
  entryId: "",
  date: new Date().toISOString().slice(0, 10),
  changeType: "Room Change",
  courseId: "",
  semester: 1,
  division: "A",
  subjectId: "",
  newStartTime: "",
  newEndTime: "",
  newTeacher: "",
  newRoom: "",
  message: "",
  reason: "",
});

const errorMessage = (error, fallback) => {
  const data = error?.response?.data;
  if (data?.conflicts?.length) {
    const details = data.conflicts
      .map((c) => c.message)
      .filter(Boolean)
      .join("\n");
    return `${data.message || fallback}\n${details}`;
  }
  return data?.message || error?.message || fallback;
};

const timeToMinutes = (value) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : 9999;
};

export default function AdminTimetablePanel({ onClose }) {
  const token = localStorage.getItem("token");
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const [activeTab, setActiveTab] = useState("weekly");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [entries, setEntries] = useState([]);
  const [changes, setChanges] = useState([]);

  const [academicYear, setAcademicYear] = useState(getDefaultAcademicYear());
  const [courseFilter, setCourseFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");

  const [classForm, setClassForm] = useState(() => emptyClassForm(getDefaultAcademicYear()));
  const [roomForm, setRoomForm] = useState(emptyRoomForm());
  const [changeForm, setChangeForm] = useState(() => emptyChangeForm(getDefaultAcademicYear()));

  const [occupancyDate, setOccupancyDate] = useState(new Date().toISOString().slice(0, 10));
  const [occupancy, setOccupancy] = useState(null);

  const [editingRoom, setEditingRoom] = useState(false);
  const [editingClass, setEditingClass] = useState(false);

  const filteredSubjects = useMemo(() => {
    const courseId = classForm.courseId || changeForm.courseId;
    const semester = Number(classForm.courseId ? classForm.semester : changeForm.semester);
    if (!courseId) return subjects;
    return subjects.filter(
      (s) => String(s.course?._id || s.course) === String(courseId) && Number(s.semester) === semester,
    );
  }, [subjects, classForm.courseId, classForm.semester, changeForm.courseId, changeForm.semester]);

  const filterEntries = useMemo(() => {
    return entries
      .filter((entry) => !courseFilter || String(entry.course?._id || entry.course) === String(courseFilter))
      .filter((entry) => !semesterFilter || Number(entry.semester) === Number(semesterFilter))
      .filter((entry) => !divisionFilter || String(entry.division || "A") === divisionFilter.toUpperCase())
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [entries, courseFilter, semesterFilter, divisionFilter]);

  const loadMeta = async () => {
    const [metaRes, roomRes] = await Promise.all([
      axios.get(`${API}/admin/academic-meta`, authConfig),
      axios.get(`${API}/timetable/classrooms`, authConfig),
    ]);
    setCourses(metaRes.data?.courses || []);
    setTeachers(metaRes.data?.teachers || []);
    setSubjects(metaRes.data?.subjects || []);
    setClassrooms(roomRes.data || []);
  };

  const loadEntries = async () => {
    const params = new URLSearchParams();
    if (academicYear) params.set("academicYear", academicYear);
    if (courseFilter) params.set("course", courseFilter);
    if (semesterFilter) params.set("semester", semesterFilter);
    if (divisionFilter) params.set("division", divisionFilter);
    const res = await axios.get(`${API}/timetable/entries?${params.toString()}`, authConfig);
    setEntries(res.data || []);
  };

  const loadChanges = async () => {
    const params = new URLSearchParams({ academicYear });
    if (courseFilter) params.set("course", courseFilter);
    if (semesterFilter) params.set("semester", semesterFilter);
    if (divisionFilter) params.set("division", divisionFilter);
    const res = await axios.get(`${API}/timetable/changes?${params.toString()}`, authConfig);
    setChanges(res.data || []);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setMessage("");
      await Promise.all([loadMeta(), loadEntries(), loadChanges()]);
    } catch (error) {
      setMessage(errorMessage(error, "Failed to load timetable data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(); // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setClassForm((prev) => ({ ...prev, academicYear }));
    setChangeForm((prev) => ({ ...prev, academicYear }));
  }, [academicYear]);

  const resetClassForm = () => {
    const next = emptyClassForm(academicYear);
    if (courseFilter) next.courseId = courseFilter;
    if (semesterFilter) next.semester = Number(semesterFilter);
    if (divisionFilter) next.division = divisionFilter.toUpperCase();
    setClassForm(next);
    setEditingClass(false);
  };

  const resetChangeForm = () => {
    const next = emptyChangeForm(academicYear);
    next.courseId = courseFilter || "";
    next.semester = Number(semesterFilter || 1);
    next.division = divisionFilter ? divisionFilter.toUpperCase() : "A";
    setChangeForm(next);
  };

  const handleSaveClass = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage("");
      const payload = {
        academicYear: classForm.academicYear,
        dayOfWeek: classForm.dayOfWeek,
        startTime: classForm.startTime,
        endTime: classForm.endTime,
        type: classForm.type,
        courseId: classForm.courseId,
        semester: Number(classForm.semester),
        division: classForm.division.toUpperCase(),
        subjectId: classForm.type === "Break" ? "" : classForm.subjectId,
        teacherId: classForm.teacherId || "",
        roomId: classForm.roomId || "",
        notes: classForm.notes,
      };
      if (editingClass) {
        await axios.put(`${API}/timetable/entries/${classForm.id}`, payload, authConfig);
        setMessage("Timetable entry updated successfully.");
      } else {
        await axios.post(`${API}/timetable/entries`, payload, authConfig);
        setMessage("Timetable entry created successfully.");
      }
      resetClassForm();
      await loadEntries();
    } catch (error) {
      setMessage(errorMessage(error, "Failed to save timetable entry."));
    } finally {
      setSaving(false);
    }
  };

  const editClass = (entry) => {
    setClassForm({
      id: entry._id,
      academicYear: entry.academicYear,
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      type: entry.type,
      courseId: entry.course?._id || entry.course || "",
      semester: Number(entry.semester || 1),
      division: entry.division || "A",
      subjectId: entry.subject?._id || entry.subject || "",
      teacherId: entry.teacher?._id || entry.teacher || "",
      roomId: entry.room?._id || entry.room || "",
      notes: entry.notes || "",
    });
    setEditingClass(true);
    setActiveTab("class");
  };

  const deleteClass = async (id) => {
    if (!window.confirm("Delete this timetable entry? Existing historical change records are preserved as inactive records.")) return;
    try {
      setSaving(true);
      await axios.delete(`${API}/timetable/entries/${id}`, authConfig);
      setMessage("Timetable entry removed successfully.");
      await loadEntries();
    } catch (error) {
      setMessage(errorMessage(error, "Failed to delete timetable entry."));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRoom = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = {
        roomCode: roomForm.roomCode,
        roomName: roomForm.roomName,
        building: roomForm.building,
        floor: Number(roomForm.floor),
        roomType: roomForm.roomType,
        capacity: Number(roomForm.capacity),
        active: Boolean(roomForm.active),
      };
      if (editingRoom) {
        await axios.put(`${API}/timetable/classrooms/${roomForm.id}`, payload, authConfig);
        setMessage("Classroom updated successfully.");
      } else {
        await axios.post(`${API}/timetable/classrooms`, payload, authConfig);
        setMessage("Classroom created successfully.");
      }
      setRoomForm(emptyRoomForm());
      setEditingRoom(false);
      await loadMeta();
    } catch (error) {
      setMessage(errorMessage(error, "Failed to save classroom."));
    } finally {
      setSaving(false);
    }
  };

  const editRoom = (room) => {
    setRoomForm({
      id: room._id,
      roomCode: room.roomCode || "",
      roomName: room.roomName || "",
      building: room.building || "",
      floor: Number(room.floor || 0),
      roomType: room.roomType || "Classroom",
      capacity: Number(room.capacity || 0),
      active: room.active !== false,
    });
    setEditingRoom(true);
  };

  const deleteRoom = async (id) => {
    if (!window.confirm("Delete/deactivate this classroom?")) return;
    try {
      setSaving(true);
      const res = await axios.delete(`${API}/timetable/classrooms/${id}`, authConfig);
      setMessage(res.data?.message || "Classroom removed.");
      await loadMeta();
    } catch (error) {
      setMessage(errorMessage(error, "Failed to remove classroom."));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveChange = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = {
        academicYear: changeForm.academicYear,
        entryId: changeForm.entryId || "",
        date: changeForm.date,
        changeType: changeForm.changeType,
        courseId: changeForm.courseId || "",
        semester: Number(changeForm.semester),
        division: changeForm.division.toUpperCase(),
        subjectId: changeForm.subjectId || "",
        newStartTime: changeForm.newStartTime,
        newEndTime: changeForm.newEndTime,
        newTeacher: changeForm.newTeacher || "",
        newRoom: changeForm.newRoom || "",
        message: changeForm.message,
        reason: changeForm.reason,
      };
      await axios.post(`${API}/timetable/changes`, payload, authConfig);
      setMessage("Timetable change saved and affected users were notified.");
      resetChangeForm();
      await loadChanges();
    } catch (error) {
      setMessage(errorMessage(error, "Failed to save timetable change."));
    } finally {
      setSaving(false);
    }
  };

  const cancelChange = async (id) => {
    if (!window.confirm("Cancel this timetable change?")) return;
    try {
      setSaving(true);
      await axios.delete(`${API}/timetable/changes/${id}`, authConfig);
      setMessage("Timetable change cancelled.");
      await loadChanges();
    } catch (error) {
      setMessage(errorMessage(error, "Failed to cancel timetable change."));
    } finally {
      setSaving(false);
    }
  };

  const loadOccupancy = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `${API}/timetable/room-occupancy?date=${encodeURIComponent(occupancyDate)}&academicYear=${encodeURIComponent(academicYear)}`,
        authConfig,
      );
      setOccupancy(res.data);
    } catch (error) {
      setMessage(errorMessage(error, "Failed to load room occupancy."));
    } finally {
      setLoading(false);
    }
  };

  const daysWithEntries = DAYS.map((day) => ({
    day,
    entries: filterEntries.filter((entry) => entry.dayOfWeek === day),
  }));

  const getEntryLabel = (entry) => {
    if (entry.type === "Break") return "BREAK";
    return entry.subject?.subjectName || "Untitled Class";
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-7xl max-h-[94vh] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-800">📚 Timetable Control Center</h3>
            <p className="text-xs text-gray-500 mt-1">Create weekly classes, manage rooms, detect conflicts, publish temporary changes and inspect room occupancy.</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-6 pt-4 border-b bg-gray-50">
          <div className="flex gap-2 flex-wrap">
            {[
              ["weekly", "Weekly Timetable"],
              ["class", editingClass ? "Edit Class" : "Add Class"],
              ["changes", "Class Changes"],
              ["rooms", "Classrooms"],
              ["occupancy", "Room Occupancy"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold ${activeTab === key ? "bg-orange-600 text-white" : "bg-white text-gray-600 border hover:bg-gray-100"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 py-4">
            <div>
              <label className="text-[10px] font-bold text-gray-600 block mb-1">Academic Year</label>
              <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="w-full border rounded-lg p-2 text-xs bg-white" placeholder="2026-27" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 block mb-1">Course Filter</label>
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-full border rounded-lg p-2 text-xs bg-white">
                <option value="">All Courses</option>
                {courses.map((c) => <option key={c._id} value={c._id}>{c.courseName} ({c.courseCode})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 block mb-1">Semester</label>
              <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="w-full border rounded-lg p-2 text-xs bg-white">
                <option value="">All Semesters</option>
                {[1,2,3,4,5,6,7,8,9,10].map((sem) => <option key={sem} value={sem}>Semester {sem}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 block mb-1">Division</label>
              <input value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value.toUpperCase())} className="w-full border rounded-lg p-2 text-xs bg-white" placeholder="A" maxLength={10} />
            </div>
          </div>
        </div>

        {message && (
          <div className="mx-6 mt-4 whitespace-pre-line rounded-lg border bg-orange-50 border-orange-200 text-orange-800 px-3 py-2 text-xs">
            {message}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {loading && <div className="text-center text-xs text-gray-500 mb-4">Loading timetable data…</div>}

          {activeTab === "weekly" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button type="button" onClick={loadAll} className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-xs font-semibold">↻ Refresh</button>
              </div>
              <div className="overflow-auto border rounded-xl">
                <table className="min-w-[1100px] w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      {daysWithEntries.map(({ day }) => <th key={day} className="p-3 text-left border-b min-w-[150px]">{day}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="align-top">
                      {daysWithEntries.map(({ day, entries: dayEntries }) => (
                        <td key={day} className="p-2 border-r last:border-r-0">
                          <div className="space-y-2">
                            {dayEntries.length === 0 ? <div className="text-gray-400 p-4 text-center">No class</div> : dayEntries.map((entry) => (
                              <div key={entry._id} className={`rounded-xl border p-3 ${entry.type === "Break" ? "bg-gray-100 border-gray-200" : "bg-white shadow-sm"}`}>
                                <div className="text-[10px] font-bold text-gray-500">{entry.startTime} – {entry.endTime}</div>
                                <div className="font-bold text-gray-800 mt-1">{getEntryLabel(entry)}</div>
                                <div className="text-[10px] text-gray-500 mt-1">{entry.type} · Sem {entry.semester} · Div {entry.division}</div>
                                {entry.teacher && <div className="text-[10px] text-gray-500">👨‍🏫 {entry.teacher.name}</div>}
                                {entry.room && <div className="text-[10px] text-gray-500">🏫 {entry.room.roomCode}</div>}
                                <div className="flex gap-1 mt-2">
                                  <button type="button" onClick={() => editClass(entry)} className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold">Edit</button>
                                  <button type="button" onClick={() => { setChangeForm((prev) => ({ ...prev, entryId: entry._id, courseId: entry.course?._id || entry.course || "", semester: entry.semester, division: entry.division || "A", subjectId: entry.subject?._id || entry.subject || "" })); setActiveTab("changes"); }} className="px-2 py-1 rounded bg-orange-50 text-orange-700 font-semibold">Change</button>
                                  <button type="button" onClick={() => deleteClass(entry._id)} className="px-2 py-1 rounded bg-red-50 text-red-700 font-semibold">Delete</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "class" && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
              <form onSubmit={handleSaveClass} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-800">{editingClass ? "Edit Timetable Entry" : "Add Timetable Entry"}</h4>
                    <p className="text-[10px] text-gray-500">Room, teacher and student-group conflicts are checked by the backend.</p>
                  </div>
                  {editingClass && <button type="button" onClick={resetClassForm} className="text-xs text-gray-500">Cancel edit</button>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label className="label text-[10px] font-bold text-gray-600">Day</label><select value={classForm.dayOfWeek} onChange={(e) => setClassForm({ ...classForm, dayOfWeek: e.target.value })} className="field w-full border rounded-lg p-2 text-xs"><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option></select></div>
                  <div><label className="text-[10px] font-bold text-gray-600">Start</label><input type="time" value={classForm.startTime} onChange={(e) => setClassForm({ ...classForm, startTime: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required /></div>
                  <div><label className="text-[10px] font-bold text-gray-600">End</label><input type="time" value={classForm.endTime} onChange={(e) => setClassForm({ ...classForm, endTime: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required /></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div><label className="text-[10px] font-bold text-gray-600">Type</label><select value={classForm.type} onChange={(e) => setClassForm({ ...classForm, type: e.target.value, subjectId: e.target.value === "Break" ? "" : classForm.subjectId })} className="w-full border rounded-lg p-2 text-xs">{ENTRY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div>
                  <div><label className="text-[10px] font-bold text-gray-600">Course</label><select value={classForm.courseId} onChange={(e) => setClassForm({ ...classForm, courseId: e.target.value, subjectId: "" })} className="w-full border rounded-lg p-2 text-xs" required><option value="">Select course</option>{courses.map((c) => <option key={c._id} value={c._id}>{c.courseName}</option>)}</select></div>
                  <div><label className="text-[10px] font-bold text-gray-600">Semester</label><select value={classForm.semester} onChange={(e) => setClassForm({ ...classForm, semester: Number(e.target.value), subjectId: "" })} className="w-full border rounded-lg p-2 text-xs">{[1,2,3,4,5,6,7,8,9,10].map((sem) => <option key={sem} value={sem}>{sem}</option>)}</select></div>
                  <div><label className="text-[10px] font-bold text-gray-600">Division</label><input value={classForm.division} onChange={(e) => setClassForm({ ...classForm, division: e.target.value.toUpperCase() })} className="w-full border rounded-lg p-2 text-xs" maxLength={10} required /></div>
                </div>

                {classForm.type !== "Break" && (
                  <div><label className="text-[10px] font-bold text-gray-600">Subject</label><select value={classForm.subjectId} onChange={(e) => setClassForm({ ...classForm, subjectId: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required><option value="">Select subject</option>{subjects.filter((s) => String(s.course?._id || s.course) === String(classForm.courseId) && Number(s.semester) === Number(classForm.semester)).map((s) => <option key={s._id} value={s._id}>{s.subjectName} ({s.subjectCode})</option>)}</select></div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="text-[10px] font-bold text-gray-600">Teacher</label><select value={classForm.teacherId} onChange={(e) => setClassForm({ ...classForm, teacherId: e.target.value })} className="w-full border rounded-lg p-2 text-xs"><option value="">No teacher selected</option>{teachers.map((t) => <option key={t._id} value={t._id}>{t.name} ({t.id_no})</option>)}</select></div>
                  <div><label className="text-[10px] font-bold text-gray-600">Room</label><select value={classForm.roomId} onChange={(e) => setClassForm({ ...classForm, roomId: e.target.value })} className="w-full border rounded-lg p-2 text-xs"><option value="">No room selected</option>{classrooms.filter((r) => r.active).map((r) => <option key={r._id} value={r._id}>{r.roomCode} — {r.roomName}</option>)}</select></div>
                </div>

                <div><label className="text-[10px] font-bold text-gray-600">Notes</label><textarea value={classForm.notes} onChange={(e) => setClassForm({ ...classForm, notes: e.target.value })} className="w-full border rounded-lg p-2 text-xs" rows="3" maxLength="500" /></div>

                <div className="flex gap-2">
                  <button disabled={saving} type="submit" className="bg-orange-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-xs font-semibold">{saving ? "Saving…" : editingClass ? "Update Class" : "Add Class"}</button>
                  <button type="button" onClick={resetClassForm} className="bg-gray-100 px-4 py-2 rounded-lg text-xs font-semibold">Reset</button>
                </div>
              </form>

              <div className="border rounded-xl p-4">
                <h4 className="font-bold text-gray-800 mb-2">Conflict rules</h4>
                <div className="space-y-2 text-[11px] text-gray-600">
                  <div>✅ Student group overlap is blocked.</div>
                  <div>✅ Teacher double booking is blocked.</div>
                  <div>✅ Room double booking is blocked.</div>
                  <div>✅ End time must be after start time.</div>
                  <div>✅ Subject must match selected course + semester.</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "changes" && (
            <div className="space-y-5">
              <form onSubmit={handleSaveChange} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div><h4 className="font-bold text-gray-800">Publish Timetable Change</h4><p className="text-[10px] text-gray-500">Affected students/teachers are notified by the backend.</p></div>
                  <button type="button" onClick={resetChangeForm} className="text-xs text-gray-500">Reset</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div><label className="text-[10px] font-bold text-gray-600">Change Date</label><input type="date" value={changeForm.date} onChange={(e) => setChangeForm({ ...changeForm, date: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required /></div>
                  <div><label className="text-[10px] font-bold text-gray-600">Change Type</label><select value={changeForm.changeType} onChange={(e) => setChangeForm({ ...changeForm, changeType: e.target.value })} className="w-full border rounded-lg p-2 text-xs">{CHANGE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div>
                  <div className="md:col-span-2"><label className="text-[10px] font-bold text-gray-600">Original Class</label><select value={changeForm.entryId} onChange={(e) => {
                    const entry = entries.find((item) => String(item._id) === String(e.target.value));
                    setChangeForm({
                      ...changeForm,
                      entryId: e.target.value,
                      courseId: entry?.course?._id || entry?.course || changeForm.courseId,
                      semester: Number(entry?.semester || changeForm.semester),
                      division: entry?.division || changeForm.division,
                      subjectId: entry?.subject?._id || entry?.subject || changeForm.subjectId,
                    });
                  }} className="w-full border rounded-lg p-2 text-xs" disabled={changeForm.changeType === "Extra Class"}>
                    <option value="">Select existing class</option>
                    {entries.map((entry) => <option key={entry._id} value={entry._id}>{entry.dayOfWeek} {entry.startTime}-{entry.endTime} · {entry.subject?.subjectName || entry.type} · Sem {entry.semester} Div {entry.division}</option>)}
                  </select></div>
                </div>

                {changeForm.changeType === "Extra Class" && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-lg bg-orange-50 border border-orange-100 p-3">
                    <div><label className="text-[10px] font-bold text-gray-600">Course</label><select value={changeForm.courseId} onChange={(e) => setChangeForm({ ...changeForm, courseId: e.target.value, subjectId: "" })} className="w-full border rounded-lg p-2 text-xs"><option value="">Select course</option>{courses.map((c) => <option key={c._id} value={c._id}>{c.courseName}</option>)}</select></div>
                    <div><label className="text-[10px] font-bold text-gray-600">Semester</label><select value={changeForm.semester} onChange={(e) => setChangeForm({ ...changeForm, semester: Number(e.target.value), subjectId: "" })} className="w-full border rounded-lg p-2 text-xs">{[1,2,3,4,5,6,7,8,9,10].map((sem) => <option key={sem} value={sem}>{sem}</option>)}</select></div>
                    <div><label className="text-[10px] font-bold text-gray-600">Division</label><input value={changeForm.division} onChange={(e) => setChangeForm({ ...changeForm, division: e.target.value.toUpperCase() })} className="w-full border rounded-lg p-2 text-xs" /></div>
                    <div><label className="text-[10px] font-bold text-gray-600">Subject</label><select value={changeForm.subjectId} onChange={(e) => setChangeForm({ ...changeForm, subjectId: e.target.value })} className="w-full border rounded-lg p-2 text-xs"><option value="">Select subject</option>{subjects.filter((s) => String(s.course?._id || s.course) === String(changeForm.courseId) && Number(s.semester) === Number(changeForm.semester)).map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}</select></div>
                  </div>
                )}

                {(changeForm.changeType === "Time Change" || changeForm.changeType === "Extra Class") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label className="text-[10px] font-bold text-gray-600">New Start Time</label><input type="time" value={changeForm.newStartTime} onChange={(e) => setChangeForm({ ...changeForm, newStartTime: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required /></div><div><label className="text-[10px] font-bold text-gray-600">New End Time</label><input type="time" value={changeForm.newEndTime} onChange={(e) => setChangeForm({ ...changeForm, newEndTime: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required /></div></div>
                )}

                {(changeForm.changeType === "Teacher Change" || changeForm.changeType === "Other" || changeForm.changeType === "Extra Class") && (
                  <div><label className="text-[10px] font-bold text-gray-600">New / Replacement Teacher</label><select value={changeForm.newTeacher} onChange={(e) => setChangeForm({ ...changeForm, newTeacher: e.target.value })} className="w-full border rounded-lg p-2 text-xs"><option value="">Keep existing / select later</option>{teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></div>
                )}

                {(changeForm.changeType === "Room Change" || changeForm.changeType === "Other" || changeForm.changeType === "Extra Class") && (
                  <div><label className="text-[10px] font-bold text-gray-600">New / Replacement Room</label><select value={changeForm.newRoom} onChange={(e) => setChangeForm({ ...changeForm, newRoom: e.target.value })} className="w-full border rounded-lg p-2 text-xs"><option value="">Keep existing / select later</option>{classrooms.filter((r) => r.active).map((r) => <option key={r._id} value={r._id}>{r.roomCode} — {r.roomName}</option>)}</select></div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="text-[10px] font-bold text-gray-600">Student/Teacher Message</label><textarea value={changeForm.message} onChange={(e) => setChangeForm({ ...changeForm, message: e.target.value })} className="w-full border rounded-lg p-2 text-xs" rows="2" maxLength="500" placeholder="Example: DBMS moved to Lab-2." /></div>
                  <div><label className="text-[10px] font-bold text-gray-600">Reason</label><textarea value={changeForm.reason} onChange={(e) => setChangeForm({ ...changeForm, reason: e.target.value })} className="w-full border rounded-lg p-2 text-xs" rows="2" maxLength="300" placeholder="Example: Room maintenance." /></div>
                </div>
                <button disabled={saving} type="submit" className="bg-orange-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-xs font-semibold">{saving ? "Saving…" : "Publish Change & Notify"}</button>
              </form>

              <div className="border rounded-xl overflow-x-auto">
                <table className="min-w-[900px] w-full text-xs">
                  <thead className="bg-gray-100"><tr><th className="p-2 text-left">Date</th><th className="text-left">Type</th><th className="text-left">Class</th><th className="text-left">New Value</th><th className="text-left">Message</th><th /></tr></thead>
                  <tbody className="divide-y">
                    {changes.length === 0 ? <tr><td colSpan="6" className="p-6 text-center text-gray-400">No active changes.</td></tr> : changes.map((change) => (
                      <tr key={change._id}>
                        <td className="p-2 font-semibold">{new Date(change.date).toLocaleDateString()}</td>
                        <td>{change.changeType}</td>
                        <td>{change.entry ? `${change.entry.startTime}-${change.entry.endTime}` : "Extra Class"} · Sem {change.semester} · Div {change.division}</td>
                        <td>{change.newRoom?.roomCode || ""}{change.newTeacher?.name ? ` ${change.newTeacher.name}` : ""}{change.newStartTime ? ` ${change.newStartTime}-${change.newEndTime}` : ""}</td>
                        <td className="max-w-[260px] truncate">{change.message || change.reason || "—"}</td>
                        <td className="text-right pr-2"><button type="button" onClick={() => cancelChange(change._id)} className="bg-red-50 text-red-700 px-2 py-1 rounded">Cancel</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "rooms" && (
            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
              <form onSubmit={handleSaveRoom} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between"><h4 className="font-bold text-gray-800">{editingRoom ? "Edit Classroom" : "Add Classroom"}</h4>{editingRoom && <button type="button" onClick={() => { setRoomForm(emptyRoomForm()); setEditingRoom(false); }} className="text-xs text-gray-500">Cancel edit</button>}</div>
                <div><label className="text-[10px] font-bold text-gray-600">Room Code</label><input value={roomForm.roomCode} onChange={(e) => setRoomForm({ ...roomForm, roomCode: e.target.value.toUpperCase() })} className="w-full border rounded-lg p-2 text-xs" required /></div>
                <div><label className="text-[10px] font-bold text-gray-600">Room Name</label><input value={roomForm.roomName} onChange={(e) => setRoomForm({ ...roomForm, roomName: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required /></div>
                <div className="grid grid-cols-2 gap-3"><div><label className="text-[10px] font-bold text-gray-600">Building</label><input value={roomForm.building} onChange={(e) => setRoomForm({ ...roomForm, building: e.target.value })} className="w-full border rounded-lg p-2 text-xs" /></div><div><label className="text-[10px] font-bold text-gray-600">Floor</label><input type="number" min="0" value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: Number(e.target.value) })} className="w-full border rounded-lg p-2 text-xs" /></div></div>
                <div className="grid grid-cols-2 gap-3"><div><label className="text-[10px] font-bold text-gray-600">Room Type</label><select value={roomForm.roomType} onChange={(e) => setRoomForm({ ...roomForm, roomType: e.target.value })} className="w-full border rounded-lg p-2 text-xs"><option>Classroom</option><option>Computer Lab</option><option>Laboratory</option><option>Seminar Hall</option><option>Auditorium</option><option>Other</option></select></div><div><label className="text-[10px] font-bold text-gray-600">Capacity</label><input type="number" min="0" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })} className="w-full border rounded-lg p-2 text-xs" /></div></div>
                {editingRoom && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={roomForm.active} onChange={(e) => setRoomForm({ ...roomForm, active: e.target.checked })} /> Active classroom</label>}
                <button disabled={saving} type="submit" className="bg-orange-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-xs font-semibold">{saving ? "Saving…" : editingRoom ? "Update Classroom" : "Add Classroom"}</button>
              </form>

              <div className="border rounded-xl overflow-x-auto"><table className="min-w-[800px] w-full text-xs"><thead className="bg-gray-100"><tr><th className="p-2 text-left">Code</th><th className="text-left">Name</th><th className="text-left">Building</th><th className="text-left">Type</th><th className="text-left">Capacity</th><th className="text-left">Status</th><th /></tr></thead><tbody className="divide-y">{classrooms.map((room) => <tr key={room._id}><td className="p-2 font-semibold">{room.roomCode}</td><td>{room.roomName}</td><td>{room.building || "—"}</td><td>{room.roomType}</td><td>{room.capacity || "—"}</td><td><span className={`px-2 py-0.5 rounded-full font-semibold ${room.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{room.active ? "Active" : "Inactive"}</span></td><td className="text-right pr-2 space-x-1"><button type="button" onClick={() => editRoom(room)} className="bg-blue-50 text-blue-700 px-2 py-1 rounded">Edit</button><button type="button" onClick={() => deleteRoom(room._id)} className="bg-red-50 text-red-700 px-2 py-1 rounded">Delete</button></td></tr>)}</tbody></table></div>
            </div>
          )}

          {activeTab === "occupancy" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end border rounded-xl p-4">
                <div><label className="text-[10px] font-bold text-gray-600">Date</label><input type="date" value={occupancyDate} onChange={(e) => setOccupancyDate(e.target.value)} className="border rounded-lg p-2 text-xs" /></div>
                <button type="button" onClick={loadOccupancy} disabled={loading} className="bg-orange-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-xs font-semibold">Check Occupancy</button>
              </div>
              {occupancy && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{occupancy.rooms.map(({ room, occupied }) => <div key={room._id} className="border rounded-xl p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-gray-800">{room.roomCode}</div><div className="text-[10px] text-gray-500">{room.roomName} · {room.roomType}</div></div><span className={`text-[10px] px-2 py-1 rounded-full font-bold ${occupied.length ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{occupied.length ? `${occupied.length} booked` : "FREE"}</span></div><div className="mt-3 space-y-2">{occupied.length === 0 ? <div className="text-xs text-gray-400">No scheduled class in this room today.</div> : occupied.map((entry) => <div key={`${entry._id}-${entry.startTime}`} className="bg-gray-50 rounded-lg p-2"><div className="font-semibold text-xs">{entry.startTime} – {entry.endTime}</div><div className="text-[10px] text-gray-600">{entry.subject?.subjectName || entry.type}</div><div className="text-[10px] text-gray-500">{entry.course?.courseName || ""} · Sem {entry.semester} · Div {entry.division}</div><div className="text-[10px] text-gray-500">{entry.teacher?.name || "No teacher"}</div></div>)}</div></div>)}</div>}
              {!occupancy && <div className="text-center text-gray-400 py-12">Select a date and check occupancy.</div>}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t bg-gray-50 text-[10px] text-gray-500 flex items-center justify-between">
          <span>Timetable data is managed separately from the Academic Calendar.</span>
          <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-semibold">Close</button>
        </div>
      </div>
    </div>
  );
}
