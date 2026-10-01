import React, { useState, useEffect } from "react";
import axios from "axios";
import NotificationBell from "../components/NotificationBell";
import HelpdeskAdminPanel from "../components/HelpdeskAdminPanel";
import AdminTimetablePanel from "../components/AdminTimetablePanel";
import AdminAttendanceReportPanel from "../components/AdminAttendanceReportPanel";
import AdminResultPanel from "../components/AdminResultPanel";
import { useNavigate, useLocation } from "react-router-dom";
import "../index.css";


export default function AdminDashboard() {
  const calculateYearFromSem = (semNumber) => {
    const sem = Number(semNumber);
    const yearIndex = Math.ceil(sem / 2);
    const suffix = ["st", "nd", "rd", "th"][Math.min(yearIndex - 1, 3)] || "th";
    return `${yearIndex}${suffix} Year`;
  };

  const getTodayStr = () => new Date().toISOString().split("T")[0];

  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "{}"));
  const token = localStorage.getItem("token");

  // Metrics & Global Sorted Lists
  const [stats, setStats] = useState({ students: 0, teachers: 0, courses: 0, subjects: 0 });
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);

  // Filter States for Students
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("ALL");
  const [selectedSemFilter, setSelectedSemFilter] = useState("ALL");

  // Modal selector
  const [activeModal, setActiveModal] = useState(null);
  const [isEditingAdminProfile, setIsEditingAdminProfile] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  // Editing Selection Objects
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);

  // Form States
  const [courseForm, setCourseForm] = useState({ courseName: "", courseCode: "", durationYears: 3 });
  const [subjectForm, setSubjectForm] = useState({
    subjectName: "",
    subjectCode: "",
    courseId: "",
    semester: 1,
    credits: 4,
    teacherId: "",
  });
  const [assignForm, setAssignForm] = useState({ subjectId: "", teacherId: "" });
  const [studentForm, setStudentForm] = useState({
    name: "",
    id_no: "",
    password: "",
    course: "",
    semester: 1,
    year: "1st Year",
  });
  const [studentPhoto, setStudentPhoto] = useState(null);
  const [teacherForm, setTeacherForm] = useState({ name: "", id_no: "", password: "", department: "" });
  const [teacherPhoto, setTeacherPhoto] = useState(null);

  // Course Tracker Manager
  const [courseTrackerSubjects, setCourseTrackerSubjects] = useState([]);
  const [trackerSubjectId, setTrackerSubjectId] = useState("");
  const [trackerUnits, setTrackerUnits] = useState([]);
  const [trackerPublished, setTrackerPublished] = useState(false);
  const [loadingTracker, setLoadingTracker] = useState(false);
  const [savingTracker, setSavingTracker] = useState(false);

  // Admin Service Desk & Calendar States
  const [adminServiceRequests, setAdminServiceRequests] = useState([]);
  const [helpdeskStaff, setHelpdeskStaff] = useState([]);
  const [serviceAssignments, setServiceAssignments] = useState({});
  const [showAddHelpdeskStaff, setShowAddHelpdeskStaff] = useState(false);
  const [helpdeskStaffForm, setHelpdeskStaffForm] = useState({ name: "", email: "", mobile: "", department: "Maintenance Staff" });
  const [addingHelpdeskStaff, setAddingHelpdeskStaff] = useState(false);
  const [assigningHelpdeskRequest, setAssigningHelpdeskRequest] = useState(null);
  const [adminCalendarEvents, setAdminCalendarEvents] = useState([]);
  const [showAdminAttendanceReport, setShowAdminAttendanceReport] = useState(false);
  const [showAdminResults, setShowAdminResults] = useState(false);
  const [calendarForm, setCalendarForm] = useState({
    title: "",
    date: "",
    category: "Event",
    customCategory: "",
    targetCourse: "ALL",
    targetSemester: 0,
  });
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    type: "Announcement",
    message: "",
    eventDate: "",
    startTime: "",
    endTime: "",
    venue: "",
    audience: "students",
    targetCourse: "ALL",
    targetSemester: 0,
  });
  const [announcementFile, setAnnouncementFile] = useState(null);
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);

  // Admin Profile Form
  const [adminProfileForm, setAdminProfileForm] = useState({
    name: user.name || "",
    email: user.email || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const sortById = (list) => {
    return [...(list || [])].sort((a, b) =>
      (a.id_no || "").localeCompare(b.id_no || "", undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  };

  const loadDashboardData = async () => {
    try {
      const [dashRes, metaRes] = await Promise.all([
        axios.get("http://localhost:5000/api/admin/dashboard", authConfig),
        axios.get("http://localhost:5000/api/admin/academic-meta", authConfig),
      ]);
      setStats(dashRes.data);

      const sortedCourses = (metaRes.data.courses || []).sort((a, b) =>
        (a.courseCode || "").localeCompare(b.courseCode || "", undefined, { numeric: true })
      );
      setCourses(sortedCourses);

      setTeachers(sortById(metaRes.data.teachers || []));

      const sortedSubjects = (metaRes.data.subjects || []).sort((a, b) =>
        (a.subjectCode || "").localeCompare(b.subjectCode || "", undefined, { numeric: true })
      );
      setSubjects(sortedSubjects);

      if (sortedCourses.length > 0 && !subjectForm.courseId) {
        setSubjectForm((prev) => ({ ...prev, courseId: sortedCourses[0]._id }));
        setStudentForm((prev) => ({ ...prev, course: sortedCourses[0].courseName }));
      }
    } catch (err) {
      console.error("Dashboard Load Error:", err);
    }
  };

  useEffect(() => {
    if (!token || user.role !== "admin") {
      navigate("/login/admin");
      return;
    }
    loadDashboardData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("open") !== "helpdesk") return;
    fetchAdminServiceRequests();
    fetchHelpdeskStaff();
    setActiveModal("adminServiceDesk");
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStudents = async (course = selectedCourseFilter, sem = selectedSemFilter) => {
    try {
      const res = await axios.get(
        `http://localhost:5000/api/admin/students?course=${course}&semester=${sem}`,
        authConfig
      );
      setStudents(sortById(res.data));
    } catch (err) {
      console.error("Fetch Students Error:", err);
    }
  };

  useEffect(() => {
    if (activeModal === "viewStudents") {
      fetchStudents(selectedCourseFilter, selectedSemFilter);
    }
  }, [selectedCourseFilter, selectedSemFilter, activeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeModal === "adminServiceDesk") {
      fetchAdminServiceRequests();
      fetchHelpdeskStaff();
    }
  }, [activeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-suggest the next enrollment number whenever the Enroll Student dialog opens.
  // The value remains fully editable by the admin.
  useEffect(() => {
    if (activeModal !== "addStudent") return;
    const loadSuggestedEnrollment = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/admin/student-next-id", authConfig);
        setStudentForm((prev) => (prev.id_no ? prev : { ...prev, id_no: res.data.suggestedId || "" }));
      } catch (err) {
        console.error("Enrollment suggestion error:", err);
      }
    };
    loadSuggestedEnrollment();
  }, [activeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeModal !== "addTeacher") return;
    const loadSuggestedTeacherId = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/admin/teacher-next-id", authConfig);
        setTeacherForm((prev) => (prev.id_no ? prev : { ...prev, id_no: res.data.suggestedId || "" }));
      } catch (err) { console.error("Teacher ID suggestion error:", err); }
    };
    loadSuggestedTeacherId();
  }, [activeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTeachers = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/admin/teachers", authConfig);
      setTeachers(sortById(res.data));
    } catch (err) {
      console.error("Fetch Teachers Error:", err);
    }
  };

  const fetchAdminServiceRequests = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/admin/service-requests", authConfig);
      setAdminServiceRequests(res.data || []);
    } catch (err) {
      console.error("Failed to load helpdesk requests", err);
    }
  };

  const fetchHelpdeskStaff = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/admin/service-staff", authConfig);
      setHelpdeskStaff(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load helpdesk staff", err);
      setHelpdeskStaff([]);
    }
  };

  const handleAddHelpdeskStaff = async (e) => {
    e.preventDefault();
    const name = helpdeskStaffForm.name.trim();
    const email = helpdeskStaffForm.email.trim().toLowerCase();
    const mobile = helpdeskStaffForm.mobile.trim();
    const department = helpdeskStaffForm.department.trim();

    if (name.length < 2 || name.length > 100) return alert("Staff name must be between 2 and 100 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert("Please enter a valid staff email address.");
    if (mobile && !/^[0-9+()\-\s]{7,20}$/.test(mobile)) return alert("Please enter a valid mobile number.");
    if (department.length < 2 || department.length > 100) return alert("Department / type must be between 2 and 100 characters.");

    try {
      setAddingHelpdeskStaff(true);
      await axios.post(
        "http://localhost:5000/api/admin/service-staff",
        { name, email, mobile, department },
        authConfig
      );
      alert("Helpdesk staff added successfully.");
      setHelpdeskStaffForm({ name: "", email: "", mobile: "", department: "Maintenance Staff" });
      setShowAddHelpdeskStaff(false);
      await fetchHelpdeskStaff();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to add helpdesk staff.");
    } finally {
      setAddingHelpdeskStaff(false);
    }
  };

  const handleAssignHelpdeskRequest = async (requestId) => {
    const staffId = serviceAssignments[requestId] || "";
    if (!staffId) return alert("Please select a staff member first.");
    try {
      setAssigningHelpdeskRequest(requestId);
      const res = await axios.put(
        `http://localhost:5000/api/admin/service-requests/${requestId}/assign`,
        { staffId },
        authConfig
      );
      await fetchAdminServiceRequests();
      await fetchHelpdeskStaff();
      alert(res.data?.emailSent
        ? "Request assigned and email sent to the selected staff member. 📧"
        : res.data?.emailFailed
          ? "Request assigned, but the email provider rejected the message. Check your email configuration/API key."
          : "Request assigned. Email was not sent because email service is not configured yet.");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to assign helpdesk request.");
    } finally {
      setAssigningHelpdeskRequest(null);
    }
  };

  const fetchAdminCalendarEvents = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/admin/calendar-events", authConfig);
      setAdminCalendarEvents(res.data || []);
    } catch (err) {
      console.error("Failed to load admin calendar:", err);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await axios.put(
        `http://localhost:5000/api/admin/service-requests/${id}/status`,
        { status: newStatus },
        authConfig
      );
      fetchAdminServiceRequests();
    } catch (err) {
      alert("Failed to update ticket status.");
    }
  };

  const handleCreateCalendarEvent = async (e) => {
    e.preventDefault();

    const title = calendarForm.title.trim();
    const customCategory = calendarForm.customCategory.trim();
    const targetSemester = Number(calendarForm.targetSemester || 0);

    if (title.length < 2 || title.length > 160) {
      return alert("Event title must be between 2 and 160 characters.");
    }

    if (!calendarForm.date) {
      return alert("Please select an event date.");
    }

    if (Number.isNaN(new Date(calendarForm.date).getTime())) {
      return alert("Please provide a valid event date.");
    }

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

    if (!allowedCategories.includes(calendarForm.category)) {
      return alert("Please select a valid calendar category.");
    }

    if (calendarForm.category === "Other" && (customCategory.length < 2 || customCategory.length > 80)) {
      return alert("Custom event type must be between 2 and 80 characters.");
    }

    if (!Number.isInteger(targetSemester) || targetSemester < 0 || targetSemester > 20) {
      return alert("Invalid target semester.");
    }

    try {
      await axios.post(
        "http://localhost:5000/api/admin/calendar-event",
        {
          title,
          date: calendarForm.date,
          category: calendarForm.category,
          customCategory: calendarForm.category === "Other" ? customCategory : "",
          targetCourse: calendarForm.targetCourse || "ALL",
          targetSemester,
        },
        authConfig,
      );

      alert("Calendar event added successfully! 📅");

      setCalendarForm({
        title: "",
        date: "",
        category: "Event",
        customCategory: "",
        targetCourse: "ALL",
        targetSemester: 0,
      });

      fetchAdminCalendarEvents();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to add event");
    }
  };

  const handleSendAnnouncement = async (e) => {
    e.preventDefault();

    const title = announcementForm.title.trim();
    const message = announcementForm.message.trim();
    const venue = announcementForm.venue.trim();

    if (title.length < 2 || title.length > 160) {
      return alert("Title must be between 2 and 160 characters.");
    }

    if (message.length < 2 || message.length > 5000) {
      return alert("Message must be between 2 and 5000 characters.");
    }

    if (venue.length > 200) {
      return alert("Venue cannot exceed 200 characters.");
    }

    if (
      announcementForm.eventDate &&
      Number.isNaN(new Date(announcementForm.eventDate).getTime())
    ) {
      return alert("Please select a valid event date.");
    }

    if (
      !["students", "teachers", "all"].includes(
        announcementForm.audience
      )
    ) {
      return alert("Please select a valid audience.");
    }

    if (
      !Number.isInteger(Number(announcementForm.targetSemester)) ||
      Number(announcementForm.targetSemester) < 0 ||
      Number(announcementForm.targetSemester) > 20
    ) {
      return alert("Please choose a valid semester.");
    }

    if (announcementFile) {
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];

      if (!allowedTypes.includes(announcementFile.type)) {
        return alert("Attachment must be PDF, JPG, PNG or WEBP.");
      }

      if (announcementFile.size > 10 * 1024 * 1024) {
        return alert("Attachment must be 10 MB or smaller.");
      }
    }

    const body = new FormData();
    body.append("title", title);
    body.append("type", announcementForm.type);
    body.append("message", message);
    body.append("eventDate", announcementForm.eventDate);
    body.append("startTime", announcementForm.startTime);
    body.append("endTime", announcementForm.endTime);
    body.append("venue", venue);
    body.append("audience", announcementForm.audience);
    body.append("targetCourse", announcementForm.targetCourse || "ALL");
    body.append(
      "targetSemester",
      String(Number(announcementForm.targetSemester) || 0)
    );

    if (announcementFile) {
      body.append("attachment", announcementFile);
    }

    try {
      setSendingAnnouncement(true);

      const res = await axios.post(
        "http://localhost:5000/api/campus-notices",
        body,
        {
          headers: {
            ...authConfig.headers,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      alert(res.data.message || "Campus notice published.");

      setAnnouncementForm({
        title: "",
        type: "Announcement",
        message: "",
        eventDate: "",
        startTime: "",
        endTime: "",
        venue: "",
        audience: "students",
        targetCourse: "ALL",
        targetSemester: 0,
      });

      setAnnouncementFile(null);

      const input = document.getElementById(
        "adminAnnouncementAttachment"
      );

      if (input) {
        input.value = "";
      }

      await fetchAdminCalendarEvents();
      setActiveModal(null);
    } catch (err) {
      alert(
        err.response?.data?.message ||
          "Failed to publish campus notice."
      );
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const handleDeleteCalendarEvent = async (id) => {
    if (!window.confirm("Remove this date from the academic calendar?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/admin/calendar-event/${id}`, authConfig);
      fetchAdminCalendarEvents();
    } catch (err) {
      alert("Failed to delete event");
    }
  };

 const handleUpdateAdminProfile = async (e) => {
  e.preventDefault();

  const email = adminProfileForm.email.trim().toLowerCase();

  if (!email) {
    alert("Email address is required.");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    alert("Please enter a valid email address.");
    return;
  }

  if (adminProfileForm.newPassword) {
    if (!adminProfileForm.currentPassword.trim()) {
      alert("Current password is required to change your password.");
      return;
    }

    if (adminProfileForm.newPassword.trim().length < 6) {
      alert("New password must be at least 6 characters long.");
      return;
    }

    if (
      adminProfileForm.newPassword.trim() ===
      adminProfileForm.currentPassword.trim()
    ) {
      alert("New password must be different from your current password.");
      return;
    }

    if (
      adminProfileForm.newPassword !==
      adminProfileForm.confirmPassword
    ) {
      alert("New password and confirm password do not match.");
      return;
    }
  }

  try {
    const res = await axios.put(
      "http://localhost:5000/api/auth/update-profile",
      {
        email,
        currentPassword: adminProfileForm.currentPassword,
        newPassword: adminProfileForm.newPassword,
      },
      authConfig
    );

    alert(res.data.message || "Profile updated successfully!");

    const updated = {
      ...user,
      name: res.data.user.name,
      email: res.data.user.email,
    };

    setUser(updated);
    localStorage.setItem("user", JSON.stringify(updated));

    setAdminProfileForm((prev) => ({
      ...prev,
      name: res.data.user.name,
      email: res.data.user.email,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    }));

    setIsEditingAdminProfile(false);
    setActiveModal(null);
  } catch (err) {
    alert(
      err.response?.data?.message ||
        "Failed to update profile."
    );
  }
};

  const handleAddCourse = async (e) => {
    e.preventDefault();
    const courseName = courseForm.courseName.trim();
    const courseCode = courseForm.courseCode.trim().toUpperCase();

    if (courseName.length < 3 || courseName.length > 100) return alert("Course name must be 3–100 characters.");
    if (!/^[A-Za-z]/.test(courseName)) return alert("Course name must start with a letter.");
    if (!/^[A-Z0-9-]{2,20}$/.test(courseCode)) return alert("Course code must be 2–20 characters and use only letters, numbers, or hyphens.");

    try {
      await axios.post("http://localhost:5000/api/admin/course",
        { ...courseForm, courseName, courseCode }, authConfig);
      alert("Course created successfully! 🏛️");
      setCourseForm({ courseName: "", courseCode: "", durationYears: 3 });
      setActiveModal(null);
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Error adding course");
    }
  };

  const handleEditCourse = async (e) => {
    e.preventDefault();
    const courseName = editingCourse.courseName.trim();
    const courseCode = editingCourse.courseCode.trim().toUpperCase();
    if (courseName.length < 3 || courseName.length > 100) return alert("Course name must be 3–100 characters.");
    if (!/^[A-Z0-9-]{2,20}$/.test(courseCode)) return alert("Course code must be 2–20 characters and use only letters, numbers, or hyphens.");
    if (!Number.isInteger(Number(editingCourse.durationYears)) || Number(editingCourse.durationYears) < 1 || Number(editingCourse.durationYears) > 5) {
      return alert("Course duration must be between 1 and 5 years.");
    }
    try {
      await axios.put(`http://localhost:5000/api/admin/course/${editingCourse._id}`,
        { ...editingCourse, courseName, courseCode, durationYears: Number(editingCourse.durationYears) }, authConfig);
      alert("Course updated successfully!");
      setActiveModal("viewCourses");
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Error updating course");
    }
  };

  const handleAddSubject = async (e) => {
    e.preventDefault();
    const subjectName = subjectForm.subjectName.trim();
    const subjectCode = subjectForm.subjectCode.trim().toUpperCase();

    if (subjectName.length < 2 || subjectName.length > 100) return alert("Subject name must be 2–100 characters.");
    if (!/^[A-Z0-9-]{2,20}$/.test(subjectCode)) return alert("Subject code must be 2–20 characters and use only letters, numbers, or hyphens.");
    if (!subjectForm.courseId) return alert("Please choose a course.");
    if (!Number.isInteger(Number(subjectForm.semester)) || Number(subjectForm.semester) < 1) return alert("Please choose a valid semester.");

    try {
      await axios.post("http://localhost:5000/api/admin/subject",
        { ...subjectForm, subjectName, subjectCode }, authConfig);
      alert("Subject added successfully! 📚");
      setSubjectForm({
        subjectName: "",
        subjectCode: "",
        courseId: courses[0]?._id || "",
        semester: 1,
        credits: 4,
        teacherId: "",
      });
      setActiveModal(null);
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Error adding subject");
    }
  };

  const handleEditSubject = async (e) => {
    e.preventDefault();
    const subjectName = editingSubject.subjectName.trim();
    const subjectCode = editingSubject.subjectCode.trim().toUpperCase();
    if (subjectName.length < 2 || subjectName.length > 100) return alert("Subject name must be 2–100 characters.");
    if (!/^[A-Z0-9-]{2,20}$/.test(subjectCode)) return alert("Subject code must be 2–20 characters and use only letters, numbers, or hyphens.");
    try {
      await axios.put(`http://localhost:5000/api/admin/subject/${editingSubject._id}`,
        { ...editingSubject, subjectName, subjectCode }, authConfig);
      alert("Subject updated successfully!");
      setActiveModal(null);
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Error updating subject");
    }
  };

  const handleAssignTeacher = async (e) => {
    e.preventDefault();
    try {
      await axios.put("http://localhost:5000/api/admin/assign-subject", assignForm, authConfig);
      alert("Faculty assigned successfully! 👨‍🏫");
      setAssignForm({ subjectId: "", teacherId: "" });
      setActiveModal(null);
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Error assigning teacher");
    }
  };

  const handleAddTeacher = async (e) => {
    e.preventDefault();
    const name = teacherForm.name.trim();
    const idNo = teacherForm.id_no.trim();
    const password = teacherForm.password;
    if (name.length < 2 || name.length > 100) return alert("Faculty name must be 2–100 characters.");
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(idNo)) return alert("Faculty ID must be 3–30 characters and use only letters, numbers, hyphens, or underscores.");
    if (password.length < 6 || password.length > 100) return alert("Password must be 6–100 characters.");
    if (!teacherForm.department.trim()) return alert("Please select a course / department.");

    const body = new FormData();
    body.append("name", name);
    body.append("id_no", idNo);
    body.append("password", password);
    body.append("department", teacherForm.department.trim());
    if (teacherPhoto) body.append("profilePhoto", teacherPhoto);

    try {
      await axios.post("http://localhost:5000/api/admin/teacher", body, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });
      alert("Faculty registered! 👨‍🏫");
      setTeacherForm({ name: "", id_no: "", password: "", department: "" });
      setTeacherPhoto(null);
      const file = document.getElementById("teacherProfilePhotoInput");
      if (file) file.value = "";
      setActiveModal(null);
      loadDashboardData();
      fetchTeachers();
    } catch (err) {
      alert(err.response?.data?.message || "Error adding teacher");
    }
  };

  const handleEditTeacher = async (e) => {
    e.preventDefault();
    const name = editingTeacher.name.trim();
    const idNo = editingTeacher.id_no.trim();
    if (name.length < 2 || name.length > 100) return alert("Faculty name must be 2–100 characters.");
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(idNo)) return alert("Faculty ID must be 3–30 characters and use only letters, numbers, hyphens, or underscores.");
    if (!editingTeacher.department?.trim()) return alert("Please select a course / department.");
    try {
      await axios.put(`http://localhost:5000/api/admin/teacher/${editingTeacher._id}`,
        { ...editingTeacher, name, id_no: idNo, department: editingTeacher.department.trim() }, authConfig);
      alert("Faculty profile updated!");
      setActiveModal("viewTeachers");
      loadDashboardData();
      fetchTeachers();
    } catch (err) {
      alert(err.response?.data?.message || "Error updating teacher");
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const name = studentForm.name.trim();
    const idNo = studentForm.id_no.trim();
    const password = studentForm.password;

    if (name.length < 2 || name.length > 100) return alert("Student name must be 2–100 characters.");
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(idNo)) return alert("Enrollment number must be 3–30 characters and use only letters, numbers, hyphens, or underscores.");
    if (password.length < 6 || password.length > 100) return alert("Password must be 6–100 characters.");
    if (!studentForm.course) return alert("Please select a degree / program.");

    const body = new FormData();
    body.append("name", name);
    body.append("id_no", idNo);
    body.append("password", password);
    body.append("course", studentForm.course);
    body.append("semester", String(studentForm.semester));
    body.append("year", studentForm.year || "1st Year");
    if (studentPhoto) body.append("profilePhoto", studentPhoto);

    try {
      await axios.post("http://localhost:5000/api/admin/student", body, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });
      alert("Student enrolled successfully! 🎓");
      setStudentForm({
        name: "",
        id_no: "",
        password: "",
        course: courses[0]?.courseName || "",
        semester: 1,
        year: "1st Year",
      });
      setStudentPhoto(null);
      const file = document.getElementById("studentProfilePhotoInput");
      if (file) file.value = "";
      setActiveModal(null);
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Error enrolling student");
    }
  };

  const handleEditStudent = async (e) => {
    e.preventDefault();
    const name = editingStudent.name.trim();
    const idNo = editingStudent.id_no.trim();
    if (name.length < 2 || name.length > 100) return alert("Student name must be 2–100 characters.");
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(idNo)) return alert("Enrollment number must be 3–30 characters and use only letters, numbers, hyphens, or underscores.");
    if (!editingStudent.course) return alert("Please select a course.");
    if (!Number.isInteger(Number(editingStudent.semester)) || Number(editingStudent.semester) < 1) return alert("Please choose a valid semester.");
    try {
      await axios.put(`http://localhost:5000/api/admin/student/${editingStudent._id}`,
        { ...editingStudent, name, id_no: idNo, semester: Number(editingStudent.semester) }, authConfig);
      alert("Student record updated successfully!");
      setActiveModal("viewStudents");
      fetchStudents();
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Error updating student");
    }
  };

  const handleToggleStatus = async (id, targetRole) => {
    try {
      await axios.put(`http://localhost:5000/api/admin/toggle/${id}`, {}, authConfig);
      if (targetRole === "teacher") {
        await fetchTeachers();
      } else {
        await fetchStudents(selectedCourseFilter, selectedSemFilter);
      }
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to toggle status");
    }
  };


  const openCourseTrackerManager = async () => {
    setActiveModal("courseTrackerManager");
    setCourseTrackerSubjects(subjects || []);
    const firstSubjectId = trackerSubjectId || subjects?.[0]?._id || "";
    setTrackerSubjectId(firstSubjectId);
    if (firstSubjectId) await loadCourseTracker(firstSubjectId);
  };

  const loadCourseTracker = async (subjectId) => {
    if (!subjectId) return;
    try {
      setLoadingTracker(true);
      const res = await axios.get(`http://localhost:5000/api/admin/course-trackers/${subjectId}`, authConfig);
      const tracker = res.data;
      setTrackerUnits(
        (tracker?.units || []).map((unit) => ({
          title: unit.title || "",
          subUnits: (unit.subUnits || []).map((sub) => ({ title: sub.title || "" })),
        }))
      );
      setTrackerPublished(Boolean(tracker?.published));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to load course tracker.");
    } finally {
      setLoadingTracker(false);
    }
  };

  const addTrackerUnit = () => {
    if (trackerUnits.length >= 50) return alert("Maximum 50 units are allowed.");
    setTrackerUnits((prev) => [...prev, { title: "", subUnits: [{ title: "" }] }]);
  };

  const removeTrackerUnit = (unitIndex) => {
    setTrackerUnits((prev) => prev.filter((_, index) => index !== unitIndex));
  };

  const updateTrackerUnitTitle = (unitIndex, value) => {
    setTrackerUnits((prev) => prev.map((unit, index) => index === unitIndex ? { ...unit, title: value } : unit));
  };

  const addTrackerSubUnit = (unitIndex) => {
    setTrackerUnits((prev) => prev.map((unit, index) => index === unitIndex
      ? { ...unit, subUnits: [...unit.subUnits, { title: "" }] }
      : unit));
  };

  const removeTrackerSubUnit = (unitIndex, subIndex) => {
    setTrackerUnits((prev) => prev.map((unit, index) => index === unitIndex
      ? { ...unit, subUnits: unit.subUnits.filter((_, i) => i !== subIndex) }
      : unit));
  };

  const updateTrackerSubUnitTitle = (unitIndex, subIndex, value) => {
    setTrackerUnits((prev) => prev.map((unit, index) => index === unitIndex
      ? { ...unit, subUnits: unit.subUnits.map((sub, i) => i === subIndex ? { ...sub, title: value } : sub) }
      : unit));
  };

  const saveCourseTracker = async () => {
    if (!trackerSubjectId) return alert("Please select a subject.");
    if (trackerUnits.length === 0) return alert("Add at least one unit.");

    for (let i = 0; i < trackerUnits.length; i++) {
      const unitTitle = trackerUnits[i].title.trim();
      if (unitTitle.length < 2 || unitTitle.length > 150) return alert(`Unit ${i + 1} title must be 2-150 characters.`);
      for (let j = 0; j < trackerUnits[i].subUnits.length; j++) {
        const subTitle = trackerUnits[i].subUnits[j].title.trim();
        if (subTitle.length < 2 || subTitle.length > 150) return alert(`Subunit ${i + 1}.${j + 1} title must be 2-150 characters.`);
      }
    }

    try {
      setSavingTracker(true);
      const res = await axios.put(
        `http://localhost:5000/api/admin/course-trackers/${trackerSubjectId}`,
        {
          units: trackerUnits.map((unit) => ({ title: unit.title.trim(), subUnits: unit.subUnits.map((sub) => ({ title: sub.title.trim() })) })),
          published: trackerPublished,
        },
        authConfig
      );
      alert(res.data.message || "Course tracker saved.");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save course tracker.");
    } finally {
      setSavingTracker(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* SIDEBAR */}
      <aside className="w-72 shrink-0 bg-gradient-to-b from-orange-800 via-orange-700 to-orange-600 text-white shadow-2xl flex h-screen flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
          {/* Brand */}
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl shadow-inner">🎓</div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-extrabold tracking-tight">CampusCore</h2>
                <p className="text-[11px] font-medium text-orange-100/80">Admin Control Center</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="min-h-0 flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-100/60">Main Menu</p>
            <div className="space-y-1.5 text-sm">
              <button type="button" onClick={() => setActiveModal(null)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === null ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${activeModal === null ? "bg-orange-100" : "bg-white/10 group-hover:bg-white/15"}`}>🏠</span>
                <span>Dashboard Overview</span>
              </button>

              <button type="button" onClick={() => setActiveModal("viewCourses")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "viewCourses" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">📚</span>
                <span>View &amp; Edit Courses</span>
              </button>

              <button type="button" onClick={() => setActiveModal("addCourse")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "addCourse" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">➕</span>
                <span>Add Course</span>
              </button>

              <button type="button" onClick={() => setActiveModal("addSubject")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "addSubject" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">📝</span>
                <span>Add Subject</span>
              </button>

              <button type="button" onClick={() => setActiveModal("assignTeacher")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "assignTeacher" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">👨‍🏫</span>
                <span>Assign Subject</span>
              </button>

              <button type="button" onClick={() => { setActiveModal("viewTeachers"); fetchTeachers(); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "viewTeachers" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">🧑‍🏫</span>
                <span>View &amp; Edit Teachers</span>
              </button>

              <button type="button" onClick={() => { setActiveModal("viewStudents"); fetchStudents(); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "viewStudents" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">👨‍🎓</span>
                <span>View Students</span>
              </button>

              <div className="my-3 border-t border-white/10" />
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-100/60">Academic &amp; Services</p>

              <button type="button" onClick={() => { fetchAdminServiceRequests(); setActiveModal("adminServiceDesk"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "adminServiceDesk" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">🛠️</span>
                <span>Facility Helpdesk</span>
              </button>

              <button type="button" onClick={() => { fetchAdminCalendarEvents(); setActiveModal("adminCalendarManager"); }} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "adminCalendarManager" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">📅</span>
                <span>Manage Calendar</span>
              </button>

              <button type="button" onClick={() => setActiveModal("adminTimetableManager")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "adminTimetableManager" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">🗓️</span>
                <span>Manage Timetable</span>
              </button>

              <button type="button" onClick={() => setShowAdminAttendanceReport(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showAdminAttendanceReport ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">📊</span>
                <span>Attendance Reports</span>
              </button>

              <button type="button" onClick={() => setShowAdminResults(true)} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${showAdminResults ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">📑</span>
                <span>Result Management</span>
              </button>

              <button type="button" onClick={openCourseTrackerManager} className="group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold text-white/90 transition-all duration-200 hover:bg-white/10 hover:text-white">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">📘</span>
                <span>Course Tracker</span>
              </button>

              <button type="button" onClick={() => setActiveModal("adminAnnouncements")} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left font-semibold transition-all duration-200 ${activeModal === "adminAnnouncements" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">📢</span>
                <span>Campus Notices &amp; Events</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Bottom actions */}
        <div className="border-t border-white/10 bg-black/10 px-4 pb-4 pt-4">
          <button type="button" onClick={() => setActiveModal("adminProfile")} className={`mb-2 group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition-all duration-200 ${activeModal === "adminProfile" ? "bg-white text-orange-900 shadow-lg" : "text-white/90 hover:bg-white/10 hover:text-white"}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm group-hover:bg-white/15">⚙️</span>
            <span>Profile &amp; Security</span>
          </button>
          <button
            type="button"
            onClick={() => { localStorage.clear(); navigate("/login/admin"); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 py-3 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:bg-red-500/90 hover:shadow-xl"
          >
            <span>↪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* NAVBAR */}
        <div className="bg-white p-4 px-8 flex justify-between items-center shadow-sm border-b">
          <h1 className="text-xl font-bold text-gray-800">Admin Control Center</h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div
              onClick={() => setActiveModal("adminProfile")}
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition"
            >
            <div className="w-9 h-9 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold">
              {user?.name ? user.name.charAt(0).toUpperCase() : "A"}
            </div>
              <div>
                <span className="font-semibold text-gray-700 block text-sm">{user?.name || "CampusCore Admin"}</span>
                <span className="text-[11px] text-gray-400 block -mt-0.5">ID: {user?.id_no} • Settings</span>
              </div>
            </div>
          </div>
        </div>

        {/* WORKSPACE */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* STATS */}
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border">
              <p className="text-gray-500 text-xs font-semibold uppercase">Total Students</p>
              <h1 className="text-2xl font-extrabold text-blue-600 mt-1">{stats.students}</h1>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border">
              <p className="text-gray-500 text-xs font-semibold uppercase">Total Teachers</p>
              <h1 className="text-2xl font-extrabold text-green-600 mt-1">{stats.teachers}</h1>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border">
              <p className="text-gray-500 text-xs font-semibold uppercase">Degree Courses</p>
              <h1 className="text-2xl font-extrabold text-purple-600 mt-1">{stats.courses}</h1>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border">
              <p className="text-gray-500 text-xs font-semibold uppercase">Total Subjects</p>
              <h1 className="text-2xl font-extrabold text-orange-500 mt-1">{stats.subjects}</h1>
            </div>
          </div>

          {/* ACTION MODULE CARDS */}
          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-white p-5 rounded-xl shadow-sm border space-y-3">
              <h3 className="font-bold text-gray-800">Student Management</h3>
              <button onClick={() => setActiveModal("addStudent")} className="w-full py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 font-semibold rounded-lg text-sm transition">
                + Enroll New Student
              </button>
              <button onClick={() => { setActiveModal("viewStudents"); fetchStudents(); }} className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-lg text-sm transition">
                Filter Students (Course / Sem)
              </button>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border space-y-3">
              <h3 className="font-bold text-gray-800">Faculty Management</h3>
              <button onClick={() => setActiveModal("addTeacher")} className="w-full py-2 bg-green-50 hover:bg-green-100 text-green-700 font-semibold rounded-lg text-sm transition">
                + Add Teacher
              </button>
              <button onClick={() => { setActiveModal("viewTeachers"); fetchTeachers(); }} className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-lg text-sm transition">
                View & Edit Faculty
              </button>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border space-y-3">
              <h3 className="font-bold text-gray-800">Curriculum Management</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setActiveModal("addCourse")} className="py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded-lg text-xs transition">
                  + Add Course
                </button>
                <button onClick={() => setActiveModal("addSubject")} className="py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-xs transition">
                  + Add Subject
                </button>
              </div>
              <button onClick={openCourseTrackerManager} className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-sm transition">📘 Manage Course Tracker</button>
              <button onClick={() => setActiveModal("viewCourses")} className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-lg text-sm transition">
                View & Edit Courses
              </button>
            </div>
          </div>

          {/* MASTER SUBJECT DIRECTORY TABLE */}
          <div className="bg-white p-5 rounded-xl shadow-sm border">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-800">Master Subject Directory & Teacher Allocations</h3>
              <button onClick={() => setActiveModal("assignTeacher")} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                + Assign Teacher to Subject
              </button>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="p-3">Subject Name</th>
                  <th className="p-3">Code</th>
                  <th className="p-3">Course</th>
                  <th className="p-3">Semester</th>
                  <th className="p-3">Faculty In-Charge</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subjects.length === 0 ? (
                  <tr><td colSpan="6" className="p-4 text-center text-gray-400">No subjects configured yet.</td></tr>
                ) : (
                  subjects.map((sub) => (
                    <tr key={sub._id} className="hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-800">{sub.subjectName}</td>
                      <td className="p-3 font-mono text-xs text-gray-600">{sub.subjectCode}</td>
                      <td className="p-3 text-gray-600">{sub.course?.courseName || "General"}</td>
                      <td className="p-3 text-gray-600">Sem {sub.semester}</td>
                      <td className="p-3">
                        {sub.teacher ? (
                          <span className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full">
                            👨‍🏫 {sub.teacher.name} ({sub.teacher.id_no})
                          </span>
                        ) : (
                          <span className="text-xs bg-red-100 text-red-600 font-semibold px-2.5 py-1 rounded-full">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setEditingSubject({
                              _id: sub._id,
                              subjectName: sub.subjectName,
                              subjectCode: sub.subjectCode,
                              courseId: sub.course?._id || "",
                              semester: sub.semester,
                              credits: sub.credits || 4,
                              teacherId: sub.teacher?._id || "",
                            });
                            setActiveModal("editSubject");
                          }}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1 rounded font-semibold transition"
                        >
                          Edit
                        </button>
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

      {/* 1. VIEW FILTERED STUDENTS MODAL */}
      {activeModal === "viewStudents" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Enrolled Students ({students.length})</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border mb-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Filter by Course</label>
                <select
                  value={selectedCourseFilter}
                  onChange={(e) => setSelectedCourseFilter(e.target.value)}
                  className="w-full border rounded-lg p-2 text-xs outline-none bg-white"
                >
                  <option value="ALL">All Degree Courses</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c.courseName}>{c.courseName} ({c.courseCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Filter by Semester</label>
                <select
                  value={selectedSemFilter}
                  onChange={(e) => setSelectedSemFilter(e.target.value)}
                  className="w-full border rounded-lg p-2 text-xs outline-none bg-white"
                >
                  <option value="ALL">All Semesters</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                    <option key={num} value={num}>Semester {num}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-100 text-xs uppercase text-gray-600 border-b">
                  <tr>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">ID / Roll No</th>
                    <th className="p-2.5">Course</th>
                    <th className="p-2.5">Semester</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {students.length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-6 text-gray-400">No students match filters.</td></tr>
                  ) : (
                    students.map((s) => (
                      <tr key={s._id} className="hover:bg-gray-50">
                        <td className="p-2.5 font-medium text-gray-800">{s.name}</td>
                        <td className="p-2.5 font-mono text-gray-600 font-semibold">{s.id_no}</td>
                        <td className="p-2.5 text-gray-600">{s.course}</td>
                        <td className="p-2.5 text-gray-600">Sem {s.semester || 1}</td>
                        <td className="p-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${s.status === false ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                            {s.status === false ? "Inactive" : "Active"}
                          </span>
                        </td>
                        <td className="p-2.5 text-right space-x-2">
                          <button
                            onClick={() => {
                              setEditingStudent({
                                _id: s._id,
                                name: s.name,
                                id_no: s.id_no,
                                course: s.course,
                                semester: s.semester || 1,
                                year: s.year || calculateYearFromSem(s.semester || 1),
                              });
                              setActiveModal("editStudent");
                            }}
                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded font-semibold transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleStatus(s._id, "student")}
                            className="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded transition font-medium"
                          >
                            Toggle
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. EDIT STUDENT MODAL */}
      {activeModal === "editStudent" && editingStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Edit Student Information</h3>
              <button onClick={() => setActiveModal("viewStudents")} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleEditStudent} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Full Name</label>
                <input
                  required
                  value={editingStudent.name}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Enrollment / Roll No</label>
                <input
                  required
                  value={editingStudent.id_no}
                  onChange={(e) => setEditingStudent({ ...editingStudent, id_no: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Degree / Program</label>
                <select
                  required
                  value={editingStudent.course}
                  onChange={(e) => {
                    const selectedCourseName = e.target.value;
                    setEditingStudent({
                      ...editingStudent,
                      course: selectedCourseName,
                      semester: 1,
                      year: "1st Year",
                    });
                  }}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  {courses.map((c) => (
                    <option key={c._id} value={c.courseName}>
                      {c.courseName} ({c.courseCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Semester</label>
                  <select
                    required
                    value={editingStudent.semester}
                    onChange={(e) => {
                      const sem = Number(e.target.value);
                      setEditingStudent({
                        ...editingStudent,
                        semester: sem,
                        year: calculateYearFromSem(sem),
                      });
                    }}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    {(() => {
                      const selectedCourse = courses.find((c) => c.courseName === editingStudent.course);
                      const maxYears = selectedCourse?.durationYears || 3;
                      const totalSemesters = maxYears * 2;
                      return Array.from({ length: totalSemesters }, (_, i) => i + 1).map((sem) => (
                        <option key={sem} value={sem}>Semester {sem}</option>
                      ));
                    })()}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Academic Year</label>
                  <input
                    disabled
                    value={editingStudent.year || "1st Year"}
                    className="w-full border rounded-lg p-2 text-sm bg-gray-100 text-gray-700 font-medium outline-none cursor-not-allowed"
                  />
                </div>
              </div>
              <button type="submit" className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition">
                Update Student
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADMIN FACILITY HELPDESK MODAL */}
      {activeModal === "adminServiceDesk" && (
        <HelpdeskAdminPanel onClose={() => setActiveModal(null)} />
      )}

      {/* 4. ADMIN CALENDAR MANAGER MODAL */}
      {activeModal === "adminCalendarManager" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📅 Academic Calendar Control Center</h3>
                <p className="text-xs text-gray-500 mt-1">Add holidays, internal/external exams, events and custom calendar entries. Color is assigned automatically by event type.</p>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateCalendarEvent} className="bg-gray-50 p-4 rounded-xl border mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-gray-600 block mb-1">Event Title</label>
                <input
                  required
                  minLength="2"
                  maxLength="160"
                  type="text"
                  placeholder="e.g. Independence Day / Mid Semester Exam"
                  value={calendarForm.title}
                  onChange={(e) => setCalendarForm({ ...calendarForm, title: e.target.value })}
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-600 block mb-1">Date</label>
                <input
                  required
                  type="date"
                  value={calendarForm.date}
                  onChange={(e) => setCalendarForm({ ...calendarForm, date: e.target.value })}
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-600 block mb-1">Event Type</label>
                <select
                  value={calendarForm.category}
                  onChange={(e) => setCalendarForm({ ...calendarForm, category: e.target.value })}
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none font-medium"
                >
                  <option value="Holiday">🏖️ Holiday</option>
                  <option value="Internal Exam">📝 Internal Exam</option>
                  <option value="External Exam">📚 External Exam</option>
                  <option value="Event">🎉 Event</option>
                  <option value="Seminar">🎤 Seminar</option>
                  <option value="Sports Event">⚽ Sports Event</option>
                  <option value="Hackathon">💻 Hackathon</option>
                  <option value="Workshop">🛠️ Workshop</option>
                  <option value="Assignment Deadline">📘 Assignment Deadline</option>
                  <option value="Quiz">🎯 Quiz</option>
                  <option value="Other">✏️ Other</option>
                </select>
              </div>

              {calendarForm.category === "Other" && (
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-gray-600 block mb-1">Custom Event Type</label>
                  <input
                    required
                    minLength="2"
                    maxLength="80"
                    value={calendarForm.customCategory}
                    onChange={(e) => setCalendarForm({ ...calendarForm, customCategory: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs bg-white outline-none"
                    placeholder="e.g. Fresher Orientation"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-gray-600 block mb-1">Event Color</label>
                <div className="flex items-center gap-2 border rounded-lg p-2 bg-white text-xs text-gray-500">
                  <span
                    className="inline-block w-5 h-5 rounded-full border"
                    style={{
                      backgroundColor: ({
                        "Holiday": "#16A34A",
                        "Internal Exam": "#DC2626",
                        "External Exam": "#EA580C",
                        "Event": "#2563EB",
                        "Seminar": "#7C3AED",
                        "Sports Event": "#9333EA",
                        "Hackathon": "#0891B2",
                        "Workshop": "#CA8A04",
                        "Assignment Deadline": "#0EA5E9",
                        "Quiz": "#DB2777",
                        "Other": "#64748B",
                      }[calendarForm.category] || "#64748B"),
                    }}
                  />
                  <span>Automatic for selected event type</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-600 block mb-1">Target Course</label>
                <select
                  value={calendarForm.targetCourse}
                  onChange={(e) => setCalendarForm({ ...calendarForm, targetCourse: e.target.value })}
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none"
                >
                  <option value="ALL">All College</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c.courseName}>{c.courseName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-600 block mb-1">Target Semester</label>
                <select
                  value={calendarForm.targetSemester}
                  onChange={(e) => setCalendarForm({ ...calendarForm, targetSemester: Number(e.target.value) })}
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none"
                >
                  <option value={0}>All Semesters</option>
                  {[1,2,3,4,5,6,7,8].map((sem) => (
                    <option key={sem} value={sem}>Semester {sem}</option>
                  ))}
                </select>
              </div>

              <div>
                <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg text-xs transition">
                  + Add Calendar Event
                </button>
              </div>
            </form>

            <div className="overflow-y-auto flex-1 border rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 text-gray-700 uppercase sticky top-0">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th>Event</th>
                    <th>Type</th>
                    <th>Color</th>
                    <th>Target</th>
                    <th className="text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {adminCalendarEvents.length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-6 text-gray-400">No scheduled calendar items.</td></tr>
                  ) : (
                    adminCalendarEvents.map((ev) => (
                      <tr key={ev._id} className="hover:bg-gray-50">
                        <td className="p-2.5 font-semibold">{new Date(ev.date).toLocaleDateString()}</td>
                        <td className="font-medium text-gray-800">{ev.title}</td>
                        <td>
                          <span className="font-bold" style={{ color: ev.color || "#3B82F6" }}>
                            {ev.category === "Other" && ev.customCategory ? ev.customCategory : ev.category}
                          </span>
                        </td>
                        <td>
                          <span className="inline-block w-4 h-4 rounded-full border" style={{ backgroundColor: ev.color || "#3B82F6" }} title={ev.color || "#3B82F6"} />
                        </td>
                        <td className="text-gray-500">{ev.targetCourse || "ALL"}{Number(ev.targetSemester || 0) ? ` • Sem ${ev.targetSemester}` : ""}</td>
                        <td className="text-right pr-4">
                          <button
                            type="button"
                            onClick={() => handleDeleteCalendarEvent(ev._id)}
                            className="bg-red-50 text-red-600 font-semibold px-2.5 py-1 rounded border border-red-200 hover:bg-red-100 transition"
                          >
                            Delete 🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeModal === "adminTimetableManager" && (
        <AdminTimetablePanel onClose={() => setActiveModal(null)} />
      )}

      {showAdminAttendanceReport && (
        <AdminAttendanceReportPanel
          courses={courses}
          subjects={subjects}
          onClose={() => setShowAdminAttendanceReport(false)}
        />
      )}

      {showAdminResults && (
        <AdminResultPanel
          courses={courses}
          subjects={subjects}
          onClose={() => setShowAdminResults(false)}
        />
      )}

      {/* 5. VIEW TEACHERS MODAL */}
      {activeModal === "viewTeachers" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Faculty Members ({teachers.length})</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase border-b text-gray-500">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Faculty ID</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {teachers.map((t) => (
                    <tr key={t._id} className="hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-800">{t.name}</td>
                      <td className="p-3 font-mono text-gray-600 font-semibold">{t.id_no}</td>
                      <td className="p-3 text-gray-600">{t.department}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${t.status === false ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                          {t.status === false ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingTeacher({ _id: t._id, name: t.name, id_no: t.id_no, department: t.department });
                            setActiveModal("editTeacher");
                          }}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded font-semibold transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleStatus(t._id, "teacher")}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded transition font-medium"
                        >
                          Toggle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. EDIT TEACHER MODAL */}
      {activeModal === "editTeacher" && editingTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Edit Faculty Profile</h3>
              <button onClick={() => setActiveModal("viewTeachers")} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleEditTeacher} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Full Name</label>
                <input
                  required
                  value={editingTeacher.name}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Faculty ID Number <span className="text-gray-400 font-normal">(auto-suggested • editable)</span></label>
                <input
                  required
                  value={editingTeacher.id_no}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, id_no: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Course / Department</label>
                <select
                  required
                  value={editingTeacher.department}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, department: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="">-- Select Course / Program --</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c.courseName}>
                      {c.courseName} ({c.courseCode})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition">
                Update Teacher
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 7. VIEW & EDIT COURSES MODAL */}
      {activeModal === "viewCourses" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Registered Degrees & Courses ({courses.length})</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase border-b text-gray-500">
                  <tr>
                    <th className="p-3">Course Name</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {courses.map((c) => (
                    <tr key={c._id} className="hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-800">{c.courseName}</td>
                      <td className="p-3 font-mono text-xs text-gray-600">{c.courseCode}</td>
                      <td className="p-3 text-gray-600">{c.durationYears} Years</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setEditingCourse({ _id: c._id, courseName: c.courseName, courseCode: c.courseCode, durationYears: c.durationYears });
                            setActiveModal("editCourse");
                          }}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1 rounded font-semibold transition"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 8. EDIT COURSE MODAL */}
      {activeModal === "editCourse" && editingCourse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Edit Degree Course</h3>
              <button onClick={() => setActiveModal("viewCourses")} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleEditCourse} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Course Name</label>
                <input
                  required
                  value={editingCourse.courseName}
                  onChange={(e) => setEditingCourse({ ...editingCourse, courseName: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Course Code</label>
                <input
                  required
                  value={editingCourse.courseCode}
                  onChange={(e) => setEditingCourse({ ...editingCourse, courseCode: e.target.value.toUpperCase() })}
                  className="w-full border rounded-lg p-2 text-sm uppercase outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Duration (Years)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={editingCourse.durationYears}
                  onChange={(e) => setEditingCourse({ ...editingCourse, durationYears: Number(e.target.value) })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <button type="submit" className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition">
                Update Course
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 9. EDIT SUBJECT MODAL */}
      {activeModal === "editSubject" && editingSubject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Edit Subject Details</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleEditSubject} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Subject Name</label>
                <input
                  required
                  value={editingSubject.subjectName}
                  onChange={(e) => setEditingSubject({ ...editingSubject, subjectName: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Subject Code</label>
                <input
                  required
                  value={editingSubject.subjectCode}
                  onChange={(e) => setEditingSubject({ ...editingSubject, subjectCode: e.target.value.toUpperCase() })}
                  className="w-full border rounded-lg p-2 text-sm uppercase outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Belongs to Degree / Course</label>
                <select
                  required
                  value={editingSubject.courseId}
                  onChange={(e) => setEditingSubject({ ...editingSubject, courseId: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Choose Course --</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>{c.courseName} ({c.courseCode})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Semester</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={editingSubject.semester}
                    onChange={(e) => setEditingSubject({ ...editingSubject, semester: Number(e.target.value) })}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Credits</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editingSubject.credits}
                    onChange={(e) => setEditingSubject({ ...editingSubject, credits: Number(e.target.value) })}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Faculty In-Charge</label>
                <select
                  value={editingSubject.teacherId}
                  onChange={(e) => setEditingSubject({ ...editingSubject, teacherId: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Unassigned --</option>
                  {teachers.map((t) => (
                    <option key={t._id} value={t._id}>{t.name} ({t.id_no})</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition">
                Update Subject
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 10. ADD COURSE MODAL */}
      {activeModal === "addCourse" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Add Course</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleAddCourse} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Course Name</label>
                <input
                  required
                  minLength="3"
                  maxLength="100"
                  placeholder="e.g. Master of Computer Applications"
                  value={courseForm.courseName}
                  onChange={(e) => setCourseForm({ ...courseForm, courseName: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Course Code</label>
                <input
                  required
                  minLength="2"
                  maxLength="20"
                  pattern="[A-Za-z0-9-]+"
                  placeholder="e.g. MCA"
                  value={courseForm.courseCode}
                  onChange={(e) => setCourseForm({ ...courseForm, courseCode: e.target.value.toUpperCase() })}
                  className="w-full border rounded-lg p-2 text-sm uppercase outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Duration (in Years)</label>
                <select
                  required
                  value={courseForm.durationYears}
                  onChange={(e) => setCourseForm({ ...courseForm, durationYears: Number(e.target.value) })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value={1}>1 Year (2 Semesters)</option>
                  <option value={2}>2 Years (4 Semesters)</option>
                  <option value={3}>3 Years (6 Semesters)</option>
                  <option value={4}>4 Years (8 Semesters)</option>
                  <option value={5}>5 Years (10 Semesters)</option>
                </select>
              </div>
              <button type="submit" className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition">
                Create Course
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 11. ADD SUBJECT MODAL */}
      {activeModal === "addSubject" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Add Subject</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <form onSubmit={handleAddSubject} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Subject Name</label>
                <input
                  required
                  minLength="2"
                  maxLength="100"
                  placeholder="e.g. JAVA"
                  value={subjectForm.subjectName}
                  onChange={(e) => setSubjectForm({ ...subjectForm, subjectName: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Subject Code</label>
                <input
                  required
                  minLength="2"
                  maxLength="20"
                  pattern="[A-Za-z0-9-]+"
                  placeholder="e.g. MCA02"
                  value={subjectForm.subjectCode}
                  onChange={(e) => setSubjectForm({ ...subjectForm, subjectCode: e.target.value.toUpperCase() })}
                  className="w-full border rounded-lg p-2 text-sm uppercase outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Select Degree / Course</label>
                <select
                  required
                  value={subjectForm.courseId}
                  onChange={(e) => setSubjectForm({ ...subjectForm, courseId: e.target.value, semester: 1, teacherId: "" })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="">-- Choose Course --</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.courseName} ({c.courseCode}) - {c.durationYears || 3} Years
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Semester</label>
                  <select
                    required
                    value={subjectForm.semester}
                    onChange={(e) => setSubjectForm({ ...subjectForm, semester: Number(e.target.value) })}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    {(() => {
                      const selectedCourse = courses.find((c) => c._id === subjectForm.courseId);
                      const maxYears = selectedCourse?.durationYears || 3;
                      const totalSemesters = maxYears * 2;
                      return Array.from({ length: totalSemesters }, (_, i) => i + 1).map((sem) => (
                        <option key={sem} value={sem}>Semester {sem}</option>
                      ));
                    })()}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Credits</label>
                  <select
                    required
                    value={subjectForm.credits}
                    onChange={(e) => setSubjectForm({ ...subjectForm, credits: Number(e.target.value) })}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6].map((credit) => (
                      <option key={credit} value={credit}>{credit} {credit === 1 ? "Credit" : "Credits"}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Assign Faculty (Filtered by Department / Course)</label>
                <select
                  value={subjectForm.teacherId}
                  onChange={(e) => setSubjectForm({ ...subjectForm, teacherId: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="">-- Assign Later --</option>
                  {(() => {
                    const selectedCourse = courses.find((c) => c._id === subjectForm.courseId);
                    const matchingTeachers = teachers.filter((t) => {
                      if (!selectedCourse) return false;
                      const dept = (t.department || "").trim().toLowerCase();
                      const courseName = (selectedCourse.courseName || "").trim().toLowerCase();
                      const courseCode = (selectedCourse.courseCode || "").trim().toLowerCase();
                      return dept === courseName || dept === courseCode;
                    });

                    if (matchingTeachers.length === 0) {
                      return <option value="" disabled>⚠️ No teachers registered under this course</option>;
                    }

                    return matchingTeachers.map((t) => (
                      <option key={t._id} value={t._id}>{t.name} ({t.id_no})</option>
                    ));
                  })()}
                </select>
              </div>
              <button type="submit" className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition">
                Save Subject
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 12. ASSIGN TEACHER MODAL */}
      {activeModal === "assignTeacher" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Assign Faculty to Subject</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <form onSubmit={handleAssignTeacher} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Select Subject</label>
                <select
                  required
                  value={assignForm.subjectId}
                  onChange={(e) => setAssignForm({ subjectId: e.target.value, teacherId: "" })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="">-- Choose Subject --</option>
                  {subjects.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.subjectName} ({s.subjectCode}) [{s.course?.courseName || s.course?.courseCode || "General"}]
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Select Teacher (Filtered by Course/Department)</label>
                <select
                  required
                  disabled={!assignForm.subjectId}
                  value={assignForm.teacherId}
                  onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">{!assignForm.subjectId ? "-- Select a Subject First --" : "-- Choose Faculty Member --"}</option>
                  {(() => {
                    if (!assignForm.subjectId) return null;
                    const chosenSubject = subjects.find((s) => s._id === assignForm.subjectId);
                    const courseName = (chosenSubject?.course?.courseName || "").trim().toLowerCase();
                    const courseCode = (chosenSubject?.course?.courseCode || "").trim().toLowerCase();

                    const matchingTeachers = teachers.filter((t) => {
                      const dept = (t.department || "").trim().toLowerCase();
                      return dept === courseName || dept === courseCode;
                    });

                    if (matchingTeachers.length === 0) {
                      return <option value="" disabled>⚠️ No teachers registered under {chosenSubject?.course?.courseName || "this course"}</option>;
                    }

                    return matchingTeachers.map((t) => (
                      <option key={t._id} value={t._id}>👨‍🏫 {t.name} (ID: {t.id_no})</option>
                    ));
                  })()}
                </select>
              </div>
              <button
                type="submit"
                disabled={!assignForm.subjectId || !assignForm.teacherId}
                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Allocation
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 13. ENROLL STUDENT MODAL */}
      {activeModal === "addStudent" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Enroll Student</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Full Name</label>
                <input
                  required
                  minLength="2"
                  maxLength="100"
                  placeholder="Student Full Name"
                  value={studentForm.name}
                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600">Enrollment Number</label>
                  <span className="text-[10px] font-semibold text-orange-600">Auto-suggested • editable</span>
                </div>
                <input
                  required
                  minLength="3"
                  maxLength="30"
                  pattern="[A-Za-z0-9_-]+"
                  placeholder="e.g. STU0007"
                  value={studentForm.id_no}
                  onChange={(e) => setStudentForm({ ...studentForm, id_no: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Password</label>
                <input
                  
                  type="password"
                  required
                  minLength="6"
                  maxLength="100"
                  placeholder="Password (min. 6 characters)"
                  value={studentForm.password}
                  onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Student Profile Photo <span className="text-gray-400">(optional)</span></label>
                <input
                  id="studentProfilePhotoInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return setStudentPhoto(null);
                    if (file.size > 5 * 1024 * 1024) {
                      alert("Profile photo must be 5 MB or smaller.");
                      e.target.value = "";
                      setStudentPhoto(null);
                      return;
                    }
                    setStudentPhoto(file);
                  }}
                  className="w-full text-xs text-gray-600"
                />
                <p className="text-[10px] text-gray-500 mt-1">JPG, PNG or WEBP • max 5 MB</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Degree / Program</label>
                <select
                  required
                  value={studentForm.course}
                  onChange={(e) => {
                    const selectedCourseName = e.target.value;
                    setStudentForm({
                      ...studentForm,
                      course: selectedCourseName,
                      semester: 1,
                      year: "1st Year",
                    });
                  }}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  <option value="">-- Choose Course --</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c.courseName}>
                      {c.courseName} ({c.courseCode}) - {c.durationYears || 3} Years
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Semester</label>
                  <select
                    required
                    value={studentForm.semester}
                    onChange={(e) => {
                      const sem = Number(e.target.value);
                      setStudentForm({
                        ...studentForm,
                        semester: sem,
                        year: calculateYearFromSem(sem),
                      });
                    }}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    {(() => {
                      const selectedCourse = courses.find((c) => c.courseName === studentForm.course);
                      const maxYears = selectedCourse?.durationYears || 3;
                      const totalSemesters = maxYears * 2;
                      return Array.from({ length: totalSemesters }, (_, i) => i + 1).map((sem) => (
                        <option key={sem} value={sem}>Semester {sem}</option>
                      ));
                    })()}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Academic Year</label>
                  <input
                    disabled
                    value={studentForm.year || "1st Year"}
                    className="w-full border rounded-lg p-2 text-sm bg-gray-100 text-gray-700 font-medium outline-none cursor-not-allowed"
                  />
                </div>
              </div>
              <button type="submit" className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition">
                Enroll Student
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 14. ADD TEACHER MODAL */}
      {activeModal === "addTeacher" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Add Teacher</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <form onSubmit={handleAddTeacher} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Faculty Full Name</label>
                <input
                  required
                  minLength="2"
                  maxLength="100"
                  placeholder="e.g. Dr. Patel"
                  value={teacherForm.name}
                  onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Faculty ID Number</label>
                <input
                  required
                  minLength="3"
                  maxLength="30"
                  pattern="[A-Za-z0-9_-]+"
                  placeholder="e.g. TEA001"
                  value={teacherForm.id_no}
                  onChange={(e) => setTeacherForm({ ...teacherForm, id_no: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Password</label>
                <input
                  required
                  type="password"
                  minLength="6"
                  maxLength="100"
                  placeholder="Password (min. 6 characters)"
                  value={teacherForm.password}
                  onChange={(e) => setTeacherForm({ ...teacherForm, password: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Faculty Profile Photo <span className="text-gray-400">(optional)</span></label>
                <input
                  id="teacherProfilePhotoInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return setTeacherPhoto(null);
                    if (file.size > 5 * 1024 * 1024) {
                      alert("Profile photo must be 5 MB or smaller.");
                      e.target.value = "";
                      setTeacherPhoto(null);
                      return;
                    }
                    setTeacherPhoto(file);
                  }}
                  className="w-full text-xs text-gray-600"
                />
                <p className="text-[10px] text-gray-500 mt-1">JPG, PNG or WEBP • max 5 MB</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Course / Department</label>
                <select
                  required
                  value={teacherForm.department}
                  onChange={(e) => setTeacherForm({ ...teacherForm, department: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="">-- Select Course / Program --</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c.courseName}>
                      {c.courseName} ({c.courseCode})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition">
                Register Faculty
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 15. ADMIN PROFILE & SECURITY MODAL */}



      {activeModal === "adminAnnouncements" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  📢 Campus Notices & Events
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Publish hackathons, sports events, seminars, fees, exams, holidays, circulars and important campus information.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendAnnouncement} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Notice / Event Title
                  </label>
                  <input
                    required
                    minLength="2"
                    maxLength="160"
                    value={announcementForm.title}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        title: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm"
                    placeholder="e.g. Annual Coding Hackathon 2026"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Type
                  </label>
                  <select
                    value={announcementForm.type}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        type: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm bg-white"
                  >
                    <option>Announcement</option>
                    <option>Hackathon</option>
                    <option>Sports Event</option>
                    <option>Seminar</option>
                    <option>Workshop</option>
                    <option>Cultural Event</option>
                    <option>Exam</option>
                    <option>Fees</option>
                    <option>Holiday</option>
                    <option>Circular</option>
                    <option>Important Notice</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Full Message
                </label>
                <textarea
                  required
                  minLength="2"
                  maxLength="5000"
                  rows="7"
                  value={announcementForm.message}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      message: e.target.value,
                    })
                  }
                  className="w-full border rounded-lg p-2.5 text-sm resize-y"
                  placeholder="Write the complete notice. Long messages are supported."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Event Date <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={announcementForm.eventDate}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        eventDate: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Venue <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    maxLength="200"
                    value={announcementForm.venue}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        venue: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm"
                    placeholder="Seminar Hall / College Ground"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Start Time <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="time"
                    value={announcementForm.startTime}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        startTime: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    End Time <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="time"
                    value={announcementForm.endTime}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        endTime: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Audience
                  </label>
                  <select
                    value={announcementForm.audience}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        audience: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm bg-white"
                  >
                    <option value="students">Students only</option>
                    <option value="all">Students + Teachers</option>
                    <option value="teachers">Teachers only</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Course
                  </label>
                  <select
                    value={announcementForm.targetCourse}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        targetCourse: e.target.value,
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm bg-white"
                  >
                    <option value="ALL">All Courses</option>
                    {courses.map((course) => (
                      <option key={course._id} value={course.courseName}>
                        {course.courseName} ({course.courseCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Semester
                  </label>
                  <select
                    value={announcementForm.targetSemester}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        targetSemester: Number(e.target.value),
                      })
                    }
                    className="w-full border rounded-lg p-2.5 text-sm bg-white"
                  >
                    <option value={0}>All Semesters</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => (
                      <option key={semester} value={semester}>
                        Semester {semester}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Photo / PDF Attachment{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>

                <input
                  id="adminAnnouncementAttachment"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    setAnnouncementFile(e.target.files?.[0] || null)
                  }
                  className="w-full text-xs"
                />

                <p className="text-[10px] text-gray-500 mt-1">
                  PDF / JPG / PNG / WEBP • max 10 MB
                </p>
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
                Publishing with an event date automatically adds that date to the student academic calendar and sends the notice through the notification bell.
              </div>

              <button
                type="submit"
                disabled={sendingAnnouncement}
                className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg font-semibold"
              >
                {sendingAnnouncement
                  ? "Publishing..."
                  : "Publish Notice & Notify 📢"}
              </button>
            </form>
          </div>
        </div>
      )}


      {activeModal === "courseTrackerManager" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📘 Course Tracker Manager</h3>
                <p className="text-xs text-gray-500">Create units and subunits that students can mark as completed.</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="grid md:grid-cols-[1fr_auto] gap-3 mb-4">
              <select
                value={trackerSubjectId}
                onChange={async (e) => { setTrackerSubjectId(e.target.value); await loadCourseTracker(e.target.value); }}
                className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
              >
                <option value="">-- Select Subject --</option>
                {courseTrackerSubjects.map((sub) => (
                  <option key={sub._id} value={sub._id}>{sub.subjectCode} - {sub.subjectName} (Sem {sub.semester})</option>
                ))}
              </select>
              <label className="flex items-center gap-2 border rounded-lg px-3 text-sm font-semibold">
                <input type="checkbox" checked={trackerPublished} onChange={(e) => setTrackerPublished(e.target.checked)} />
                Publish to students
              </label>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {loadingTracker ? (
                <p className="text-center text-gray-400 py-10">Loading tracker...</p>
              ) : trackerUnits.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-gray-400">
                  No units yet. Click <b>Add Unit</b> to start.
                </div>
              ) : (
                trackerUnits.map((unit, unitIndex) => (
                  <div key={unitIndex} className="border rounded-xl p-4 bg-gray-50">
                    <div className="flex gap-2 items-center mb-3">
                      <span className="text-xs font-bold text-gray-500 w-12">Unit {unitIndex + 1}</span>
                      <input
                        value={unit.title}
                        onChange={(e) => updateTrackerUnitTitle(unitIndex, e.target.value)}
                        placeholder="e.g. Introduction to DBMS"
                        maxLength={150}
                        className="flex-1 border rounded-lg p-2 text-sm bg-white outline-none"
                      />
                      <button type="button" onClick={() => removeTrackerUnit(unitIndex)} className="text-xs bg-red-50 text-red-600 px-3 py-2 rounded-lg font-semibold">Remove</button>
                    </div>
                    <div className="space-y-2 ml-12">
                      {unit.subUnits.map((sub, subIndex) => (
                        <div key={subIndex} className="flex gap-2 items-center">
                          <span className="text-xs text-gray-400 w-12">{unitIndex + 1}.{subIndex + 1}</span>
                          <input
                            value={sub.title}
                            onChange={(e) => updateTrackerSubUnitTitle(unitIndex, subIndex, e.target.value)}
                            placeholder="Subunit topic"
                            maxLength={150}
                            className="flex-1 border rounded-lg p-2 text-sm bg-white outline-none"
                          />
                          <button type="button" onClick={() => removeTrackerSubUnit(unitIndex, subIndex)} className="text-xs text-red-500 px-2">✕</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addTrackerSubUnit(unitIndex)} className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-semibold">+ Add Subunit</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between gap-2 mt-4 pt-4 border-t">
              <button type="button" onClick={addTrackerUnit} className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold">+ Add Unit</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setActiveModal(null)} className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-semibold">Cancel</button>
                <button type="button" disabled={savingTracker} onClick={saveCourseTracker} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold">{savingTracker ? "Saving..." : "Save Tracker"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === "adminProfile" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Admin Profile Settings</h3>
                <p className="text-xs text-gray-500">Security verification required to save profile updates</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            {isEditingAdminProfile ? (
<form onSubmit={handleUpdateAdminProfile} className="space-y-3">                <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Admin ID</label>
                <input
                  disabled
                  value={user.id_no || ""}
                  className="w-full border rounded-lg p-2 text-sm bg-gray-100 text-gray-500 outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  readOnly
                  type="text"
                  value={adminProfileForm.name}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="email"
                  value={adminProfileForm.email}
                  onChange={(e) => setAdminProfileForm({ ...adminProfileForm, email: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
  type="button"
  onClick={() => {
    if (showPasswordFields) {
      setAdminProfileForm((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
    }

    setShowPasswordFields((prev) => !prev);
  }}
  className="w-full rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-left text-sm font-semibold text-blue-700"
>
  {showPasswordFields
    ? "🔒 Hide Password Change"
    : "🔒 Change Password"}
</button>
{showPasswordFields && (
              <div className="pt-3 border-t space-y-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                  
                  Password Verification <span className="text-red-500">*</span>
                </p>
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-0.5">Current Password</label>
                  <input
                    required
                    type="password"
                    placeholder="Enter current password"
                    value={adminProfileForm.currentPassword}
                    onChange={(e) => setAdminProfileForm({ ...adminProfileForm, currentPassword: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-0.5">New Password</label>
                  <input
                    
                    type="password"
                    placeholder="Enter new password (min. 6 chars)"
                    value={adminProfileForm.newPassword}
                    onChange={(e) => setAdminProfileForm({ ...adminProfileForm, newPassword: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
  <label className="text-[11px] font-semibold text-gray-600 block mb-0.5">
    Confirm New Password
  </label>

  <input
    type="password"
    placeholder="Re-enter new password"
    value={adminProfileForm.confirmPassword}
    onChange={(e) =>
      setAdminProfileForm({
        ...adminProfileForm,
        confirmPassword: e.target.value,
      })
    }
    className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
  />
</div>
              </div>
)}
              <button
  type="button"
  onClick={() => {
    setAdminProfileForm((prev) => ({
      ...prev,
      name: user?.name || "",
      email: user?.email || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    }));
    setIsEditingAdminProfile(false);
  }}
  className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold transition hover:bg-gray-50 mb-2"
>
  Cancel
</button>

              <button
                type="submit"
                className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition mt-4 shadow"
              >
                Save Changes
              </button>
            </form>

) : (
  <div className="space-y-4 px-6 py-6">

    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Admin ID
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
        Email Address
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
        {user?.role || "admin"}
      </p>
    </div>

    <button
      type="button"
      onClick={() => {
        setAdminProfileForm((prev) => ({
          ...prev,
          name: user?.name || "",
          email: user?.email || "",
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }));
        setShowPasswordFields(false);
        setIsEditingAdminProfile(true);
      }}
      className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-700"
    >
      ✏️ Edit Profile
    </button>

  </div>
)}
          </div>
        </div>
      )}
    </div>
  );
}