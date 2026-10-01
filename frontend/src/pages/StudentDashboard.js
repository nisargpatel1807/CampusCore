import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import NotificationBell from "../components/NotificationBell";
import StudentHelpdeskPanel from "../components/StudentHelpdeskPanel";
import StudentTimetablePanel from "../components/StudentTimetablePanel";
import StudentAttendancePanel from "../components/StudentAttendancePanel";
import StudentResultPanel from "../components/StudentResultPanel";
import StudentCounselingPanel from "../components/StudentCounselingPanel";
import { useNavigate, useLocation } from "react-router-dom";
import "../index.css";

const STUDENT_API = "http://localhost:5000/api/student";
const ATTENDANCE_MIN_PERCENT = 80;

const SERVICE_CATEGORIES = [
  "Projector Issue",
  "Computer Breakdown",
  "Fan / AC Problem",
  "Classroom Light",
  "Washroom Maintenance",
  "Wi-Fi Connectivity",
];

const formatShortDate = (dateLike) => {
  if (!dateLike) return "—";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const getStartOfMonth = (year, month) => new Date(year, month, 1);

const getCalendarCells = (year, month) => {
  const firstDay = getStartOfMonth(year, month).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - firstDay + 1;
    return dayNumber >= 1 && dayNumber <= daysInMonth ? dayNumber : null;
  });
};

const calendarKey = (dateLike) => {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem("user") || "{}"),
  );
  const token = localStorage.getItem("token");

  // Student Analytics & Core Data
  const [data, setData] = useState({
    studentInfo: {
      name: "",
      id_no: "",
      course: "",
      semester: 1,
      year: "1st Year",
      email: "",
      profilePhoto: "",
    },
    coursesCount: 0,
    mySubjects: [],
    pendingCount: 0,
    pendingAssignments: [],
    materials: [],
    attendance: {
      overallPct: 100,
      attended: 0,
      missed: 0,
      total: 0,
      breakdown: [],
    },
  });

  // Modal State Selector
  const [activeModal, setActiveModal] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  useEffect(() => {
  const handleEscape = (e) => {
    if (e.key === "Escape" && activeModal === "profile") {
      setActiveModal(null);
      setIsEditingProfile(false);
      setShowPasswordFields(false);
    }
  };

  document.addEventListener("keydown", handleEscape);

  return () => {
    document.removeEventListener("keydown", handleEscape);
  };
}, [activeModal]);

  // Turn In Assignment Form
  const [submittingAssignment, setSubmittingAssignment] = useState(null);
  const [turnInFile, setTurnInFile] = useState(null);
  const [turnInNotes, setTurnInNotes] = useState("");
  const [uploadingSubmission, setUploadingSubmission] = useState(false);

  // Quiz States
  const [studentQuizzes, setStudentQuizzes] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [quizTimerSeconds, setQuizTimerSeconds] = useState(0);

  // Service Request Helpdesk State
  const [myServiceRequests, setMyServiceRequests] = useState([]);
  const [serviceForm, setServiceForm] = useState({
    category: "Projector Issue",
    location: "",
    description: "",
    confirmGenuine: false,
  });
  const [servicePhotos, setServicePhotos] = useState([]);
  const [submittingService, setSubmittingService] = useState(false);

  // Smart Calendar State
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarFilter, setCalendarFilter] = useState("ALL");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null);
  const now = new Date();
  const [calendarCursor, setCalendarCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [materialFilter, setMaterialFilter] = useState("ALL");
  const [courseTrackers, setCourseTrackers] = useState([]);
  const [loadingCourseTracker, setLoadingCourseTracker] = useState(false);
  const [campusNotices, setCampusNotices] = useState([]);
  const [selectedCampusNotice, setSelectedCampusNotice] = useState(null);
  const [loadingCampusNotices, setLoadingCampusNotices] = useState(false);
  const [showStudentTimetable, setShowStudentTimetable] = useState(false);
  const [showStudentAttendance, setShowStudentAttendance] = useState(false);
  const [showStudentResults, setShowStudentResults] = useState(false);
  const [showStudentCounseling, setShowStudentCounseling] = useState(false);

  // Profile Form State
  const [showPasswordFields, setShowPasswordFields] = useState(false);
 
  const [profileForm, setProfileForm] = useState({
  name: user?.name || "",
  email: user?.email || "",
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  // Fetch Dashboard Stats
  const fetchStudentDashboard = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/student/dashboard-data",
        authConfig,
      );
      setData(res.data);

if (res.data.studentInfo) {
  const updatedStudentUser = {
    ...user,
    name: res.data.studentInfo.name || user?.name || "",
    id_no: res.data.studentInfo.id_no || user?.id_no || "",
    email: res.data.studentInfo.email || user?.email || "",
    role: res.data.studentInfo.role || user?.role || "student",
    profilePhoto:
      res.data.studentInfo.profilePhoto ||
      user?.profilePhoto ||
      "",
  };

  setUser(updatedStudentUser);
  localStorage.setItem("user", JSON.stringify(updatedStudentUser));

  setProfileForm((prev) => ({
    ...prev,
    name: res.data.studentInfo.name || prev.name,
    email: res.data.studentInfo.email || prev.email,
  }));
}
      if (res.data.studentInfo) {
        setProfileForm((prev) => ({
          ...prev,
          name: res.data.studentInfo.name || prev.name,
          email: res.data.studentInfo.email || prev.email,
        }));
      }
    } catch (err) {
      console.error("Failed to load student data:", err);
    }
  };

  // Fetch Available Quizzes
  const fetchStudentQuizzes = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/student/quizzes",
        authConfig,
      );
      setStudentQuizzes(res.data || []);
    } catch (err) {
      console.error("Failed to load student quizzes:", err);
    }
  };

  // Fetch Service Requests
  const fetchMyServiceRequests = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/student/service-requests",
        authConfig,
      );
      setMyServiceRequests(res.data || []);
    } catch (err) {
      console.error("Error fetching service requests:", err);
    }
  };

  // Fetch Calendar Events
  const fetchCalendarEvents = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/student/calendar-events",
        authConfig,
      );
      setCalendarEvents(res.data || []);
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    }
  };

  const fetchCourseTrackers = async () => {
    try {
      setLoadingCourseTracker(true);
      const res = await axios.get(`${STUDENT_API}/course-tracker`, authConfig);
      setCourseTrackers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load course tracker:", err);
      setCourseTrackers([]);
    } finally {
      setLoadingCourseTracker(false);
    }
  };

  const fetchCampusNotices = async () => {
    try {
      setLoadingCampusNotices(true);
      const res = await axios.get(
        "http://localhost:5000/api/campus-notices/student",
        authConfig
      );
      setCampusNotices(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load campus notices:", err);
      setCampusNotices([]);
    } finally {
      setLoadingCampusNotices(false);
    }
  };

  useEffect(() => {
    if (!token || user.role !== "student") {
      navigate("/login/student");
      return;
    }
    fetchStudentDashboard();
    fetchStudentQuizzes();
    fetchMyServiceRequests();
    fetchCalendarEvents();
    fetchCourseTrackers();
    fetchCampusNotices();
    // These functions intentionally run once on mount for the logged-in student.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const open = params.get("open");
    if (!open) return;

    const map = {
      assignments: "assignments",
      materials: "materials",
      quizzes: "studentQuizzes",
      calendar: "smartCalendar",
      helpdesk: "servicePortal",
      attendance: "attendance",
      courseTracker: "courseTracker",
      notices: "campusNotices",
    };

    if (!map[open]) return;

    if (open === "calendar") {
      fetchCalendarEvents();
      setActiveModal("smartCalendar");
      return;
    }

    if (open === "helpdesk") {
      fetchMyServiceRequests();
      setActiveModal("servicePortal");
      return;
    }

    if (open === "quizzes") {
      fetchStudentQuizzes();
      setActiveModal("studentQuizzes");
      return;
    }

    if (open === "courseTracker") {
      fetchCourseTrackers();
      setActiveModal("courseTracker");
      return;
    }

    if (open === "notices") {
      const noticeId = params.get("noticeId");
      fetchCampusNotices().then((notices) => {
        if (noticeId) {
          const selected = notices.find(
            (notice) => String(notice._id) === String(noticeId)
          );
          setSelectedCampusNotice(selected || null);
        } else {
          setSelectedCampusNotice(null);
        }
        setActiveModal("campusNotices");
      });
      return;
    }

    setActiveModal(map[open]);
  }, [location.search]);

  // Submit Assignment PDF
  const handleTurnInSubmit = async (e) => {
    e.preventDefault();

    if (!submittingAssignment) {
      alert("Please select an assignment first.");
      return;
    }

    if (!turnInFile) {
      alert("Validation Error: Please select a PDF solution file.");
      return;
    }

    if (turnInFile.type !== "application/pdf") {
      alert("Only PDF files are allowed for assignment submission.");
      return;
    }

    if (turnInFile.size > 10 * 1024 * 1024) {
      alert("The submission PDF must be smaller than 10 MB.");
      return;
    }

    if (turnInNotes.trim().length > 1000) {
      alert("Submission notes cannot exceed 1000 characters.");
      return;
    }

    const formData = new FormData();
    formData.append("file", turnInFile);
    formData.append("notes", turnInNotes.trim());

    try {
      setUploadingSubmission(true);
      const response = await axios.post(
        `${STUDENT_API}/assignments/${submittingAssignment._id}/submit`,
        formData,
        {
          headers: {
            ...authConfig.headers,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      alert(response.data.message || "Assignment submitted successfully!");
      setTurnInFile(null);
      setTurnInNotes("");
      setSubmittingAssignment(null);
      setActiveModal(null);
      await fetchStudentDashboard();
    } catch (err) {
      if (err.response?.status === 409) {
        alert(err.response.data.message || "This assignment is already submitted.");
      } else {
        alert(err.response?.data?.message || "Failed to submit assignment.");
      }
    } finally {
      setUploadingSubmission(false);
    }
  };

  // Submit Service Request Ticket
  const handleServiceSubmit = async (e) => {
    e.preventDefault();

    const location = serviceForm.location.trim();
    const description = serviceForm.description.trim();

    if (!SERVICE_CATEGORIES.includes(serviceForm.category)) {
      alert("Please select a valid issue category.");
      return;
    }

    if (location.length < 2 || location.length > 100) {
      alert("Location / room number must be between 2 and 100 characters.");
      return;
    }

    if (description.length < 10 || description.length > 1000) {
      alert("Description must be between 10 and 1000 characters.");
      return;
    }

    if (!serviceForm.confirmGenuine) {
      alert("Please confirm that this complaint is genuine before submitting.");
      return;
    }

    if (servicePhotos.length > 3) {
      alert("You can attach a maximum of 3 photos.");
      return;
    }

    for (const photo of servicePhotos) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
        alert("Complaint photos must be JPG, PNG or WEBP.");
        return;
      }
      if (photo.size > 5 * 1024 * 1024) {
        alert("Each complaint photo must be smaller than 5 MB.");
        return;
      }
    }

    const formData = new FormData();
    formData.append("category", serviceForm.category);
    formData.append("location", location);
    formData.append("description", description);
    servicePhotos.forEach((photo) => formData.append("photos", photo));

    try {
      setSubmittingService(true);
      const response = await axios.post(
        `${STUDENT_API}/service-requests`,
        formData,
        {
          headers: {
            ...authConfig.headers,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      alert(response.data.message || "Complaint registered successfully. 🛠️");
      setServiceForm({
        category: "Projector Issue",
        location: "",
        description: "",
        confirmGenuine: false,
      });
      setServicePhotos([]);
      setActiveModal("servicePortal");
      await fetchMyServiceRequests();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to submit request.");
    } finally {
      setSubmittingService(false);
    }
  };


  // Quiz Execution Handlers
  const handleStartQuiz = (quiz) => {
    if (quiz.hasAttempted) {
      alert("You have already completed this quiz.");
      return;
    }

    if (quiz.isNotOpen) {
      alert(`This quiz opens on ${new Date(quiz.openDate || quiz.createdAt).toLocaleString()}.`);
      return;
    }
    if (quiz.isExpired) {
      alert("This quiz is already closed.");
      return;
    }

    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      alert("This quiz has no questions available.");
      return;
    }

    const safeMinutes = Number(quiz.timeLimitMinutes);
    const minutes = Number.isInteger(safeMinutes) && safeMinutes >= 1 && safeMinutes <= 180
      ? safeMinutes
      : 10;

    setActiveQuiz(quiz);
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setQuizTimerSeconds(minutes * 60);
    setActiveModal("takeQuiz");
  };

  const handleSelectAnswer = (qIndex, optionIndex) => {
    setSelectedAnswers((prev) => ({ ...prev, [qIndex]: optionIndex }));
  };

  const handleSubmitQuizAttempt = async (reason = "normal") => {
    if (!activeQuiz) return;

    if (reason === "normal") {
      const answeredCount = Object.keys(selectedAnswers).length;
      if (answeredCount < activeQuiz.questions.length) {
        const confirmed = window.confirm(
          `You answered ${answeredCount} of ${activeQuiz.questions.length} questions. Submit anyway?`,
        );
        if (!confirmed) return;
      }
    }

    const answersPayload = activeQuiz.questions.map((_, idx) =>
      selectedAnswers[idx] !== undefined ? selectedAnswers[idx] : -1,
    );

    try {
      const res = await axios.post(
        `http://localhost:5000/api/student/quizzes/${activeQuiz._id}/submit`,
        { userAnswers: answersPayload, reason },
        authConfig,
      );
      alert(res.data.message || "Quiz submitted!");
      setActiveModal(null);
      setActiveQuiz(null);
      fetchStudentDashboard();
      fetchStudentQuizzes();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to submit quiz.");
    }
  };

  // Countdown Timer Effect
  useEffect(() => {
    let interval = null;
    if (activeModal === "takeQuiz" && quizTimerSeconds > 0) {
      interval = setInterval(() => {
        setQuizTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (activeModal === "takeQuiz" && quizTimerSeconds === 0) {
      handleSubmitQuizAttempt("timeout");
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModal, quizTimerSeconds]);

  // Anti-Cheat: Submit on real tab visibility change.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        activeModal === "takeQuiz" &&
        document.visibilityState === "hidden"
      ) {
        alert(
          "🚨 Tab switch detected. Your quiz will be submitted automatically."
        );
        handleSubmitQuizAttempt("tab_switch");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModal, activeQuiz, selectedAnswers]);

  // Profile & Password Update
 
  const handleUpdateProfile = async (e) => {
  e.preventDefault();

  const email = profileForm.email.trim().toLowerCase();
  if (!email) {
  alert("Email address is required.");
  return;
}

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    alert("Please enter a valid email address.");
    return;
  }

  if (profileForm.newPassword && !profileForm.currentPassword.trim()) {
    alert("Current password is required to change your password.");
    return;
  }

  if (
    profileForm.newPassword &&
    profileForm.newPassword.trim().length < 6
  ) {
    alert("New password must be at least 6 characters long.");
    return;
  }

  if (
    profileForm.newPassword &&
    profileForm.newPassword.trim() ===
      profileForm.currentPassword.trim()
  ) {
    alert("New password must be different from your current password.");
    return;
  }

  if (
    profileForm.newPassword &&
    profileForm.newPassword !== profileForm.confirmPassword
  ) {
    alert("New password and confirm password do not match.");
    return;
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

    alert(res.data.message || "Profile updated successfully!");

    const updatedUser = {
      ...user,
      name: res.data.user.name,
      email: res.data.user.email,
    };

    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));

    setProfileForm((prev) => ({
      ...prev,
      name: res.data.user.name,
      email: res.data.user.email,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    }));

    setShowPasswordFields(false);
    setIsEditingProfile(false);
  } catch (err) {
    alert(
      err.response?.data?.message ||
        "Failed to update profile."
    );
  }
};

  const materialsBySubject = useMemo(() => {
    const map = new Map();
    data.materials.forEach((material) => {
      const id = material.subject?._id || material.subject?.subjectCode || "unknown";
      map.set(String(id), material.subject?.subjectName || "Other");
    });
    return Array.from(map.entries());
  }, [data.materials]);

  const filteredMaterials = useMemo(() => {
    if (materialFilter === "ALL") return data.materials;
    return data.materials.filter((material) =>
      String(material.subject?._id || "") === String(materialFilter)
    );
  }, [data.materials, materialFilter]);

  const filteredCalendarEvents = useMemo(() => {
    return calendarEvents.filter((event) =>
      calendarFilter === "ALL" || event.category === calendarFilter
    );
  }, [calendarEvents, calendarFilter]);

  const calendarCells = useMemo(
    () => getCalendarCells(calendarCursor.getFullYear(), calendarCursor.getMonth()),
    [calendarCursor],
  );

  const trackerSummary = useMemo(() => {
    const totals = courseTrackers.reduce(
      (acc, tracker) => {
        (tracker.units || []).forEach((unit) => {
          acc.total += (unit.subUnits || []).length;
        });
        acc.completed += (tracker.completedSubUnits || []).length;
        return acc;
      },
      { total: 0, completed: 0 },
    );
    return {
      ...totals,
      percent: totals.total ? Math.round((totals.completed / totals.total) * 100) : 0,
    };
  }, [courseTrackers]);

  const calendarMonthName = calendarCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const calendarEventsByDay = useMemo(() => {
    const map = new Map();
    filteredCalendarEvents.forEach((event) => {
      const key = calendarKey(event.date);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    });
    return map;
  }, [filteredCalendarEvents]);

  const changeCalendarMonth = (offset) => {
    setCalendarCursor(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
    setSelectedCalendarDate(null);
    setSelectedCalendarEvent(null);
  };

  const getCalendarEventClass = (event) => {
    const category = String(event?.category || "").toLowerCase();

    if (category.includes("holiday")) {
      return "bg-red-50 text-red-700 border-red-200";
    }
    if (category.includes("assignment deadline")) {
      return "bg-blue-50 text-blue-800 border-blue-200";
    }
    if (category.includes("assignment open")) {
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    }
    if (category.includes("quiz open")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    if (category.includes("quiz close")) {
      return "bg-rose-50 text-rose-800 border-rose-200";
    }
    if (category.includes("exam")) {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    return "bg-purple-50 text-purple-800 border-purple-200";
  };

  const handleCalendarDayClick = (dayNumber) => {
    if (!dayNumber) return;

    const key = `${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    setSelectedCalendarDate(key);
    setSelectedCalendarEvent(null);
  };

  const handleCalendarEventClick = (event) => {
    const id = String(event?._id || "");
    const category = String(event?.category || "").toLowerCase();

    // Automatic assignment calendar entries.
    if (id.startsWith("assignment-open-") || id.startsWith("assignment-close-")) {
      setSelectedCalendarDate(null);
      setSelectedCalendarEvent(null);
      setActiveModal("assignments");
      return;
    }

    // Automatic quiz calendar entries.
    if (id.startsWith("quiz-open-") || id.startsWith("quiz-close-")) {
      setSelectedCalendarDate(null);
      setSelectedCalendarEvent(null);
      fetchStudentQuizzes();
      setActiveModal("studentQuizzes");
      return;
    }

    // A linked campus notice can open its notice directly when metadata is present.
    if (event?.noticeId) {
      const notice = campusNotices.find(
        (item) => String(item._id) === String(event.noticeId),
      );
      if (notice) {
        setSelectedCampusNotice(notice);
        setSelectedCalendarDate(null);
        setSelectedCalendarEvent(null);
        setActiveModal("campusNotices");
        return;
      }
    }

    // Manual/admin events stay in the calendar and open a full event-detail view.
    // This is intentional for events such as Holiday, Internal/External Exam,
    // Seminar, Sports Event, Hackathon or Other.
    if (category) {
      setSelectedCalendarEvent(event);
    }
  };

  const selectedDayEvents = selectedCalendarDate
    ? calendarEventsByDay.get(selectedCalendarDate) || []
    : [];

  return (
  <>
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* SIDEBAR */}
      <aside className="w-72 shrink-0 bg-gradient-to-b from-blue-800 via-blue-700 to-blue-600 text-white shadow-2xl flex h-screen flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/10 px-4 py-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-2xl shadow-inner">🎓</div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-extrabold tracking-tight">CampusCore</h2>
                <p className="text-[11px] font-medium text-blue-100/90">Student Workspace</p>
              </div>
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100/60">Student Menu</p>
            <div className="space-y-1.5 text-sm">
              <button type="button" onClick={() => setActiveModal(null)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === null && !showStudentTimetable && !showStudentAttendance && !showStudentResults && !showStudentCounseling ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${activeModal === null && !showStudentTimetable && !showStudentAttendance && !showStudentResults && !showStudentCounseling ? "bg-blue-100" : "bg-white/10"}`}>🏠</span><span>Dashboard</span>
              </button>
              <button type="button" onClick={() => setActiveModal("courses")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "courses" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📚</span><span>My Subjects</span>
              </button>
              <button type="button" onClick={() => setActiveModal("assignments")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "assignments" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📝</span><span>Assignments</span>
              </button>
              <button type="button" onClick={() => { fetchStudentQuizzes(); setActiveModal("studentQuizzes"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "studentQuizzes" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🎯</span><span>Quizzes</span>
              </button>
              <button type="button" onClick={() => { fetchCalendarEvents(); setActiveModal("smartCalendar"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "smartCalendar" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📅</span><span>Academic Calendar</span>
              </button>
              <button type="button" onClick={() => setShowStudentTimetable(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showStudentTimetable ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🗓️</span><span>My Timetable</span>
              </button>
              <button type="button" onClick={() => setShowStudentAttendance(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showStudentAttendance ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📊</span><span>Attendance Details</span>
              </button>
              <button type="button" onClick={() => setShowStudentResults(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showStudentResults ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📑</span><span>My Results</span>
              </button>
              <button type="button" onClick={() => setShowStudentCounseling(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showStudentCounseling ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🧑‍🏫</span><span>Teacher Counseling</span>
              </button>
              <button type="button" onClick={() => { fetchMyServiceRequests(); setActiveModal("servicePortal"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "servicePortal" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🛠️</span><span>Campus Helpdesk</span>
              </button>
              <button type="button" onClick={async () => { await fetchCourseTrackers(); setActiveModal("courseTracker"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "courseTracker" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📘</span><span>Course Tracker</span>
              </button>
              <button type="button" onClick={() => navigate("/student/study-planner")} className="group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold text-white/95 hover:bg-white/10 hover:text-white transition-all duration-200">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">🧠</span><span>Smart Study Planner</span>
              </button>
              <button type="button" onClick={() => setActiveModal("materials")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "materials" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📚</span><span>Study Materials</span>
              </button>
              <button type="button" onClick={async () => { await fetchCampusNotices(); setActiveModal("campusNotices"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "campusNotices" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">📢</span><span>Campus Notices</span>
              </button>
            </div>
          </nav>
        </div>

        <div className="border-t border-white/10 bg-black/10 px-4 pb-4 pt-4">
          <button type="button" onClick={() => { setIsEditingProfile(false); setShowPasswordFields(false); setActiveModal("profile"); }} className={`mb-2 group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition-all duration-200 ${activeModal === "profile" ? "bg-white text-blue-900 shadow-lg" : "text-white/95 hover:bg-white/10 hover:text-white"}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">⚙️</span><span>Profile Settings</span>
          </button>
          <button type="button" onClick={() => { localStorage.clear(); navigate("/login/student"); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 py-3 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:bg-red-500/90 hover:shadow-xl"><span>↪</span><span>Sign Out</span></button>
        </div>
      </aside>
      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOPBAR */}
        <div className="bg-white p-4 px-8 flex justify-between items-center shadow border-b border-gray-200">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              Student Workspace
            </h1>
            <p className="text-xs text-blue-600 font-semibold mt-0.5">
              {data.studentInfo.course} | Semester {data.studentInfo.semester} (
              {data.studentInfo.year})
            </p>
          </div>

                    <div className="flex items-center gap-3">
            <NotificationBell />

            <div
              onClick={() => {
                setIsEditingProfile(false);
                setShowPasswordFields(false);
                setActiveModal("profile");
              }}
              className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition"
            >
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm overflow-hidden">
                {data.studentInfo?.profilePhoto || user?.profilePhoto ? (
                  <img
                    src={`http://localhost:5000${
                      data.studentInfo?.profilePhoto || user?.profilePhoto
                    }`}
                    alt="Profile"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  user?.name
                    ? user.name.charAt(0).toUpperCase()
                    : "S"
                )}
              </div>

              <div>
                <span className="font-semibold text-gray-700 block text-sm">
                  {data.studentInfo?.name || user?.name || "Student"}
                </span>
                <span className="text-[11px] text-gray-400 block -mt-1">
                  ID: {data.studentInfo?.id_no || user?.id_no || ""} • Settings
                </span>
              </div>
            </div>
          </div>
        </div>

          {/* WORKSPACE CONTENT */}
          <div className="p-5 overflow-y-auto space-y-6">
            {/* STATS */}
            <div className="grid md:grid-cols-3 gap-5">
              <div
                onClick={() => setActiveModal("courses")}
                className="bg-white p-5 rounded-xl shadow cursor-pointer hover:shadow-lg transition"
              >
                <h3 className="text-gray-500 text-sm font-medium">
                  Subjects This Semester
                </h3>
                <h1 className="text-2xl font-bold text-blue-600 mt-2">
                  {data.coursesCount}
                </h1>
                <p className="text-xs text-gray-400 mt-1">
                  Enrolled modules
                </p>
              </div>

              <div
                onClick={() => setActiveModal("assignments")}
                className="bg-white p-5 rounded-xl shadow cursor-pointer hover:shadow-lg transition"
              >
                <h3 className="text-gray-500 text-sm font-medium">
                  Pending Tasks
                </h3>
                <h1 className="text-2xl font-bold text-red-500 mt-2">
                  {data.pendingCount} Due
                </h1>
                <p className="text-xs text-gray-400 mt-1">
                  Requires PDF submission
                </p>
              </div>

              <div className="bg-white p-5 rounded-xl shadow hover:shadow-lg transition">
                <h3 className="text-gray-500 text-sm font-medium">
                  Average Attendance
                </h3>
                <h1
                  className={`text-2xl font-bold mt-2 ${
                    data.attendance.total > 0 && data.attendance.overallPct < ATTENDANCE_MIN_PERCENT
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {data.attendance.total > 0
                    ? `${data.attendance.overallPct}%`
                    : "—"}
                </h1>
                <p className={`text-xs mt-1 ${data.attendance.total > 0 && data.attendance.overallPct < ATTENDANCE_MIN_PERCENT ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                  {data.attendance.total > 0
                    ? data.attendance.overallPct < ATTENDANCE_MIN_PERCENT
                      ? `Below required ${ATTENDANCE_MIN_PERCENT}%`
                      : "Total recorded presence"
                    : "No attendance recorded yet"}
                </p>
              </div>
            </div>

          {/* TWO MAIN CARDS: ASSIGNMENTS & STUDY MATERIALS */}
          <div className="grid md:grid-cols-2 gap-5">
            {/* Assignments Card */}
            <div className="bg-white p-5 rounded-xl shadow flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-gray-800">
                    Current Assignments
                  </h2>
                  <span className="text-xs font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
                    {data.pendingAssignments.length} Pending
                  </span>
                </div>
                <div className="space-y-3">
                  {data.pendingAssignments.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">
                      No pending assignments! 🎉
                    </p>
                  ) : (
                    data.pendingAssignments.slice(0, 3).map((item) => (
                      <div
                        key={item._id}
                        className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 transition"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {item.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.subject?.subjectName} (
                            {item.subject?.subjectCode})
                          </p>
                          <p className="text-xs text-red-500 font-semibold mt-0.5">
                            Due:{" "}
                            {item.dueDate
                              ? new Date(item.dueDate).toLocaleDateString()
                              : "No deadline"}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSubmittingAssignment(item);
                            setActiveModal("turnIn");
                          }}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                        >
                          Turn In PDF
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <button
                onClick={() => setActiveModal("assignments")}
                className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium transition text-sm"
              >
                View All Assignments ({data.pendingAssignments.length})
              </button>
            </div>

            {/* Study Materials Card */}
            <div className="bg-white p-5 rounded-xl shadow flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-gray-800">
                    Course Materials
                  </h2>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                    {data.materials.length} Files
                  </span>
                </div>
                <div className="space-y-3">
                  {data.materials.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">
                      No materials posted yet.
                    </p>
                  ) : (
                    data.materials.slice(0, 3).map((item) => (
                      <div
                        key={item._id}
                        className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 transition"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {item.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.subject?.subjectName} (
                            {item.subject?.subjectCode})
                          </p>
                        </div>
                        {item.fileUrl && (
                          <a
                            href={`http://localhost:5000${item.fileUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold px-3 py-1.5 rounded-lg border border-purple-200 transition"
                          >
                            📄 Download
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <button
                onClick={() => setActiveModal("materials")}
                className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium transition text-sm"
              >
                View All Materials ({data.materials.length})
              </button>
            </div>
          </div>

          {/* COURSE TRACKER SUMMARY */}
          <div className="bg-white p-5 rounded-xl shadow no-print">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-gray-800">📘 Course Progress Tracker</h2>
                <p className="text-xs text-gray-500 mt-1">Track units and sub-units published by your faculty.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  fetchCourseTrackers();
                  setActiveModal("courseTracker");
                }}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-semibold"
              >
                View Tracker
              </button>
            </div>
            {loadingCourseTracker ? (
              <p className="text-sm text-gray-400 text-center py-5">Loading course tracker...</p>
            ) : courseTrackers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
                <p className="text-sm font-semibold text-gray-700">No course tracker published yet.</p>
                <p className="text-xs text-gray-500 mt-1">Your faculty can publish units and sub-units here later.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
                    <span>Overall tracker progress</span>
                    <span>{trackerSummary.percent}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${trackerSummary.percent}%` }}
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  {courseTrackers.slice(0, 3).map((tracker) => {
                    const total = (tracker.units || []).reduce((sum, unit) => sum + (unit.subUnits || []).length, 0);
                    const completed = (tracker.completedSubUnits || []).length;
                    const percent = total ? Math.round((completed / total) * 100) : 0;
                    return (
                      <div key={tracker.subject?._id} className="border rounded-xl p-3 bg-gray-50">
                        <p className="text-sm font-bold text-gray-800 truncate">{tracker.subject?.subjectName}</p>
                        <p className="text-[11px] text-gray-500 mt-1">{completed}/{total} sub-units complete</p>
                        <div className="h-1.5 rounded-full bg-white mt-2 overflow-hidden border">
                          <div className="h-full bg-green-500" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ATTENDANCE SUMMARY */}
          <div className="bg-white p-5 rounded-xl shadow">
            <h2 className="font-semibold mb-4 text-gray-800">
              Attendance Overview
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Overall
                </p>
                <h3 className={`text-xl font-bold mt-1 ${data.attendance.total > 0 && data.attendance.overallPct < ATTENDANCE_MIN_PERCENT ? "text-red-700" : "text-blue-700"}`}>
                  {data.attendance.overallPct}%
                </h3>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Attended
                </p>
                <h3 className="text-xl font-bold text-green-600 mt-1">
                  {data.attendance.attended}
                </h3>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Missed
                </p>
                <h3 className="text-xl font-bold text-red-600 mt-1">
                  {data.attendance.missed}
                </h3>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Total Lectures
                </p>
                <h3 className="text-xl font-bold text-yellow-600 mt-1">
                  {data.attendance.total}
                </h3>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. TURN IN MODAL */}
      {activeModal === "turnIn" && submittingAssignment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-gray-800">
                Turn In Assignment
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4 text-xs text-blue-900">
              <p className="font-bold">{submittingAssignment.title}</p>
              <p className="text-blue-700">
                {submittingAssignment.subject?.subjectName}
              </p>
            </div>
            <form onSubmit={handleTurnInSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Upload Solution Document{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="file"
                  onChange={(e) => setTurnInFile(e.target.files[0])}
                  className="w-full border rounded-lg px-3 py-2 text-xs text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 file:font-semibold"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Submission Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Please find attached my work..."
                  value={turnInNotes}
                  onChange={(e) => setTurnInNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={uploadingSubmission}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
              >
                {uploadingSubmission ? "Uploading..." : "Confirm & Turn In"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. STUDENT QUIZZES LIST MODAL */}
      {activeModal === "studentQuizzes" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  Academic Quizzes
                </h3>
                <p className="text-xs text-gray-500">
                  Objective assessments for Semester {data.studentInfo.semester}
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y border rounded-lg p-2">
              {studentQuizzes.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">
                  No quizzes scheduled for your subjects right now.
                </p>
              ) : (
                studentQuizzes.map((q) => (
                  <div
                    key={q._id}
                    className="py-3 px-3 flex justify-between items-center hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-semibold text-sm text-gray-800">
                        {q.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {q.subject?.subjectName} • {q.questions?.length} MCQs •
                        ⏱️ {q.timeLimitMinutes} Mins
                      </p>
                      <p className="text-[11px] text-blue-600 font-semibold mt-0.5">
                        Open: {new Date(q.openDate || q.createdAt).toLocaleString()}
                      </p>
                      <p className="text-[11px] text-red-500 font-semibold mt-0.5">
                        Close: {new Date(q.closeDate || q.dueDate).toLocaleString()}
                      </p>
                    </div>

                    {q.hasAttempted ? (
                      <span className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-bold">
                        Score: {q.attemptData?.score} /{" "}
                        {q.attemptData?.totalQuestions} ✓
                      </span>
                    ) : q.isExpired ? (
                      <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full font-bold">
                        Closed
                      </span>
                    ) : q.isNotOpen ? (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-full font-bold">
                        Not Open Yet
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartQuiz(q)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition"
                      >
                        Start Quiz ⏱️
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. ACTIVE QUIZ PLAYER (Anti-Cheat Guard) */}
      {activeModal === "takeQuiz" && activeQuiz && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-2xl flex flex-col border border-red-200">
            <div className="flex justify-between items-center mb-3 pb-3 border-b">
              <div>
                <h3 className="text-base font-bold text-gray-800">
                  {activeQuiz.title}
                </h3>
                <p className="text-[11px] text-red-500 font-semibold mt-0.5">
                  ⚠️ Switching tabs or leaving the screen will automatically
                  submit your quiz!
                </p>
              </div>
              <div className="text-xs bg-red-100 text-red-700 font-extrabold px-3 py-1.5 rounded-full border border-red-300">
                ⏱️ {Math.floor(quizTimerSeconds / 60)}:
                {(quizTimerSeconds % 60).toString().padStart(2, "0")}
              </div>
            </div>

            <div className="text-xs text-gray-500 font-medium mb-3">
              Question {currentQuestionIndex + 1} of{" "}
              {activeQuiz.questions.length}
            </div>

            <div className="py-2">
              <p className="font-semibold text-sm text-gray-800 mb-4 bg-gray-50 p-3 rounded-lg border">
                {activeQuiz.questions[currentQuestionIndex]?.questionText}
              </p>

              <div className="space-y-2.5">
                {activeQuiz.questions[currentQuestionIndex]?.options.map(
                  (opt, idx) => (
                    <div
                      key={idx}
                      onClick={() =>
                        handleSelectAnswer(currentQuestionIndex, idx)
                      }
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition flex items-center gap-3 ${
                        selectedAnswers[currentQuestionIndex] === idx
                          ? "bg-blue-50 border-blue-500 text-blue-800 font-semibold shadow-sm"
                          : "hover:bg-gray-50 border-gray-200 text-gray-700"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          selectedAnswers[currentQuestionIndex] === idx
                            ? "border-blue-600 bg-blue-600"
                            : "border-gray-400"
                        }`}
                      >
                        {selectedAnswers[currentQuestionIndex] === idx && (
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        )}
                      </div>
                      <span>{opt}</span>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 mt-4 border-t">
              <button
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
                className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-30"
              >
                ← Previous
              </button>

              {currentQuestionIndex < activeQuiz.questions.length - 1 ? (
                <button
                  onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                  className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={() => handleSubmitQuizAttempt("normal")}
                  className="text-xs px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow"
                >
                  Finish & Submit 🎯
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. SMART ACADEMIC CALENDAR MODAL */}
      {activeModal === "smartCalendar" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📅 Academic Calendar</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Click any date to see that day's schedule. Click an item to open its relevant section.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setSelectedCalendarDate(null);
                  setSelectedCalendarEvent(null);
                }}
                className="text-gray-400 hover:text-gray-700 text-lg"
              >
                ✕
              </button>
            </div>

            {!selectedCalendarDate && !selectedCalendarEvent ? (
              <>
                <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => changeCalendarMonth(-1)} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">←</button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                        setSelectedCalendarDate(null);
                        setSelectedCalendarEvent(null);
                      }}
                      className="px-3 py-1.5 border rounded-lg text-xs font-semibold hover:bg-gray-50"
                    >
                      Today
                    </button>
                    <button type="button" onClick={() => changeCalendarMonth(1)} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">→</button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600">Filter</span>
                    <select value={calendarFilter} onChange={(e) => setCalendarFilter(e.target.value)} className="border rounded-lg p-2 text-xs bg-white">
                      <option value="ALL">All Events</option>
                      <option value="Internal Exam">🟢 Internal Exams</option>
                      <option value="Assignment Open">🟦 Assignment Open</option>
                      <option value="Assignment Deadline">🔵 Assignment Deadlines</option>
                      <option value="Quiz Open">🟨 Quiz Open</option>
                      <option value="Quiz Close">🟥 Quiz Close</option>
                      <option value="Holiday">🔴 Holidays</option>
                      <option value="Semester Exam">🟣 Semester Exams</option>
                      <option value="General Event">⚪ General Events</option>
                    </select>
                  </div>
                </div>

                <div className="text-center font-bold text-xl text-gray-800 mb-3">{calendarMonthName}</div>

                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                  <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border bg-gray-200">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                      <div key={day} className="bg-gray-50 text-center text-[11px] font-bold text-gray-500 py-2">{day}</div>
                    ))}

                    {calendarCells.map((dayNumber, index) => {
                      const key = dayNumber
                        ? `${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`
                        : `empty-${index}`;
                      const events = dayNumber ? (calendarEventsByDay.get(key) || []) : [];
                      const isToday = dayNumber && key === calendarKey(new Date());
                      const isSelected = dayNumber && key === selectedCalendarDate;

                      return (
                        <div
                          key={key}
                          role={dayNumber ? "button" : undefined}
                          tabIndex={dayNumber ? 0 : -1}
                          onClick={() => handleCalendarDayClick(dayNumber)}
                          onKeyDown={(e) => {
                            if (dayNumber && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              handleCalendarDayClick(dayNumber);
                            }
                          }}
                          className={`min-h-24 text-left bg-white p-2 ${
                            isToday ? "ring-2 ring-inset ring-blue-500" : ""
                          } ${isSelected ? "ring-2 ring-inset ring-purple-500" : ""} ${
                            dayNumber ? "hover:bg-gray-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-purple-400" : "cursor-default"
                          }`}
                        >
                          {dayNumber && (
                            <>
                              <div className={`text-xs font-bold ${isToday ? "text-blue-600" : "text-gray-700"}`}>
                                {dayNumber}
                              </div>
                              <div className="space-y-1 mt-1">
                                {events.slice(0, 3).map((event) => (
                                  <span
                                    key={event._id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCalendarEventClick(event);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleCalendarEventClick(event);
                                      }
                                    }}
                                    className={`block text-[9px] leading-tight rounded px-1.5 py-1 border ${getCalendarEventClass(event)}`}
                                    title={`${event.category}: ${event.title}`}
                                  >
                                    <span className="font-bold">{event.category}</span>
                                    <span className="block truncate">{event.title}</span>
                                  </span>
                                ))}
                                {events.length > 3 && (
                                  <span className="block text-[9px] text-gray-400">+{events.length - 3} more — click date</span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 overflow-y-auto max-h-56 border rounded-xl p-3">
                    <p className="text-xs font-bold text-gray-600 mb-2">Events in this month</p>
                    {filteredCalendarEvents.filter((event) => {
                      const d = new Date(event.date);
                      return d.getFullYear() === calendarCursor.getFullYear() && d.getMonth() === calendarCursor.getMonth();
                    }).length === 0 ? (
                      <p className="text-xs text-gray-400 py-3 text-center">No events for this month with the selected filter.</p>
                    ) : (
                      filteredCalendarEvents
                        .filter((event) => {
                          const d = new Date(event.date);
                          return d.getFullYear() === calendarCursor.getFullYear() && d.getMonth() === calendarCursor.getMonth();
                        })
                        .map((event) => (
                          <button
                            type="button"
                            key={`list-${event._id}`}
                            onClick={() => {
                              setSelectedCalendarDate(calendarKey(event.date));
                              setSelectedCalendarEvent(null);
                            }}
                            className="w-full flex items-center justify-between gap-3 border-b last:border-0 py-2 text-left hover:bg-gray-50 rounded px-2"
                          >
                            <div>
                              <p className="text-xs font-semibold text-gray-800">{event.title}</p>
                              <p className="text-[10px] text-gray-500">{formatShortDate(event.date)}</p>
                            </div>
                            <span className={`text-[9px] px-2 py-1 rounded-full border font-bold ${getCalendarEventClass(event)}`}>
                              {event.category}
                            </span>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              </>
            ) : selectedCalendarEvent ? (
              <div className="flex-1 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setSelectedCalendarEvent(null)}
                  className="text-xs text-blue-600 font-semibold hover:underline mb-4"
                >
                  ← Back to selected date
                </button>

                <div className={`rounded-2xl border p-5 ${getCalendarEventClass(selectedCalendarEvent)}`}>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-[11px] bg-white/70 px-2.5 py-1 rounded-full font-bold border">
                      {selectedCalendarEvent.category}
                    </span>
                    <span className="text-[11px] bg-white/70 px-2.5 py-1 rounded-full font-semibold border">
                      📅 {formatShortDate(selectedCalendarEvent.date)}
                    </span>
                  </div>

                  <h4 className="text-xl font-bold text-gray-900">
                    {selectedCalendarEvent.title}
                  </h4>

                  {selectedCalendarEvent.subject?.subjectName && (
                    <p className="text-xs mt-2 font-semibold">
                      Subject: {selectedCalendarEvent.subject.subjectName} ({selectedCalendarEvent.subject.subjectCode})
                    </p>
                  )}

                  <div className="mt-4 bg-white/80 rounded-xl p-4 border">
                    <p className="text-sm text-gray-700">
                      This calendar item was scheduled for this date. Use the relevant section from the Academic Calendar or sidebar for the complete academic details.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setSelectedCalendarDate(null)}
                  className="text-xs text-blue-600 font-semibold hover:underline mb-4"
                >
                  ← Back to month
                </button>

                <div className="mb-4">
                  <h4 className="text-xl font-bold text-gray-800">
                    {new Date(`${selectedCalendarDate}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedDayEvents.length} {selectedDayEvents.length === 1 ? "item" : "items"} scheduled for this day.
                  </p>
                </div>

                {selectedDayEvents.length === 0 ? (
                  <div className="border border-dashed rounded-xl bg-gray-50 p-10 text-center">
                    <p className="text-sm font-semibold text-gray-700">No events on this date.</p>
                    <p className="text-xs text-gray-400 mt-1">Choose another date from the month.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDayEvents.map((event) => (
                      <button
                        key={event._id}
                        type="button"
                        onClick={() => handleCalendarEventClick(event)}
                        className={`w-full text-left rounded-xl border p-4 hover:shadow-md transition ${getCalendarEventClass(event)}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-2 mb-2">
                              <span className="text-[10px] bg-white/70 px-2 py-1 rounded-full font-bold border">
                                {event.category}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-gray-900">{event.title}</p>
                            {event.subject?.subjectName && (
                              <p className="text-[11px] text-gray-600 mt-1">
                                {event.subject.subjectName} ({event.subject.subjectCode})
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] font-bold shrink-0 bg-white/70 px-2 py-1 rounded-lg border">
                            Open →
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. CAMPUS HELPDESK & COMPLAINT PORTAL */}
      {(activeModal === "servicePortal" || activeModal === "newServiceRequest") && (
        <StudentHelpdeskPanel
          token={token}
          user={user || data.studentInfo}
          startInNew={activeModal === "newServiceRequest"}
          onClose={() => setActiveModal(null)}
        />
      )}


      {/* 6. RAISE NEW COMPLAINT MODAL */}
      {activeModal === "newServiceRequest" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                New Infrastructure Complaint
              </h3>
              <button
                onClick={() => setActiveModal("servicePortal")}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleServiceSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Student ID
                </label>
                <input
                  type="text"
                  value={user?.id_no || data.studentInfo?.id_no || ""}
                  disabled
                  className="w-full border border-gray-200 rounded-lg p-2 text-xs bg-gray-100 text-gray-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Issue Category
                </label>
                <select
                  value={serviceForm.category}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, category: e.target.value })
                  }
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none"
                >
                  <option value="Projector Issue">Projector Not Working</option>
                  <option value="Computer Breakdown">
                    Computer / Lab PC Broken
                  </option>
                  <option value="Fan / AC Problem">Fan / AC Broken</option>
                  <option value="Classroom Light">
                    Classroom Light Broken
                  </option>
                  <option value="Washroom Maintenance">Washroom Issue</option>
                  <option value="Wi-Fi Connectivity">
                    Wi-Fi / Internet Problem
                  </option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Location / Room No
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Room 204 or CS Lab 2"
                  value={serviceForm.location}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, location: e.target.value })
                  }
                  className="w-full border rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Detailed Description
                </label>
                <textarea
                  required
                  rows="3"
                  placeholder="Describe the problem..."
                  value={serviceForm.description}
                  onChange={(e) =>
                    setServiceForm({
                      ...serviceForm,
                      description: e.target.value,
                    })
                  }
                  className="w-full border rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Attach Photos (Optional — Max 3)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 3) {
                      alert("You can attach a maximum of 3 photos.");
                      e.target.value = "";
                      return;
                    }
                    setServicePhotos(files);
                  }}
                  className="w-full border rounded-lg px-3 py-1.5 text-xs text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 file:font-semibold"
                />
                {servicePhotos.length > 0 && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {servicePhotos.length} photo{servicePhotos.length > 1 ? "s" : ""} selected. Max 3, 5 MB each.
                  </p>
                )}
              </div>

              <label className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-[11px] text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={serviceForm.confirmGenuine}
                  onChange={(e) =>
                    setServiceForm({
                      ...serviceForm,
                      confirmGenuine: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 accent-amber-600"
                />
                <span>I confirm this complaint is genuine and the information above is accurate.</span>
              </label>

              <button
                type="submit"
                disabled={submittingService}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-xs transition mt-2 disabled:opacity-50"
              >
                {submittingService ? "Submitting..." : "Submit Ticket"}
              </button>
            </form>
          </div>
        </div>
      )}

 {/* 7. PROFILE SETTINGS MODAL */}
{activeModal === "profile" && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">
            My Profile
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {isEditingProfile
              ? "Update your account information"
              : "View your account information"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setActiveModal(null);
            setIsEditingProfile(false);
            setShowPasswordFields(false);
          }}
          className="text-xl text-gray-400 transition hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      {/* Profile Photo / Avatar */}
      <div className="flex flex-col items-center px-6 pt-6">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-blue-100 bg-gray-100">
         {(data.studentInfo?.profilePhoto || user?.profilePhoto) ? (
  <img
    src={`http://localhost:5000${
      data.studentInfo?.profilePhoto || user?.profilePhoto
    }`}
    alt="Profile"
    onError={(e) => {
      e.currentTarget.style.display = "none";
    }}
    className="h-full w-full object-cover"
  />
) : (
  <span className="text-4xl">👤</span>
)}
        </div>

        <p className="mt-3 text-base font-bold text-gray-800">
          {user?.name || "User"}
        </p>

        <span className="mt-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
          {user?.role || "student"}
        </span>
      </div>

      {/* VIEW MODE */}
      {!isEditingProfile ? (
        <div className="space-y-4 px-6 py-6">

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Student ID
            </p>
            <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
              {user?.id_no || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Full Name
            </p>
            <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
              {user?.name || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Email
            </p>
            <p className="mt-1 break-all rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
              {user?.email || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Role
            </p>
            <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium capitalize text-gray-800">
              {user?.role || "student"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setProfileForm((prev) => ({
                ...prev,
                name: user?.name || "",
                email: user?.email || "",
                currentPassword: "",
                newPassword: "",
                confirmPassword: "",
              }));
              setShowPasswordFields(false);
              setIsEditingProfile(true);
            }}
            className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            ✏️ Edit Profile
          </button>
        </div>
      ) : (

        /* EDIT MODE */
        <form
          onSubmit={handleUpdateProfile}
          className="space-y-4 px-6 py-6"
        >

          {/* Student ID - NOT EDITABLE */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Student ID
            </label>
            <input
              type="text"
              value={user?.id_no || ""}
              disabled
              className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* Full Name - NOT EDITABLE */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Full Name
            </label>
            <input
              type="text"
              value={profileForm.name || user?.name || ""}
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* Email - EDITABLE */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Email Address
            </label>
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) =>
                setProfileForm((prev) => ({
                  ...prev,
                  email: e.target.value,
                }))
              }
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Enter your email"
            />
          </div>

          {/* Password Toggle — ONLY ONE */}
          <button
            type="button"
            onClick={() => {
  if (showPasswordFields) {
    setProfileForm((prev) => ({
      ...prev,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    }));
  }

  setShowPasswordFields((prev) => !prev);
}}
            className="w-full rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            {showPasswordFields
              ? "🔒 Hide Password Change"
              : "🔒 Change Password"}
          </button>

          {/* Password Fields */}
          {showPasswordFields && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Current Password
                </label>
                <input
                  type="password"
                  value={profileForm.currentPassword}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      currentPassword: e.target.value,
                    }))
                  }
                  required={showPasswordFields}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  New Password
                </label>
                <input
                  type="password"
                  value={profileForm.newPassword}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      newPassword: e.target.value,
                    }))
                  }
                  required={showPasswordFields}
                  minLength={6}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={profileForm.confirmPassword}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                  required={showPasswordFields}
                  minLength={6}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Re-enter new password"
                />
              </div>

            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">

            <button
              type="button"
              onClick={() => {
                setProfileForm((prev) => ({
                  ...prev,
                  name: user?.name || "",
                  email: user?.email || "",
                  currentPassword: "",
                  newPassword: "",
                  confirmPassword: "",
                }));
                setShowPasswordFields(false);
                setIsEditingProfile(false);
              }}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Save Changes
            </button>

          </div>
        </form>
      )}
    </div>
  </div>
)}

      {/* 8. ASSIGNMENTS LIST MODAL */}
      {activeModal === "assignments" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                Pending Assignments ({data.pendingAssignments.length})
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {data.pendingAssignments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  All assignments are submitted! 🎉
                </p>
              ) : (
                data.pendingAssignments.map((item) => (
                  <div
                    key={item._id}
                    className="p-4 border rounded-xl bg-gray-50 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">
                          {item.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.subject?.subjectName} (
                          {item.subject?.subjectCode})
                        </p>
                        <p className="text-xs text-blue-600 font-semibold mt-0.5">
                          Uploaded: {new Date(item.publishDate || item.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-red-500 font-semibold mt-0.5">
                          Due: {item.dueDate ? new Date(item.dueDate).toLocaleString() : "No deadline"}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSubmittingAssignment(item);
                          setActiveModal("turnIn");
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shrink-0"
                      >
                        Turn In PDF
                      </button>
                    </div>
                    {item.description && (
                      <p className="text-xs bg-white p-2 rounded border text-gray-600 whitespace-pre-line">
                        {item.description}
                      </p>
                    )}
                    {item.fileUrl && (
                      <a
                        href={`http://localhost:5000${item.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-xs text-blue-600 hover:underline font-semibold"
                      >
                        📄 Download Question File
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 9. MATERIALS LIST MODAL */}
      {activeModal === "materials" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📚 Study Materials</h3>
                <p className="text-xs text-gray-500 mt-1">Filter learning resources by subject.</p>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Subject Filter</label>
              <select value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="ALL">All Subjects ({data.materials.length})</option>
                {materialsBySubject.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
              {filteredMaterials.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No materials available for this subject.</p>
              ) : (
                filteredMaterials.map((m) => (
                  <div key={m._id} className="p-3.5 border rounded-xl bg-gray-50 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{m.title}</p>
                      <p className="text-xs text-gray-500">{m.subject?.subjectName} ({m.subject?.subjectCode})</p>
                      {m.description && <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{m.description}</p>}
                    </div>
                    {m.fileUrl ? (
                      <a href={`http://localhost:5000${m.fileUrl}`} target="_blank" rel="noreferrer" className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">Download 📄</a>
                    ) : (
                      <span className="text-[10px] text-gray-400">No file</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 10. COURSE TRACKER MODAL */}
      {activeModal === "courseTracker" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📘 Course Tracker</h3>
                <p className="text-xs text-gray-500 mt-1">Faculty updates completed syllabus topics here. You can view the live syllabus progress.</p>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            {loadingCourseTracker ? (
              <p className="text-sm text-gray-400 text-center py-8">Loading tracker...</p>
            ) : courseTrackers.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-xl bg-gray-50">
                <p className="font-semibold text-gray-700">No published course tracker yet.</p>
                <p className="text-xs text-gray-500 mt-1">Ask your faculty/admin to publish the course units.</p>
              </div>
            ) : (
              <div className="overflow-y-auto space-y-5 pr-1">
                {courseTrackers.map((tracker) => {
                  const totalSubUnits = (tracker.units || []).reduce((sum, unit) => sum + (unit.subUnits || []).length, 0);
                  const completedCount = (tracker.completedSubUnits || []).length;
                  const pct = totalSubUnits ? Math.round((completedCount / totalSubUnits) * 100) : 0;
                  return (
                    <div key={tracker.subject?._id} className="border rounded-2xl p-4">
                      <div className="flex justify-between items-center gap-3 mb-3">
                        <div>
                          <p className="font-bold text-gray-800">{tracker.subject?.subjectName}</p>
                          <p className="text-[11px] text-gray-500">{tracker.subject?.subjectCode} • {completedCount}/{totalSubUnits} sub-units complete</p>
                        </div>
                        <span className="text-sm font-bold text-blue-700">{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4"><div className="h-full bg-blue-600" style={{ width: `${pct}%` }} /></div>

                      <div className="space-y-4">
                        {(tracker.units || []).map((unit, unitIndex) => {
                          const unitTotal = (unit.subUnits || []).length;
                          const unitDone = (unit.subUnits || []).filter((_, subIndex) => (tracker.completedSubUnits || []).includes(`${unitIndex}-${subIndex}`)).length;
                          return (
                            <div key={unit._id || `${unit.title}-${unitIndex}`} className="rounded-xl bg-gray-50 border p-3">
                              <div className="flex justify-between items-center mb-2">
                                <p className="text-sm font-bold text-gray-800">Unit {unitIndex + 1}: {unit.title}</p>
                                <span className="text-[10px] font-semibold text-gray-500">{unitDone}/{unitTotal}</span>
                              </div>
                              <div className="space-y-1.5">
                                {(unit.subUnits || []).map((subUnit, subIndex) => {
                                  const key = `${unitIndex}-${subIndex}`;
                                  const done = (tracker.completedSubUnits || []).includes(key);
                                  return (
                                    <div key={subUnit._id || key} className={`flex items-center gap-3 p-2.5 rounded-lg border ${done ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
                                      <input type="checkbox" checked={done} readOnly disabled className="w-4 h-4 accent-green-600 cursor-default" aria-label={`${subUnit.title} completion status`} />
                                      <span className={`text-xs flex-1 ${done ? "text-green-800 line-through" : "text-gray-700"}`}>{subUnit.title}</span>
                                      <span className={`text-[10px] font-semibold ${done ? "text-green-700" : "text-gray-400"}`}>{done ? "Completed" : "Pending"}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 11. CAMPUS NOTICES */}
      {activeModal === "campusNotices" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📢 Campus Notices & Events</h3>
                <p className="text-xs text-gray-500 mt-1">Official campus updates, events, circulars, fees, exams and more.</p>
              </div>
              <button type="button" onClick={() => { setActiveModal(null); setSelectedCampusNotice(null); }} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            {selectedCampusNotice ? (
              <div className="overflow-y-auto flex-1">
                <button type="button" onClick={() => setSelectedCampusNotice(null)} className="text-xs text-blue-600 font-semibold hover:underline mb-4">← Back to all notices</button>

                <div className="border rounded-2xl overflow-hidden">
                  <div className="p-5 bg-gray-50 border-b">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[11px] bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-bold">{selectedCampusNotice.type}</span>
                      {selectedCampusNotice.eventDate && <span className="text-[11px] bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-bold">📅 {new Date(selectedCampusNotice.eventDate).toLocaleDateString()}</span>}
                    </div>
                    <h4 className="text-xl font-bold text-gray-800">{selectedCampusNotice.title}</h4>
                  </div>

                  <div className="p-5 space-y-4">
                    {selectedCampusNotice.eventDate && (
                      <div className="grid md:grid-cols-3 gap-3">
                        <div className="bg-blue-50 rounded-xl p-3"><p className="text-[10px] text-gray-500 font-semibold">DATE</p><p className="text-sm font-bold text-gray-800 mt-1">{new Date(selectedCampusNotice.eventDate).toLocaleDateString()}</p></div>
                        {(selectedCampusNotice.startTime || selectedCampusNotice.endTime) && <div className="bg-yellow-50 rounded-xl p-3"><p className="text-[10px] text-gray-500 font-semibold">TIME</p><p className="text-sm font-bold text-gray-800 mt-1">{selectedCampusNotice.startTime || "—"}{selectedCampusNotice.endTime ? ` – ${selectedCampusNotice.endTime}` : ""}</p></div>}
                        {selectedCampusNotice.venue && <div className="bg-purple-50 rounded-xl p-3"><p className="text-[10px] text-gray-500 font-semibold">VENUE</p><p className="text-sm font-bold text-gray-800 mt-1">{selectedCampusNotice.venue}</p></div>}
                      </div>
                    )}

                    <div className="whitespace-pre-wrap text-sm leading-6 text-gray-700 border rounded-xl p-4">{selectedCampusNotice.message}</div>

                    {selectedCampusNotice.attachmentUrl && (
                      <div className="rounded-xl border bg-gray-50 p-4">
                        <p className="text-xs font-bold text-gray-700 mb-2">Attachment</p>
                        {selectedCampusNotice.attachmentType?.startsWith("image/") ? (
                          <img src={`http://localhost:5000${selectedCampusNotice.attachmentUrl}`} alt={selectedCampusNotice.attachmentName || "Notice attachment"} className="max-h-80 w-auto rounded-lg border object-contain" />
                        ) : (
                          <a href={`http://localhost:5000${selectedCampusNotice.attachmentUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-xs font-semibold">📄 Open PDF / Document</a>
                        )}
                        {selectedCampusNotice.attachmentName && <p className="text-[10px] text-gray-500 mt-2">📎 {selectedCampusNotice.attachmentName}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-3">
                {loadingCampusNotices ? (
                  <p className="text-sm text-gray-400 text-center py-10">Loading campus notices...</p>
                ) : campusNotices.length === 0 ? (
                  <div className="border border-dashed rounded-xl p-10 text-center"><p className="text-sm font-semibold text-gray-700">No campus notices yet.</p><p className="text-xs text-gray-400 mt-1">New official updates will appear here.</p></div>
                ) : (
                  campusNotices.map((notice) => (
                    <button type="button" key={notice._id} onClick={() => setSelectedCampusNotice(notice)} className="w-full text-left border rounded-xl p-4 hover:bg-gray-50 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2 mb-2">
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">{notice.type}</span>
                            {notice.eventDate && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">📅 {new Date(notice.eventDate).toLocaleDateString()}</span>}
                          </div>
                          <h4 className="text-sm font-bold text-gray-800">{notice.title}</h4>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{notice.message}</p>
                          {notice.venue && <p className="text-[10px] text-purple-700 font-semibold mt-2">📍 {notice.venue}</p>}
                        </div>
                        <span className="text-[11px] text-blue-600 font-semibold shrink-0">View →</span>
                      </div>
                      {notice.attachmentName && <p className="text-[10px] text-gray-500 mt-2">📎 {notice.attachmentName}</p>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 11. SUBJECTS MODAL */}
      {activeModal === "courses" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">My Subjects</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.mySubjects.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No subjects registered yet.
                </p>
              ) : (
                data.mySubjects.map((sub) => (
                  <div
                    key={sub._id}
                    className="p-3 border rounded-lg bg-gray-50 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-bold text-gray-800 text-sm">
                        {sub.subjectName}
                      </p>
                      <p className="text-xs text-gray-500">
                        Code: {sub.subjectCode}
                      </p>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-1 rounded">
                      Sem {sub.semester}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showStudentTimetable && (
        <StudentTimetablePanel
          onClose={() => setShowStudentTimetable(false)}
        />
      )}

      {showStudentAttendance && (
        <StudentAttendancePanel
          onClose={() => setShowStudentAttendance(false)}
        />
      )}

      {showStudentCounseling && (
        <StudentCounselingPanel
          onClose={() => setShowStudentCounseling(false)}
        />
      )}

      {showStudentResults && (
        <StudentResultPanel
          onClose={() => setShowStudentResults(false)}
        />
      )}
  </>
);
}
