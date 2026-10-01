import React, { useState, useEffect } from "react";
import axios from "axios";
import NotificationBell from "../components/NotificationBell";
import TeacherTimetablePanel from "../components/TeacherTimetablePanel";
import TeacherAttendanceReportPanel from "../components/TeacherAttendanceReportPanel";
import TeacherResultPanel from "../components/TeacherResultPanel";
import TeacherCounselingPanel from "../components/TeacherCounselingPanel";
import { useNavigate } from "react-router-dom";
import "../index.css";

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "{}"));
  const token = localStorage.getItem("token");

  // Dashboard Metrics & Lists
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalAssignments: 0,
    totalSubjects: 0,
    recentAssignments: [],
    studentList: [],
    subjects: [],
  });

  // Modal selector: null | "assignments" | "viewAssignment" | "submissionsList" | "subjects" | "attendance" | "attendanceHistory" | "profile" | "viewMaterials" | "manageQuizzes" | "createQuiz" | "quizResults"
  const [activeModal, setActiveModal] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showTeacherTimetable, setShowTeacherTimetable] = useState(false);
  const [showTeacherAttendanceReport, setShowTeacherAttendanceReport] = useState(false);
  const [showTeacherResults, setShowTeacherResults] = useState(false);
  const [showTeacherCounseling, setShowTeacherCounseling] = useState(false);

  // Submissions State
  const [submissionModalData, setSubmissionModalData] = useState(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // Study Materials State
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialSubject, setMaterialSubject] = useState("");
  const [materialFile, setMaterialFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [materialsList, setMaterialsList] = useState([]);
  const [materialSearch, setMaterialSearch] = useState("");

  // Assignment Creation State
  const [assignmentForm, setAssignmentForm] = useState({
    title: "",
    description: "",
    subject: "",
    dueDate: "",
  });
  const [assignmentPdf, setAssignmentPdf] = useState(null);
  const [publishing, setPublishing] = useState(false);

  // Attendance Form State
  const getTodayStr = () => new Date().toISOString().split("T")[0];
  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  };
  const [attendanceSubject, setAttendanceSubject] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(getTodayStr());
  const [attendanceRecords, setAttendanceRecords] = useState({});

  // Attendance History State
  const [historySubject, setHistorySubject] = useState("");
  const [historyMode, setHistoryMode] = useState("byDate");
  const [historyDate, setHistoryDate] = useState("");
  const [historyStudentId, setHistoryStudentId] = useState("");
  const [historyResults, setHistoryResults] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Quiz Management States
  const [teacherQuizzes, setTeacherQuizzes] = useState([]);
  const [quizResultsData, setQuizResultsData] = useState(null);
  const [loadingQuizResults, setLoadingQuizResults] = useState(false);
  const [quizForm, setQuizForm] = useState({
    title: "",
    subject: "",
    openDate: "",
    closeDate: "",
    timeLimitMinutes: 10,
    questions: [
      { questionText: "", options: ["", "", "", ""], correctAnswer: 0 }
    ],
  });

  // Faculty-controlled course tracker
  const [courseTrackers, setCourseTrackers] = useState([]);
  const [loadingCourseTrackers, setLoadingCourseTrackers] = useState(false);
  const [savingCourseProgress, setSavingCourseProgress] = useState(false);
  const [courseProgressDrafts, setCourseProgressDrafts] = useState({});
  const [teacherCalendarEvents, setTeacherCalendarEvents] = useState([]);
  const [profileView, setProfileView] = useState(true);
  const [loadingTeacherProfile, setLoadingTeacherProfile] = useState(false);

  // Profile Form State (Mandatory Password Verification)
  const [profileForm, setProfileForm] = useState({
    name: user.name || "",
    email: user.email || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const authConfig = {
    headers: { Authorization: `Bearer ${token}` },
  };

  // Helper: Filter students who belong specifically to a given subject's course & semester
  const getStudentsForSubject = (subjectId) => {
    if (!subjectId) return [];
    const targetSub = stats.subjects.find((s) => String(s._id) === String(subjectId));
    if (!targetSub) return stats.studentList;

    const courseName = (targetSub.course?.courseName || "").trim().toLowerCase();
    const courseCode = (targetSub.course?.courseCode || "").trim().toLowerCase();
    const targetSem = Number(targetSub.semester);

    return stats.studentList.filter((stu) => {
      const stuCourse = (stu.course || "").trim().toLowerCase();
      const stuSem = Number(stu.semester);
      const matchesCourse = stuCourse === courseName || stuCourse === courseCode;
      const matchesSem = targetSem ? stuSem === targetSem : true;
      return matchesCourse && matchesSem;
    });
  };

  // 1. Fetch Dashboard Analytics
  const fetchDashboardData = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/teacher/dashboard-stats", authConfig);
      const data = res.data;

      const sortedStudents = (data.studentList || []).sort((a, b) =>
        (a.id_no || "").localeCompare(b.id_no || "", undefined, { numeric: true, sensitivity: "base" })
      );

      setStats({
        totalStudents: data.totalStudents || 0,
        totalAssignments: data.totalAssignments || 0,
        totalSubjects: data.totalSubjects || 0,
        recentAssignments: data.recentAssignments || [],
        studentList: sortedStudents,
        subjects: data.subjects || [],
      });

      const initialSubId = data.subjects[0]?._id || "";
      if (initialSubId) {
        if (!assignmentForm.subject) setAssignmentForm((prev) => ({ ...prev, subject: initialSubId }));
        if (!materialSubject) setMaterialSubject(initialSubId);
        if (!attendanceSubject) setAttendanceSubject(initialSubId);
        if (!historySubject) setHistorySubject(initialSubId);
        if (!quizForm.subject) setQuizForm((prev) => ({ ...prev, subject: initialSubId }));

        const relevantStudents = sortedStudents.filter((stu) => {
          const sub = data.subjects[0];
          const cName = (sub.course?.courseName || "").toLowerCase();
          const cCode = (sub.course?.courseCode || "").toLowerCase();
          const sCourse = (stu.course || "").toLowerCase();
          return (sCourse === cName || sCourse === cCode) && Number(stu.semester) === Number(sub.semester);
        });

        const initialStatus = {};
        relevantStudents.forEach((s) => {
          initialStatus[s._id] = "present";
        });
        setAttendanceRecords(initialStatus);
      }
    } catch (err) {
      console.error("Dashboard Stats Fetch Error:", err);
    }
  };

  // 2. Fetch Study Materials
  const fetchMaterials = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/teacher/materials", authConfig);
      setMaterialsList(res.data || []);
    } catch (err) {
      console.error("Study Materials Fetch Error:", err);
    }
  };

  // 3. Fetch Quizzes for this Teacher
  const fetchTeacherQuizzes = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/teacher/quizzes", authConfig);
      setTeacherQuizzes(res.data || []);
    } catch (err) {
      console.error("Fetch Quizzes Error:", err);
    }
  };

  const fetchCourseTrackers = async () => {
    try {
      setLoadingCourseTrackers(true);
      const res = await axios.get("http://localhost:5000/api/teacher/course-trackers", authConfig);
      setCourseTrackers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Course Tracker Fetch Error:", err);
      alert(err.response?.data?.message || "Failed to load course trackers.");
    } finally {
      setLoadingCourseTrackers(false);
    }
  };

  const handleToggleCourseProgress = (tracker, unitIndex, subIndex) => {
  const subjectId = tracker.subject?._id;
  if (!subjectId) return;

  const subjectKey = String(subjectId);
  const currentValues =
    courseProgressDrafts[subjectKey] ||
    tracker.completedSubUnits ||
    [];

  const current = new Set(currentValues);

  const key = `${unitIndex}-${subIndex}`;

  if (current.has(key)) {
    current.delete(key);
  } else {
    current.add(key);
  }

  const completedSubUnits = Array.from(current);

  setCourseProgressDrafts((prev) => ({
    ...prev,
    [subjectKey]: completedSubUnits,
  }));

  setCourseTrackers((prev) =>
    prev.map((item) =>
      String(item.subject?._id) === subjectKey
        ? {
            ...item,
            completedSubUnits,
          }
        : item
    )
  );
};

const handleSaveCourseProgress = async (tracker) => {
  const subjectId = tracker.subject?._id;

  if (!subjectId) {
    alert("Invalid subject.");
    return;
  }

  const subjectKey = String(subjectId);

  const completedSubUnits =
    courseProgressDrafts[subjectKey] ??
    tracker.completedSubUnits ??
    [];

  try {
    setSavingCourseProgress(true);

    const res = await axios.put(
      `http://localhost:5000/api/teacher/course-trackers/${subjectId}/progress`,
      { completedSubUnits },
      authConfig
    );

    const saved = res.data.completedSubUnits || completedSubUnits;

    setCourseTrackers((prev) =>
      prev.map((item) =>
        String(item.subject?._id) === subjectKey
          ? {
              ...item,
              completedSubUnits: saved,
            }
          : item
      )
    );

    setCourseProgressDrafts((prev) => ({
      ...prev,
      [subjectKey]: saved,
    }));

    alert("Course progress updated successfully! ✅");
  } catch (err) {
    alert(
      err.response?.data?.message ||
        "Failed to update syllabus progress."
    );

    await fetchCourseTrackers();
  } finally {
    setSavingCourseProgress(false);
  }
};

    
  const fetchTeacherCalendarEvents = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/teacher/calendar-events", authConfig);
      setTeacherCalendarEvents(res.data || []);
    } catch (err) { console.error("Teacher Calendar Fetch Error:", err); }
  };

  const refreshTeacherProfile = async () => {
    try {
      setLoadingTeacherProfile(true);
      const res = await axios.get("http://localhost:5000/api/auth/me", authConfig);
      setUser(res.data);
      localStorage.setItem("user", JSON.stringify(res.data));
      setProfileForm((prev) => ({ ...prev, name: res.data.name || prev.name, email: res.data.email || prev.email }));
    } catch (err) { console.error("Teacher profile refresh error:", err); } finally { setLoadingTeacherProfile(false); }
  };

  useEffect(() => {
    if (!token || user.role !== "teacher") {
      navigate("/login/teacher");
      return;
    }
    fetchDashboardData();
    fetchMaterials();
    fetchTeacherQuizzes();
    fetchCourseTrackers();
    fetchTeacherCalendarEvents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync attendance list when subject changes
  const handleAttendanceSubjectChange = (newSubjectId) => {
    setAttendanceSubject(newSubjectId);
    const relevantStudents = getStudentsForSubject(newSubjectId);
    const updatedStatus = {};
    relevantStudents.forEach((s) => {
      updatedStatus[s._id] = "present";
    });
    setAttendanceRecords(updatedStatus);
  };

  // Study Material Upload
  const handleUploadMaterial = async (e) => {
    e.preventDefault();
    const title = materialTitle.trim();
    if (title.length < 3 || title.length > 150) {
      alert("Material title must be between 3 and 150 characters.");
      return;
    }
    if (title.length === 0 || !materialFile || !materialSubject) {
      alert("Validation Error: Title, Subject, and File are required.");
      return;
    }
    if (materialFile.size > 20 * 1024 * 1024) {
      alert("Material file must be 20 MB or smaller.");
      return;
    }

    const allowedTypes = [
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
    if (!allowedTypes.includes(materialFile.type)) {
      alert("Unsupported material file type.");
      return;
    }

    const formData = new FormData();
    formData.append("title", materialTitle.trim());
    formData.append("subjectId", materialSubject);
    formData.append("file", materialFile);

    try {
      setUploading(true);
      await axios.post("http://localhost:5000/api/teacher/upload-material", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      alert("Study Material uploaded successfully! 📄");
      setMaterialTitle("");
      setMaterialFile(null);
      const input = document.getElementById("teacherFileInput");
      if (input) input.value = "";
      fetchMaterials();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to upload study material");
    } finally {
      setUploading(false);
    }
  };

  // Delete Study Material
  const handleDeleteMaterial = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this material?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/teacher/materials/${id}`, authConfig);
      alert("Material removed successfully! 🗑️");
      fetchMaterials();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete material");
    }
  };

  // Publish Assignment
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    const title = assignmentForm.title.trim();
    const description = assignmentForm.description.trim();
    const due = new Date(assignmentForm.dueDate);

    if (title.length < 3 || title.length > 120) {
      alert("Assignment title must be between 3 and 120 characters.");
      return;
    }
    if (!assignmentForm.subject) {
      alert("Please select an allocated subject.");
      return;
    }
    if (!assignmentForm.dueDate || Number.isNaN(due.getTime()) || due <= new Date()) {
      alert("Please choose a future due date.");
      return;
    }
    if (description.length > 3000) {
      alert("Assignment instructions cannot exceed 3000 characters.");
      return;
    }
    if (!description && !assignmentPdf) {
      alert("Validation Error: Please provide instructions or attach a PDF/document.");
      return;
    }
    if (assignmentPdf && assignmentPdf.size > 20 * 1024 * 1024) {
      alert("Assignment file must be 20 MB or smaller.");
      return;
    }
    if (assignmentPdf) {
      const allowed = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
      ];
      if (!allowed.includes(assignmentPdf.type)) {
        alert("Only PDF, DOC, DOCX, PPT, PPTX or TXT files are allowed.");
        return;
      }
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("subject", assignmentForm.subject);
    formData.append("dueDate", assignmentForm.dueDate);
    formData.append("description", description);
    if (assignmentPdf) formData.append("file", assignmentPdf);

    try {
      setPublishing(true);
      await axios.post("http://localhost:5000/api/teacher/assignments", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      alert("Assignment published successfully! 📝");
      setAssignmentForm({
        title: "",
        description: "",
        subject: stats.subjects[0]?._id || "",
        dueDate: "",
      });
      setAssignmentPdf(null);
      const fIn = document.getElementById("assignmentPdfInput");
      if (fIn) fIn.value = "";
      setActiveModal(null);
      fetchDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to publish assignment");
    } finally {
      setPublishing(false);
    }
  };

  // View Submissions for an Assignment
  const handleOpenSubmissions = async (assignmentId) => {
    try {
      setLoadingSubmissions(true);
      setActiveModal("submissionsList");
      const res = await axios.get(
        `http://localhost:5000/api/teacher/assignments/${assignmentId}/submissions`,
        authConfig
      );
      setSubmissionModalData(res.data);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to load student submissions");
      setActiveModal(null);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Attendance Date Handling (Strict: No Sundays, No Past Dates)
  const handleAttendanceDateChange = (e) => {
    const chosen = e.target.value;
    if (!chosen) return;

    const [year, month, day] = chosen.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);

    if (dateObj.getDay() === 0) {
      alert("⚠️ Sundays are non-working days. Please pick Monday - Saturday.");
      setAttendanceDate("");
      return;
    }
    setAttendanceDate(chosen);
  };

  const handleSaveAttendance = async (e) => {
    e.preventDefault();
    if (!attendanceDate) {
      alert("Please choose a valid lecture date.");
      return;
    }

    const currentSubjectStudents = getStudentsForSubject(attendanceSubject);
    if (currentSubjectStudents.length === 0) {
      alert("No students enrolled in this subject's course track.");
      return;
    }

    const recordsPayload = currentSubjectStudents.map((stu) => ({
      student: stu._id,
      status: attendanceRecords[stu._id] || "present",
    }));

    try {
      await axios.post(
        "http://localhost:5000/api/teacher/attendance",
        { subjectId: attendanceSubject, date: attendanceDate, records: recordsPayload },
        authConfig
      );
      alert("Attendance registered successfully! ✅");
      setActiveModal(null);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save attendance sheet");
    }
  };

  // Query Attendance History
  const fetchAttendanceHistory = async () => {
    if (!historySubject) {
      alert("Please choose a subject first.");
      return;
    }

    let url = `http://localhost:5000/api/teacher/attendance/history?subjectId=${historySubject}`;
    if (historyMode === "byDate") {
      if (!historyDate) {
        alert("Please select a date to review.");
        return;
      }
      url += `&date=${historyDate}`;
    } else {
      if (!historyStudentId) {
        alert("Please select a student to review.");
        return;
      }
      url += `&studentId=${historyStudentId}`;
    }

    try {
      setLoadingHistory(true);
      const res = await axios.get(url, authConfig);
      setHistoryResults(res.data);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to load attendance history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Quiz Form Handlers
  const handleAddQuestionToForm = () => {
    if (quizForm.questions.length >= 100) {
      alert("A quiz can contain at most 100 questions.");
      return;
    }
    setQuizForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        { questionText: "", options: ["", "", "", ""], correctAnswer: 0 },
      ],
    }));
  };

  const handleRemoveQuestionFromForm = (qIndex) => {
    if (quizForm.questions.length === 1) {
      alert("A quiz must contain at least one question.");
      return;
    }
    setQuizForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, index) => index !== qIndex),
    }));
  };

  const handleQuestionChange = (qIndex, field, value) => {
    const updated = [...quizForm.questions];
    updated[qIndex][field] = value;
    setQuizForm((prev) => ({ ...prev, questions: updated }));
  };

  const handleOptionChange = (qIndex, optIndex, value) => {
    const updated = [...quizForm.questions];
    updated[qIndex].options[optIndex] = value;
    setQuizForm((prev) => ({ ...prev, questions: updated }));
  };

  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    const title = quizForm.title.trim();
    const openDate = new Date(quizForm.openDate || new Date());
    const closeDate = new Date(quizForm.closeDate);

    if (title.length < 3 || title.length > 150) {
      alert("Quiz title must be between 3 and 150 characters.");
      return;
    }
    if (!quizForm.subject) {
      alert("Please select an allocated subject.");
      return;
    }
    if (!quizForm.closeDate || Number.isNaN(closeDate.getTime()) || closeDate <= openDate) {
      alert("Quiz close date/time must be after the open date/time.");
      return;
    }
    const time = Number(quizForm.timeLimitMinutes);
    if (!Number.isInteger(time) || time < 1 || time > 180) {
      alert("Time limit must be between 1 and 180 minutes.");
      return;
    }
    if (!Array.isArray(quizForm.questions) || quizForm.questions.length < 1) {
      alert("At least one question is required.");
      return;
    }
    for (let i = 0; i < quizForm.questions.length; i += 1) {
      const q = quizForm.questions[i];
      if (q.questionText.trim().length < 3 || q.questionText.trim().length > 500) {
        alert(`Question ${i + 1} must be 3–500 characters.`);
        return;
      }
      if (!q.options.every((option) => option.trim().length >= 1 && option.trim().length <= 200)) {
        alert(`All options for Question ${i + 1} must be filled (max 200 characters each).`);
        return;
      }
      if (!Number.isInteger(Number(q.correctAnswer)) || Number(q.correctAnswer) < 0 || Number(q.correctAnswer) > 3) {
        alert(`Please choose the correct answer for Question ${i + 1}.`);
        return;
      }
    }

    try {
      await axios.post("http://localhost:5000/api/teacher/quizzes", {
        ...quizForm,
        title,
        timeLimitMinutes: time,
        questions: quizForm.questions.map((q) => ({
          ...q,
          questionText: q.questionText.trim(),
          options: q.options.map((option) => option.trim()),
          correctAnswer: Number(q.correctAnswer),
        })),
      }, authConfig);
      alert("Quiz created and scheduled successfully! 🎯");
      setQuizForm({
        title: "",
        subject: stats.subjects[0]?._id || "",
        openDate: "",
        closeDate: "",
        timeLimitMinutes: 10,
        questions: [{ questionText: "", options: ["", "", "", ""], correctAnswer: 0 }],
      });
      setActiveModal("manageQuizzes");
      fetchTeacherQuizzes();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to create quiz.");
    }
  };

  const handleViewQuizResults = async (quizId) => {
    try {
      setLoadingQuizResults(true);
      setActiveModal("quizResults");
      const res = await axios.get(`http://localhost:5000/api/teacher/quizzes/${quizId}/results`, authConfig);
      setQuizResultsData(res.data);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to load results");
    } finally {
      setLoadingQuizResults(false);
    }
  };

  // Profile Update Handler
  const handleUpdateProfile = async (e) => {
    e.preventDefault();

    const email = profileForm.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Validation Error: Please enter a valid email address.");
      return;
    }

    if (profileForm.newPassword) {
      if (!profileForm.currentPassword) {
        alert("Current password is required to change your password.");
        return;
      }
      if (profileForm.newPassword.length < 6 || profileForm.newPassword.length > 100) {
        alert("New password must be 6–100 characters.");
        return;
      }
      if (profileForm.newPassword !== profileForm.newPassword.trim()) {
        alert("Password cannot start or end with spaces.");
        return;
      }
      if (profileForm.newPassword !== profileForm.confirmPassword) {
        alert("New password and confirm password do not match.");
        return;
      }
    }

    try {
      const res = await axios.put(
        "http://localhost:5000/api/auth/update-profile",
        {
          email,
          currentPassword: profileForm.currentPassword,
          newPassword: profileForm.newPassword,
        },
        authConfig
      );
      alert(res.data.message || "Profile and password updated successfully! ✨");
      setProfileView(true);
      const updatedUser = { ...user, name: res.data.user.name, email: res.data.user.email };
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setProfileForm((prev) => ({ ...prev, currentPassword: "", newPassword: "", confirmPassword: "" }));
      setActiveModal(null);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update profile");
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login/teacher");
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* SIDEBAR */}
      <aside className="w-72 shrink-0 bg-gradient-to-b from-purple-800 via-purple-700 to-purple-600 text-white shadow-2xl flex h-screen flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/10 px-4 py-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-2xl shadow-inner">🎓</div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-extrabold tracking-tight">CampusCore</h2>
                <p className="text-[11px] font-medium text-purple-100/90">Faculty Workspace</p>
              </div>
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-purple-100/60">Faculty Menu</p>
            <div className="space-y-1.5 text-sm">
              <button type="button" onClick={() => setActiveModal(null)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === null && !showTeacherTimetable && !showTeacherAttendanceReport && !showTeacherResults && !showTeacherCounseling ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${activeModal === null && !showTeacherTimetable && !showTeacherAttendanceReport && !showTeacherResults && !showTeacherCounseling ? "bg-purple-100" : "bg-white/10"}`}>🏠</span><span>Dashboard</span>
              </button>
              <button type="button" onClick={() => setActiveModal("subjects")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "subjects" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📚</span><span>My Subjects</span>
              </button>
              <button type="button" onClick={() => { const subId = stats.subjects[0]?._id || ""; handleAttendanceSubjectChange(subId); setActiveModal("attendance"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "attendance" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">✅</span><span>Mark Attendance</span>
              </button>
              <button type="button" onClick={() => { setHistorySubject(stats.subjects[0]?._id || ""); setHistoryResults(null); setActiveModal("attendanceHistory"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "attendanceHistory" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🗂️</span><span>Attendance History</span>
              </button>
              <button type="button" onClick={() => setActiveModal("assignments")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "assignments" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📝</span><span>Assignments</span>
              </button>
              <button type="button" onClick={() => { fetchTeacherQuizzes(); setActiveModal("manageQuizzes"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "manageQuizzes" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🎯</span><span>Quizzes</span>
              </button>
              <button type="button" onClick={() => { fetchCourseTrackers(); setActiveModal("courseProgress"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "courseProgress" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📘</span><span>Course Progress</span>
              </button>
              <button type="button" onClick={() => { fetchMaterials(); setActiveModal("viewMaterials"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "viewMaterials" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📚</span><span>Study Materials</span>
              </button>
              <button type="button" onClick={() => { fetchTeacherCalendarEvents(); setActiveModal("teacherCalendar"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "teacherCalendar" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📅</span><span>Academic Calendar</span>
              </button>
              <button type="button" onClick={() => setShowTeacherTimetable(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showTeacherTimetable ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🗓️</span><span>My Timetable</span>
              </button>
              <button type="button" onClick={() => setShowTeacherAttendanceReport(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showTeacherAttendanceReport ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📊</span><span>Attendance Report</span>
              </button>
              <button type="button" onClick={() => setShowTeacherResults(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showTeacherResults ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📑</span><span>Result &amp; CEC Entry</span>
              </button>
              <button type="button" onClick={() => setShowTeacherCounseling(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showTeacherCounseling ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🧑‍🏫</span><span>Counseling Appointments</span>
              </button>
            </div>
          </nav>
        </div>

        <div className="border-t border-white/10 bg-black/10 px-4 pb-4 pt-4">
          <button type="button" onClick={async () => { setProfileView(true); setActiveModal("profile"); await refreshTeacherProfile(); }} className={`mb-2 group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition-all duration-200 ${activeModal === "profile" ? "bg-white text-purple-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">⚙️</span><span>Profile Settings</span>
          </button>
          <button type="button" onClick={handleLogout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 py-3 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:bg-red-500/90 hover:shadow-xl"><span>↪</span><span>Sign Out</span></button>
        </div>
      </aside>
      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOPBAR */}
        <div className="bg-white p-4 px-8 flex justify-between items-center shadow-sm border-b">
          <h1 className="text-xl font-bold text-gray-800">Faculty Workspace</h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div
              onClick={async () => { setProfileView(true); setActiveModal("profile"); await refreshTeacherProfile(); }}
              className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition"
            >
              <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm overflow-hidden">
                {user?.profilePhoto ? <img src={`http://localhost:5000${user.profilePhoto}`} alt="Profile" className="w-full h-full object-cover" /> : (user?.name ? user.name.charAt(0).toUpperCase() : "T")}
              </div>
            <div>
              <span className="font-semibold text-gray-700 block text-sm">{user?.name || "Teacher"}</span>
                <span className="text-[11px] text-gray-400 block -mt-1">ID: {user?.id_no} • Settings</span>
              </div>
            </div>
          </div>
        </div>

        {/* WORKSPACE METRICS & MODULES */}
        <div className="p-5 overflow-y-auto space-y-6">
          {/* STATS ROW */}
          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-white p-5 rounded-xl shadow border border-gray-100">
              <h3 className="text-gray-500 text-sm font-medium">My Students</h3>
              <h1 className="text-2xl font-bold text-blue-600 mt-2">{stats.totalStudents}</h1>
              <p className="text-xs text-gray-400 mt-1">Enrolled in your subject tracks</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow border border-gray-100">
              <h3 className="text-gray-500 text-sm font-medium">Assignments</h3>
              <h1 className="text-2xl font-bold text-green-600 mt-2">{stats.totalAssignments}</h1>
              <p className="text-xs text-gray-400 mt-1">Total published tasks</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow border border-gray-100">
              <h3 className="text-gray-500 text-sm font-medium">Allocated Subjects</h3>
              <h1 className="text-2xl font-bold text-purple-600 mt-2">{stats.totalSubjects}</h1>
              <p className="text-xs text-gray-400 mt-1">Assigned by Administration</p>
            </div>
          </div>

          {/* TWO MAIN CARDS: RECENT ASSIGNMENTS & UPLOAD MATERIAL */}
          <div className="grid md:grid-cols-2 gap-5">
            {/* Recent Assignments Card */}
            <div className="bg-white p-5 rounded-xl shadow border border-gray-100 flex flex-col justify-between">
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">Recent Assignments</h2>
                {stats.recentAssignments.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No assignments published yet.</p>
                ) : (
                  stats.recentAssignments.map((item) => (
                    <div
                      key={item._id}
                      className="flex justify-between items-center mb-3 p-2.5 border rounded-lg hover:bg-gray-50 transition"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.title}</p>
                        <p className="text-xs text-gray-400">
                          {item.subject?.subjectName} ({item.subject?.subjectCode})
                          {item.fileUrl && <span className="ml-1 text-purple-600 font-semibold">• [PDF]</span>}
                        </p>
                        <p className="text-[11px] text-red-500 font-medium">
                          Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "No deadline"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedAssignment(item);
                            setActiveModal("viewAssignment");
                          }}
                          className="text-gray-500 text-xs font-semibold hover:underline"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => handleOpenSubmissions(item._id)}
                          className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold px-2.5 py-1 rounded border border-blue-200 transition"
                        >
                          Submissions 📥
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => setActiveModal("assignments")}
                className="mt-3 w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 font-medium transition text-sm"
              >
                + Create New Assignment
              </button>
            </div>

            {/* Upload Material Card */}
            <div className="bg-white p-5 rounded-xl shadow border border-gray-100 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold text-gray-800">Upload Study Material</h2>
                  <button
                    type="button"
                    onClick={() => {
                      fetchMaterials();
                      setActiveModal("viewMaterials");
                    }}
                    className="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold px-2.5 py-1 rounded-md transition"
                  >
                    📂 View Materials ({materialsList.length})
                  </button>
                </div>
                <form onSubmit={handleUploadMaterial} className="space-y-3">
                  <input
                    required
                    type="text"
                    placeholder="Material Title (e.g. Unit 1 Notes)"
                    value={materialTitle}
                    onChange={(e) => setMaterialTitle(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <select
                    required
                    value={materialSubject}
                    onChange={(e) => setMaterialSubject(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    <option value="">-- Choose Subject --</option>
                    {stats.subjects.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.subjectName} ({s.subjectCode}) - Sem {s.semester}
                      </option>
                    ))}
                  </select>
                  <input
                    id="teacherFileInput"
                    required
                    type="file"
                    onChange={(e) => setMaterialFile(e.target.files[0])}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-purple-50 file:text-purple-700 file:font-semibold"
                  />
                  <button
                    type="submit"
                    disabled={uploading}
                    className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 font-medium transition disabled:opacity-50 text-sm"
                  >
                    {uploading ? "Uploading..." : "Upload Material"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow border border-gray-100">
            <div className="flex justify-between items-center gap-3">
              <div>
                <h2 className="font-semibold text-gray-800">Syllabus / Course Progress</h2>
                <p className="text-xs text-gray-400 mt-1">Mark topics completed as you teach them. Students see this progress as read-only.</p>
              </div>
              <button
                type="button"
                onClick={() => { fetchCourseTrackers(); setActiveModal("courseProgress"); }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-xs font-semibold"
              >
                📘 Update Progress
              </button>
            </div>
          </div>

          {/* STRICT SUBJECT-FILTERED STUDENT DIRECTORY */}
          <div className="bg-white p-5 rounded-xl shadow border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-semibold text-gray-800">
                  Enrolled Students In Your Allocated Course Tracks ({stats.studentList.length})
                </h2>
                <p className="text-xs text-gray-400">
                  Only students registered in the exact degree and semester of your subjects
                </p>
              </div>
            </div>

            <table className="w-full text-sm text-center">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-2.5 text-left pl-4">Name</th>
                  <th>ID</th>
                  <th>Course Track</th>
                  <th>Semester</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.studentList.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-gray-400 text-sm">
                      No students are currently enrolled in your allocated course tracks.
                    </td>
                  </tr>
                ) : (
                  stats.studentList.map((stu) => (
                    <tr key={stu._id} className="border-b hover:bg-gray-50">
                      <td className="p-2.5 font-medium text-gray-800 text-left pl-4">{stu.name}</td>
                      <td className="text-gray-600 font-mono font-semibold">{stu.id_no}</td>
                      <td className="text-gray-600">{stu.course || "General"}</td>
                      <td className="text-gray-600">Sem {stu.semester || 1}</td>
                      <td>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            stu.status === false ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                          }`}
                        >
                          {stu.status === false ? "Inactive" : "Active"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. MARK ATTENDANCE MODAL */}
      {activeModal === "attendance" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Mark Attendance</h3>
                <p className="text-xs text-gray-500">
                  Showing students enrolled in the selected subject track only
                </p>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <form onSubmit={handleSaveAttendance} className="flex-1 flex flex-col overflow-hidden">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Select Subject</label>
                  <select
                    required
                    value={attendanceSubject}
                    onChange={(e) => handleAttendanceSubjectChange(e.target.value)}
                    className="w-full border rounded-lg p-2 text-sm outline-none bg-white focus:ring-2 focus:ring-purple-500"
                  >
                    {stats.subjects.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.subjectName} ({s.subjectCode}) - Sem {s.semester}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Lecture Date</label>
                  <input
                    type="date"
                    required
                    min={getTodayStr()}
                    value={attendanceDate}
                    onChange={handleAttendanceDateChange}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="overflow-y-auto flex-1 border rounded-lg p-2 mb-4 divide-y">
                {(() => {
                  const currentStudents = getStudentsForSubject(attendanceSubject);
                  if (currentStudents.length === 0) {
                    return (
                      <p className="text-center py-6 text-gray-400 text-sm">
                        No students enrolled in this subject's course track.
                      </p>
                    );
                  }

                  return currentStudents.map((s) => {
                    const isPresent = attendanceRecords[s._id] === "present";
                    return (
                      <div key={s._id} className="py-2 px-3 flex justify-between items-center hover:bg-gray-50">
                        <div>
                          <p className="font-semibold text-sm text-gray-800">{s.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{s.id_no} • Sem {s.semester}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAttendanceRecords((prev) => ({
                              ...prev,
                              [s._id]: prev[s._id] === "present" ? "absent" : "present",
                            }))
                          }
                          className={`text-xs font-bold px-3 py-1.5 rounded-full transition ${
                            isPresent ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {isPresent ? "Present ✓" : "Absent ✗"}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>

              <button
                type="submit"
                disabled={!attendanceDate || getStudentsForSubject(attendanceSubject).length === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-50"
              >
                Save Attendance Sheet
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. ATTENDANCE HISTORY MODAL */}
      {activeModal === "attendanceHistory" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Attendance Register History</h3>
                <p className="text-xs text-gray-500">Query historical records by Lecture Date or Student</p>
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setHistoryResults(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">Subject</label>
                <select
                  value={historySubject}
                  onChange={(e) => {
                    setHistorySubject(e.target.value);
                    setHistoryStudentId("");
                    setHistoryResults(null);
                  }}
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {stats.subjects.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.subjectName} ({s.subjectCode}) - Sem {s.semester}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">Filter By</label>
                <select
                  value={historyMode}
                  onChange={(e) => {
                    setHistoryMode(e.target.value);
                    setHistoryResults(null);
                  }}
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="byDate">📅 Specific Date</option>
                  <option value="byStudent">👤 Specific Student</option>
                </select>
              </div>

              <div>
                {historyMode === "byDate" ? (
                  <>
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">Lecture Date</label>
                    <input
                      type="date"
                      value={historyDate}
                      onChange={(e) => setHistoryDate(e.target.value)}
                      className="w-full border rounded-lg p-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </>
                ) : (
                  <>
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">Choose Student</label>
                    <select
                      value={historyStudentId}
                      onChange={(e) => setHistoryStudentId(e.target.value)}
                      className="w-full border rounded-lg p-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Select Student --</option>
                      {getStudentsForSubject(historySubject).map((stu) => (
                        <option key={stu._id} value={stu._id}>
                          {stu.name} ({stu.id_no})
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={fetchAttendanceHistory}
                  disabled={loadingHistory}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg text-xs transition shadow disabled:opacity-50"
                >
                  {loadingHistory ? "Querying..." : "View Records"}
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 border rounded-lg p-2">
              {loadingHistory ? (
                <p className="text-center py-8 text-gray-400 text-xs">Loading database records...</p>
              ) : !historyResults ? (
                <div className="text-center py-10 text-gray-400 text-xs">
                  Select criteria and click <span className="font-semibold text-purple-700">View Records</span> to fetch history.
                </div>
              ) : historyResults.type === "byDate" ? (
                historyResults.records.length === 0 ? (
                  <p className="text-center py-8 text-gray-400 text-xs">
                    No attendance was taken on {historyResults.date} for this subject.
                  </p>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 text-gray-700 uppercase">
                      <tr>
                        <th className="p-2.5">Student Name</th>
                        <th>Roll / ID</th>
                        <th>Course Track</th>
                        <th className="text-right pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historyResults.records.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="p-2.5 font-semibold text-gray-800">{r.student?.name || "Student"}</td>
                          <td className="text-gray-600 font-mono">{r.student?.id_no}</td>
                          <td className="text-gray-500">{r.student?.course || "General"}</td>
                          <td className="text-right pr-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                r.status === "present"
                                  ? "bg-green-100 text-green-700 border border-green-200"
                                  : "bg-red-100 text-red-700 border border-red-200"
                              }`}
                            >
                              {r.status === "present" ? "Present ✓" : "Absent ✗"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : historyResults.history.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-xs">
                  No attendance logs found for this student in this subject.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-purple-50 p-2.5 rounded-lg border border-purple-100 mb-2">
                    <span className="text-xs font-bold text-purple-900">
                      Total Recorded Lectures: {historyResults.history.length}
                    </span>
                    <span className="text-xs font-bold text-green-700">
                      Attended: {historyResults.history.filter((h) => h.status === "present").length} (
                      {Math.round(
                        (historyResults.history.filter((h) => h.status === "present").length /
                          historyResults.history.length) *
                          100
                      )}
                      %)
                    </span>
                  </div>

                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 text-gray-700 uppercase">
                      <tr>
                        <th className="p-2.5">Lecture Date</th>
                        <th>Day</th>
                        <th className="text-right pr-4">Recorded Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historyResults.history.map((h, idx) => {
                        const d = new Date(h.date);
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-2.5 font-semibold text-gray-800">{d.toLocaleDateString()}</td>
                            <td className="text-gray-500">
                              {d.toLocaleDateString("en-US", { weekday: "long" })}
                            </td>
                            <td className="text-right pr-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                  h.status === "present"
                                    ? "bg-green-100 text-green-700 border border-green-200"
                                    : "bg-red-100 text-red-700 border border-red-200"
                                }`}
                              >
                                {h.status === "present" ? "Present ✓" : "Absent ✗"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. PUBLISH ASSIGNMENT MODAL */}
      {activeModal === "assignments" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Publish Assignment</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <form onSubmit={handleCreateAssignment} className="space-y-3 overflow-y-auto pr-1">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Assignment Title</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Unit 2 Case Study"
                  value={assignmentForm.title}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Subject</label>
                <select
                  required
                  value={assignmentForm.subject}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, subject: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="">-- Choose Subject --</option>
                  {stats.subjects.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.subjectName} ({s.subjectCode}) - Sem {s.semester}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Upload Date</label>
                <input type="text" value="Automatically recorded on Publish" readOnly className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
                <p className="text-[10px] text-gray-400 mt-1">The exact upload timestamp is saved automatically.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Due / End Date</label>
                <input
                  required
                  type="date"
                  min={getTodayStr()}
                  value={assignmentForm.dueDate}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Instructions / Description</label>
                <textarea
                  rows="3"
                  placeholder="Write problem statement or requirements..."
                  value={assignmentForm.description}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Attach Document / PDF (Optional)</label>
                <input
                  id="assignmentPdfInput"
                  type="file"
                  onChange={(e) => setAssignmentPdf(e.target.files[0])}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-purple-50 file:text-purple-700 file:font-semibold"
                />
              </div>
              <button
                type="submit"
                disabled={publishing}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg text-sm transition mt-2 disabled:opacity-50"
              >
                {publishing ? "Publishing..." : "Publish Assignment"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. VIEW ASSIGNMENT DETAILS MODAL */}
      {activeModal === "viewAssignment" && selectedAssignment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-gray-800">{selectedAssignment.title}</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="text-sm space-y-3 text-gray-600">
              <p><span className="font-semibold text-gray-700">Subject:</span> {selectedAssignment.subject?.subjectName} ({selectedAssignment.subject?.subjectCode})</p>
              <p><span className="font-semibold text-gray-700">Upload Date:</span> {new Date(selectedAssignment.publishDate || selectedAssignment.createdAt).toLocaleString()}</p>
              <p><span className="font-semibold text-gray-700">Due / End Date:</span> {new Date(selectedAssignment.dueDate).toLocaleString()}</p>
              {selectedAssignment.description && (
                <div className="pt-2 border-t text-gray-700">
                  <span className="font-semibold text-xs text-gray-500 uppercase">Instructions</span>
                  <p className="mt-1 text-xs bg-gray-50 p-2.5 rounded border border-gray-100 whitespace-pre-line">
                    {selectedAssignment.description}
                  </p>
                </div>
              )}
              {selectedAssignment.fileUrl && (
                <div className="pt-2 border-t">
                  <span className="font-semibold text-xs text-gray-500 uppercase block mb-1.5">Attached Question File</span>
                  <a
                    href={`http://localhost:5000${selectedAssignment.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 px-3 py-2 rounded-lg hover:bg-purple-100 font-semibold transition"
                  >
                    📄 Open / Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. STUDENT SUBMISSIONS MODAL */}
      {activeModal === "submissionsList" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Student Submissions</h3>
                {submissionModalData?.assignment && (
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">{submissionModalData.assignment.title}</span> • Due Date:{" "}
                    <span className="text-red-600 font-medium">
                      {new Date(submissionModalData.assignment.dueDate).toLocaleDateString()}
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setSubmissionModalData(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 border rounded-lg p-2">
              {loadingSubmissions ? (
                <p className="text-center py-8 text-gray-400 text-sm">Fetching student submissions...</p>
              ) : !submissionModalData?.submissions || submissionModalData.submissions.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">No submissions recorded for this assignment yet.</p>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 text-gray-700 uppercase">
                    <tr>
                      <th className="p-2.5">Student</th>
                      <th>Roll No</th>
                      <th>Submitted At</th>
                      <th>Status</th>
                      <th className="text-right pr-4">File</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {submissionModalData.submissions.map((sub) => {
                      const submitDate = new Date(sub.submittedAt || sub.createdAt);
                      const dueDate = new Date(submissionModalData.assignment.dueDate);
                      dueDate.setHours(23, 59, 59, 999);
                      const isLate = submitDate > dueDate;

                      return (
                        <tr key={sub._id} className="hover:bg-gray-50">
                          <td className="p-2.5 font-semibold text-gray-800">{sub.student?.name || "Unknown"}</td>
                          <td className="text-gray-600 font-mono">{sub.student?.id_no}</td>
                          <td className="text-gray-500">
                            {submitDate.toLocaleDateString()} at{" "}
                            {submitDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td>
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                isLate
                                  ? "bg-red-100 text-red-700 border border-red-200"
                                  : "bg-green-100 text-green-700 border border-green-200"
                              }`}
                            >
                              {isLate ? "⚠️ Late Submission" : "✓ On Time"}
                            </span>
                          </td>
                          <td className="text-right pr-4">
                            {sub.fileUrl ? (
                              <a
                                href={`http://localhost:5000${sub.fileUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 font-semibold px-2.5 py-1 rounded text-[11px] transition inline-block"
                              >
                                📄 View PDF
                              </a>
                            ) : (
                              <span className="text-gray-400 italic">No document</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. TEACHER MANAGE QUIZZES MODAL */}
      {activeModal === "manageQuizzes" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">My Subject Quizzes</h3>
                <p className="text-xs text-gray-500">Create timed, anti-cheat MCQ tests for your assigned classes</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (stats.subjects.length === 0) {
                      alert("You have no allocated subjects to create quizzes for.");
                      return;
                    }
                    setQuizForm({
                      title: "",
                      subject: stats.subjects[0]._id,
                      openDate: "",
                      closeDate: "",
                      timeLimitMinutes: 10,
                      questions: [{ questionText: "", options: ["", "", "", ""], correctAnswer: 0 }],
                    });
                    setActiveModal("createQuiz");
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
                >
                  + Create New Quiz
                </button>
                <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 divide-y border rounded-lg p-2">
              {teacherQuizzes.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">No quizzes published for your subjects yet.</p>
              ) : (
                teacherQuizzes.map((q) => (
                  <div key={q._id} className="py-3 px-3 flex justify-between items-center hover:bg-gray-50">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{q.title}</p>
                      <p className="text-xs text-gray-500">
                        Subject: <span className="font-semibold text-purple-700">{q.subject?.subjectName} ({q.subject?.subjectCode})</span>
                        {" • "}{q.questions?.length} MCQs • ⏱️ {q.timeLimitMinutes} Mins • Open: {new Date(q.openDate || q.createdAt).toLocaleString()} • Close: {new Date(q.closeDate || q.dueDate).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleViewQuizResults(q._id)}
                      className="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 font-bold px-3 py-1.5 rounded-lg transition"
                    >
                      View Scores 📊
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. CREATE MCQ QUIZ MODAL (STRICTLY ALLOCATED SUBJECTS) */}
      {activeModal === "createQuiz" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Create Subject MCQ Quiz</h3>
                <p className="text-[11px] text-gray-500">Anti-cheat tab monitoring and countdown timer automatically enforced</p>
              </div>
              <button onClick={() => setActiveModal("manageQuizzes")} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateQuiz} className="overflow-y-auto flex-1 pr-1 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Quiz Title</label>
                  <input
                    required
                    type="text"
                    minLength="3"
                    maxLength="150"
                    placeholder="e.g. Unit 1 Objective Assessment"
                    value={quizForm.title}
                    onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Your Allocated Subject</label>
                  <select
                    required
                    value={quizForm.subject}
                    onChange={(e) => setQuizForm({ ...quizForm, subject: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {stats.subjects.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.subjectName} ({s.subjectCode}) - Sem {s.semester}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Open Date & Time</label>
                  <input
                    required
                    type="datetime-local"
                    value={quizForm.openDate}
                    onChange={(e) => setQuizForm({ ...quizForm, openDate: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Close Date & Time</label>
                  <input
                    required
                    type="datetime-local"
                    value={quizForm.closeDate}
                    onChange={(e) => setQuizForm({ ...quizForm, closeDate: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Time Limit (Minutes)</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="120"
                    value={quizForm.timeLimitMinutes}
                    onChange={(e) => setQuizForm({ ...quizForm, timeLimitMinutes: Number(e.target.value) })}
                    className="w-full border rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* QUESTIONS BUILDER */}
              <div className="space-y-4 pt-2 border-t">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs uppercase text-gray-700">MCQ Questions ({quizForm.questions.length})</h4>
                  <button
                    type="button"
                    onClick={handleAddQuestionToForm}
                    className="text-xs text-purple-600 hover:underline font-bold"
                  >
                    + Add Another Question
                  </button>
                </div>

                {quizForm.questions.map((q, qIndex) => (
                  <div key={qIndex} className="p-3 border rounded-lg bg-gray-50 space-y-2.5">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs font-bold text-gray-600">Question {qIndex + 1}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-gray-400">Choose the correct option</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestionFromForm(qIndex)}
                          className="text-[11px] font-bold text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <input
                      required
                      type="text"
                      minLength="3"
                      maxLength="500"
                      placeholder="Enter question statement..."
                      value={q.questionText}
                      onChange={(e) => handleQuestionChange(qIndex, "questionText", e.target.value)}
                      className="w-full border rounded-lg p-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500 font-semibold"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((opt, optIndex) => (
                        <div key={optIndex} className="flex items-center gap-2 bg-white p-1.5 rounded border">
                          <input
                            type="radio"
                            name={`correct-${qIndex}`}
                            checked={q.correctAnswer === optIndex}
                            onChange={() => handleQuestionChange(qIndex, "correctAnswer", optIndex)}
                            className="text-purple-600"
                            title="Select as correct option"
                          />
                          <input
                            required
                            type="text"
                            maxLength="200"
                            placeholder={`Option ${optIndex + 1}`}
                            value={opt}
                            onChange={(e) => handleOptionChange(qIndex, optIndex, e.target.value)}
                            className="w-full text-xs outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition shadow"
              >
                Publish Quiz
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 8. VIEW QUIZ SCORES & CHEAT ATTEMPTS */}
      {activeModal === "quizResults" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Quiz Evaluation Results</h3>
                <p className="text-xs text-gray-500">{quizResultsData?.quiz?.title}</p>
              </div>
              <button onClick={() => setActiveModal("manageQuizzes")} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 border rounded-lg p-2">
              {loadingQuizResults ? (
                <p className="text-center py-6 text-gray-400 text-xs">Loading performance records...</p>
              ) : !quizResultsData?.attempts || quizResultsData.attempts.length === 0 ? (
                <p className="text-center py-6 text-gray-400 text-xs">No students have taken this quiz yet.</p>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 text-gray-700 uppercase">
                    <tr>
                      <th className="p-2.5">Student</th>
                      <th>Roll No</th>
                      <th>Score</th>
                      <th>Submission Status</th>
                      <th className="text-right pr-4">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {quizResultsData.attempts.map((att) => (
                      <tr key={att._id} className="hover:bg-gray-50">
                        <td className="p-2.5 font-semibold text-gray-800">{att.student?.name}</td>
                        <td className="text-gray-600 font-mono">{att.student?.id_no}</td>
                        <td className="font-bold text-purple-700">{att.score} / {att.totalQuestions}</td>
                        <td>
                          {att.submissionReason === "tab_switch" ? (
                            <span className="text-[11px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                              ⚠️ Terminated (Tab Switch)
                            </span>
                          ) : att.submissionReason === "timeout" ? (
                            <span className="text-[11px] bg-yellow-100 text-yellow-700 font-bold px-2 py-0.5 rounded-full">
                              ⏱️ Auto (Time Up)
                            </span>
                          ) : (
                            <span className="text-[11px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
                              ✓ Normal Finish
                            </span>
                          )}
                        </td>
                        <td className="text-right pr-4 font-bold text-gray-800">
                          {Math.round((att.score / att.totalQuestions) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 9. VIEW STUDY MATERIALS MODAL */}
      {activeModal === "viewMaterials" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Uploaded Study Materials</h3>
                <p className="text-xs text-gray-500">Live database materials uploaded for your students</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <input
              type="text"
              placeholder="🔍 Search materials..."
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 mb-3"
            />
            <div className="overflow-y-auto flex-1 divide-y border rounded-lg p-2">
              {materialsList.filter((m) => m.title?.toLowerCase().includes(materialSearch.toLowerCase())).length === 0 ? (
                <p className="text-center py-6 text-gray-400 text-sm">No study materials found.</p>
              ) : (
                materialsList
                  .filter((m) => m.title?.toLowerCase().includes(materialSearch.toLowerCase()))
                  .map((m) => (
                    <div key={m._id} className="py-3 px-3 flex justify-between items-center hover:bg-gray-50">
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{m.title}</p>
                        <p className="text-xs text-gray-500">
                          Subject: <span className="font-medium text-purple-700">{m.subject?.subjectName} ({m.subject?.subjectCode})</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`http://localhost:5000${m.fileUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs bg-purple-50 text-purple-700 font-semibold px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-100 transition"
                        >
                          📄 Open File
                        </a>
                        <button
                          onClick={() => handleDeleteMaterial(m._id)}
                          className="text-xs bg-red-50 text-red-600 font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-100 transition"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 10. MY SUBJECTS MODAL */}
      {activeModal === "courseProgress" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full p-6 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📘 Course Progress</h3>
                <p className="text-xs text-gray-500 mt-1">Update completed syllabus topics for your allocated subjects.</p>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            {loadingCourseTrackers ? (
              <p className="text-sm text-gray-400 text-center py-8">Loading course progress...</p>
            ) : courseTrackers.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-xl bg-gray-50">
                <p className="font-semibold text-gray-700">No subjects are assigned to you.</p>
                <p className="text-xs text-gray-500 mt-1">Ask Admin to assign a subject first.</p>
              </div>
            ) : (
              <div className="overflow-y-auto space-y-5 pr-1">
                {courseTrackers.map((tracker) => {
                  const total = (tracker.units || []).reduce((sum, unit) => sum + (unit.subUnits || []).length, 0);
const subjectKey = String(tracker.subject?._id || "");

const currentCompleted =
  courseProgressDrafts[subjectKey] ??
  tracker.completedSubUnits ??
  [];

const done = currentCompleted.length;                  const pct = total ? Math.round((done / total) * 100) : 0;
                  const published = tracker.published;

                  return (
                    <div key={tracker.subject?._id} className="border rounded-2xl p-4">
                      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
                        <div>
                          <p className="font-bold text-gray-800">{tracker.subject?.subjectName}</p>
                          <p className="text-[11px] text-gray-500">{tracker.subject?.subjectCode} • Sem {tracker.subject?.semester} • {done}/{total} completed</p>
                        </div>
                        <div className="flex items-center gap-2">
  <span
    className={`text-[10px] font-bold px-2 py-1 rounded-full ${
      published
        ? "bg-green-100 text-green-700"
        : "bg-gray-100 text-gray-500"
    }`}
  >
    {published ? "Published" : "Draft"}
  </span>

  <span className="text-sm font-bold text-purple-700">
    {pct}%
  </span>

  {published && (
    <button
      type="button"
      onClick={() => handleSaveCourseProgress(tracker)}
      disabled={savingCourseProgress}
      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50"
    >
      {savingCourseProgress ? "Saving..." : "Save Progress"}
    </button>
  )}
</div>
                      </div>
                      {!published ? (
                        <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-xs text-yellow-800">Admin has not published the tracker for this subject yet.</div>
                      ) : tracker.units.length === 0 ? (
                        <div className="p-3 rounded-lg bg-gray-50 border text-xs text-gray-500">No units have been added.</div>
                      ) : (
                        <>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4"><div className="h-full bg-purple-600" style={{ width: `${pct}%` }} /></div>
                          <div className="space-y-4">
                            {tracker.units.map((unit, unitIndex) => {
                              const unitTotal = (unit.subUnits || []).length;
const unitDone = (unit.subUnits || []).filter(
  (_, subIndex) =>
    currentCompleted.includes(`${unitIndex}-${subIndex}`)
).length;                              return (
                                <div key={unit._id || `${unit.title}-${unitIndex}`} className="rounded-xl bg-gray-50 border p-3">
                                  <div className="flex justify-between items-center mb-2">
                                    <p className="text-sm font-bold text-gray-800">Unit {unitIndex + 1}: {unit.title}</p>
                                    <span className="text-[10px] font-semibold text-gray-500">{unitDone}/{unitTotal}</span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {(unit.subUnits || []).map((subUnit, subIndex) => {
                                      const key = `${unitIndex}-${subIndex}`;
                                      const checked = currentCompleted.includes(key);
                                      return (
                                        <label key={subUnit._id || key} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer ${checked ? "bg-green-50 border-green-200" : "bg-white border-gray-200 hover:bg-gray-50"}`}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleToggleCourseProgress(tracker, unitIndex, subIndex)}
                                            disabled={savingCourseProgress}
                                            className="w-4 h-4 accent-green-600"
                                          />
                                          <span className={`text-xs flex-1 ${checked ? "text-green-800 line-through" : "text-gray-700"}`}>{subUnit.title}</span>
                                          <span className={`text-[10px] font-semibold ${checked ? "text-green-700" : "text-gray-400"}`}>{checked ? "Completed" : "Pending"}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeModal === "subjects" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">My Allocated Subjects</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {stats.subjects.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No subjects allocated yet by Administrator.</p>
              ) : (
                stats.subjects.map((sub) => (
                  <div key={sub._id} className="p-3 border rounded-lg bg-gray-50 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{sub.subjectName}</p>
                      <p className="text-xs text-gray-500">Code: {sub.subjectCode} • Sem {sub.semester}</p>
                    </div>
                    <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-1 rounded">
                      {sub.course?.courseName || "General"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 11. PROFILE & MANDATORY PASSWORD MODAL */}
      {activeModal === "profile" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center border-b px-6 py-4">
              <div><h3 className="text-lg font-bold text-gray-800">{profileView ? "My Profile" : "Edit Faculty Profile"}</h3><p className="text-xs text-gray-500 mt-1">{profileView ? "View your faculty account information." : "Update your email or change your password."}</p></div>
              <button type="button" onClick={() => { setActiveModal(null); setProfileView(true); }} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="flex flex-col items-center pt-6">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-purple-100 bg-gray-100 flex items-center justify-center text-2xl font-bold text-purple-700">
                {user?.profilePhoto ? <img src={`http://localhost:5000${user.profilePhoto}`} alt="Faculty profile" className="w-full h-full object-cover" /> : (user?.name ? user.name.charAt(0).toUpperCase() : "T")}
              </div>
              <p className="font-bold text-gray-800 mt-3">{user?.name || "Faculty"}</p>
              <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full mt-1">Teacher</span>
            </div>

            {profileView ? (
              <div className="p-6 space-y-3">
                {[['FACULTY ID', user?.id_no], ['FULL NAME', user?.name], ['EMAIL', user?.email], ['DEPARTMENT / PROGRAM', user?.department || 'General']].map(([label,value]) => <div key={label}><p className="text-[11px] font-bold text-gray-500 mb-1">{label}</p><div className="bg-gray-50 rounded-lg p-3 text-sm font-medium text-gray-700">{value || "—"}</div></div>)}
                <button type="button" onClick={() => setProfileView(false)} className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold mt-2">✏️ Edit Profile</button>
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="p-6 space-y-3">
                <div><label className="text-xs font-semibold text-gray-600 block mb-1">Faculty ID</label><input disabled value={user?.id_no || ""} className="w-full border rounded-lg p-2.5 text-sm bg-gray-100 text-gray-500" /></div>
                <div><label className="text-xs font-semibold text-gray-600 block mb-1">Full Name</label><input readOnly value={profileForm.name} className="w-full border rounded-lg p-2.5 text-sm bg-gray-100 text-gray-500" /></div>
                <div><label className="text-xs font-semibold text-gray-600 block mb-1">Email Address *</label><input required type="email" maxLength="160" value={profileForm.email} onChange={(e)=>setProfileForm({...profileForm,email:e.target.value})} className="w-full border rounded-lg p-2.5 text-sm" /></div>
                <div className="pt-3 border-t space-y-2"><p className="text-xs font-bold text-gray-700 uppercase">Password</p><input type="password" placeholder="Current password (only when changing)" value={profileForm.currentPassword} onChange={(e)=>setProfileForm({...profileForm,currentPassword:e.target.value})} className="w-full border rounded-lg p-2.5 text-sm"/><input type="password" minLength="6" maxLength="100" placeholder="New password (optional)" value={profileForm.newPassword} onChange={(e)=>setProfileForm({...profileForm,newPassword:e.target.value})} className="w-full border rounded-lg p-2.5 text-sm"/><input type="password" minLength="6" maxLength="100" placeholder="Confirm new password" value={profileForm.confirmPassword} onChange={(e)=>setProfileForm({...profileForm,confirmPassword:e.target.value})} className="w-full border rounded-lg p-2.5 text-sm"/></div>
                <div className="grid grid-cols-2 gap-2 pt-2"><button type="button" onClick={()=>setProfileView(true)} className="py-2.5 border rounded-lg font-semibold">Cancel</button><button type="submit" disabled={loadingTeacherProfile} className="py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-semibold">{loadingTeacherProfile ? "Saving..." : "Save Changes"}</button></div>
              </form>
            )}
          </div>
        </div>
      )}

      {activeModal === "teacherCalendar" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📅 Faculty Academic Calendar</h3>
                <p className="text-xs text-gray-500 mt-1">Automatically generated from your assignments, quizzes and admin campus notices.</p>
              </div>
              <button onClick={()=>setActiveModal(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 mb-4 text-xs text-blue-800">No manual event entry is required. Assignment upload/due dates and quiz open/close dates appear here automatically.</div>
            <div className="overflow-y-auto border rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b"><tr><th className="p-3 text-left">Date & Time</th><th className="p-3 text-left">Event</th><th className="p-3 text-left">Subject</th><th className="p-3 text-left">Type</th></tr></thead>
                <tbody className="divide-y">
                  {teacherCalendarEvents.length===0 ? <tr><td colSpan="4" className="p-8 text-center text-gray-400">No automatic calendar entries yet.</td></tr> : teacherCalendarEvents.map((ev)=><tr key={ev._id}><td className="p-3 font-semibold">{new Date(ev.date).toLocaleString()}</td><td className="p-3">{ev.title}</td><td className="p-3">{ev.subject?.subjectName || "Campus"}</td><td className="p-3"><span className="px-2 py-1 rounded-full bg-purple-50 text-purple-700 font-semibold">{ev.category}</span></td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showTeacherTimetable && (
        <TeacherTimetablePanel
          onClose={() => setShowTeacherTimetable(false)}
        />
      )}

      {showTeacherAttendanceReport && (
        <TeacherAttendanceReportPanel
          subjects={stats.subjects}
          onClose={() => setShowTeacherAttendanceReport(false)}
        />
      )}

      {showTeacherCounseling && (
        <TeacherCounselingPanel
          onClose={() => setShowTeacherCounseling(false)}
        />
      )}

      {showTeacherResults && (
        <TeacherResultPanel
          subjects={stats.subjects}
          onClose={() => setShowTeacherResults(false)}
        />
      )}

    </div>
  );
}