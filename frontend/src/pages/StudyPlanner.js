import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const getLocalDateString = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
};

const formatDate = (dateLike) => {
  if (!dateLike) return "";
  const date = new Date(`${dateLike}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const addDaysToDateString = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
};

const diffDays = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return -1;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
};

export default function StudyPlanner() {
  const navigate = useNavigate();
  const today = getLocalDateString();

  const [mode, setMode] = useState("exam");
  const [examFile, setExamFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [examSchedule, setExamSchedule] = useState([]);
  const [dailyTime, setDailyTime] = useState("");
  const [targetMarks, setTargetMarks] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [planDays, setPlanDays] = useState("7");
  const [generating, setGenerating] = useState(false);
  const [studyPlan, setStudyPlan] = useState([]);
  const [completedTasks, setCompletedTasks] = useState({});
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [savedPlanLoaded, setSavedPlanLoaded] = useState(false);
  const [savedPlanInfo, setSavedPlanInfo] = useState(null);

  const authConfig = () => {
    const token = localStorage.getItem("token");
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  };

  const fetchCurrentPlan = async (token) => {
    try {
      const response = await axios.get(
        "http://localhost:5000/api/study-planner/current",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      return response.data.data || null;
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error("Failed to load saved study plan:", error);
      }
      return null;
    }
  };

  useEffect(() => {
    const loadPage = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          alert("Session expired. Please login again.");
          navigate("/login/student");
          return;
        }

        const [dashboardResponse, currentPlan] = await Promise.all([
          axios.get("http://localhost:5000/api/student/dashboard-data", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetchCurrentPlan(token),
        ]);

        const fetchedSubjects = (dashboardResponse.data.mySubjects || []).map(
          (subject) => ({
            name: subject.subjectName || "",
            progress: "",
            selected: true,
          })
        );

        if (currentPlan?.subjects?.length) {
          const savedSubjects = currentPlan.subjects;
          fetchedSubjects.forEach((subject, index) => {
            const saved = savedSubjects.find(
              (item) =>
                String(item.name || "").trim().toLowerCase() ===
                String(subject.name || "").trim().toLowerCase()
            );

            if (saved) {
              fetchedSubjects[index] = {
                ...subject,
                progress: saved.progress,
                selected: saved.selected !== false,
              };
            }
          });
        }

        setSubjects(fetchedSubjects);
        setPendingAssignments(
          dashboardResponse.data.pendingAssignments || []
        );

        if (currentPlan?.plan?.length) {
          setStudyPlan(currentPlan.plan);
          setMode(currentPlan.mode || "exam");
          setStartDate(
            currentPlan.planStartDate
              ? new Date(currentPlan.planStartDate)
                  .toISOString()
                  .split("T")[0]
              : today
          );
          setPlanDays(
            String(currentPlan.planDays || currentPlan.plan.length)
          );
          setDailyTime(String(currentPlan.dailyStudyMinutes || ""));
          setTargetMarks(String(currentPlan.targetMarks || ""));
          setExamSchedule(currentPlan.examSchedule || []);
          setSavedPlanInfo(currentPlan);
          setSavedPlanLoaded(true);

          const loadedCompleted = {};
          (currentPlan.completedTasks || []).forEach((key) => {
            loadedCompleted[String(key)] = true;
          });
          setCompletedTasks(loadedCompleted);
        }
      } catch (error) {
        console.error("Failed to load study planner:", error);
        alert(
          error.response?.data?.message ||
            "Failed to load your study planner data."
        );
      } finally {
        setLoadingSubjects(false);
      }
    };

    loadPage();
  }, [navigate]);

  const handleSubjectChange = (index, field, value) => {
    const updated = [...subjects];
    updated[index][field] = value;
    setSubjects(updated);
  };

  const removeSubject = (index) => {
    if (subjects.length === 1) return;
    setSubjects(subjects.filter((_, i) => i !== index));
  };

  const handleExamTimetableUpload = async () => {
    if (!examFile) {
      alert("Please select an exam timetable first.");
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(examFile.type)) {
      alert("Only PDF, JPG, PNG or WEBP files are allowed.");
      return;
    }

    if (examFile.size > 10 * 1024 * 1024) {
      alert("Exam timetable must be smaller than 10 MB.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      alert("Session expired. Please login again.");
      navigate("/login/student");
      return;
    }

    const formData = new FormData();
    formData.append("examTimetable", examFile);

    try {
      const response = await axios.post(
        "http://localhost:5000/api/study-planner/upload-exam-timetable",
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert(
        response.data.message ||
          "Exam timetable uploaded successfully."
      );
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Failed to upload exam timetable."
      );
    }
  };

  const handleAnalyzeTimetable = async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Session expired. Please login again.");
      navigate("/login/student");
      return;
    }

    if (!examFile) {
      alert("Please select an exam timetable first.");
      return;
    }

    try {
      setAnalyzing(true);

      const response = await axios.post(
        "http://localhost:5000/api/study-planner/analyze-exam-timetable",
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const exams = response.data.examSchedule || [];

      if (exams.length === 0) {
        alert("No valid exam entries were found in the timetable.");
        setExamSchedule([]);
        return;
      }

      setExamSchedule(exams);
      alert(
        `AI found ${exams.length} exam entr${
          exams.length === 1 ? "y" : "ies"
        } successfully. 🤖`
      );
    } catch (error) {
      console.error("Timetable Analysis Error:", error);
      alert(
        error.response?.data?.message ||
          "Failed to analyze exam timetable."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();

    const time = Number(dailyTime);
    if (!Number.isInteger(time) || time < 30 || time > 1440) {
      alert("Please enter daily study time between 30 and 1440 minutes.");
      return;
    }

    const marks = Number(targetMarks);
    if (!Number.isInteger(marks) || marks < 1 || marks > 100) {
      alert("Target marks must be between 1 and 100.");
      return;
    }

    const selectedPlanDays = Number(planDays);
    if (
      !Number.isInteger(selectedPlanDays) ||
      selectedPlanDays < 1 ||
      selectedPlanDays > 7
    ) {
      alert("Study plan duration must be between 1 and 7 days.");
      return;
    }

    if (!startDate) {
      alert("Please select a start date.");
      return;
    }

    const selectedStartDate = new Date(`${startDate}T00:00:00`);
    const currentDate = new Date(`${today}T00:00:00`);

    if (Number.isNaN(selectedStartDate.getTime())) {
      alert("Please select a valid start date.");
      return;
    }

    if (selectedStartDate < currentDate) {
      alert("Start date cannot be in the past.");
      return;
    }

    if (mode === "exam") {
      if (!examFile && examSchedule.length === 0) {
        alert("Please upload and analyze your exam timetable.");
        return;
      }
    }

    const selectedSubjects = subjects.filter(
      (subject) => subject.selected !== false
    );

    if (selectedSubjects.length === 0) {
      alert("Please select at least one subject for your study plan.");
      return;
    }

    for (let i = 0; i < selectedSubjects.length; i++) {
      const subjectName = String(selectedSubjects[i].name || "").trim();
      const progress = Number(selectedSubjects[i].progress);

      if (!subjectName) {
        alert(`Please enter a name for Subject ${i + 1}.`);
        return;
      }

      if (subjectName.length < 2 || subjectName.length > 100) {
        alert(`Subject ${i + 1} name must be between 2 and 100 characters.`);
        return;
      }

      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        alert(`Subject ${i + 1} progress must be between 0 and 100%.`);
        return;
      }
    }

    const subjectNames = selectedSubjects.map((subject) =>
      String(subject.name || "").trim().toLowerCase()
    );

    if (new Set(subjectNames).size !== subjectNames.length) {
      alert("Duplicate subjects are not allowed.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      alert("Session expired. Please login again.");
      navigate("/login/student");
      return;
    }

    const selectedForPlan = selectedSubjects.map((subject) => ({
      name: String(subject.name).trim(),
      progress: Number(subject.progress),
      selected: true,
    }));

    try {
      setGenerating(true);

      const response = await axios.post(
        "http://localhost:5000/api/study-planner/generate",
        {
          mode,
          startDate,
          planDays: selectedPlanDays,
          dailyStudyMinutes: time,
          targetMarks: marks,
          subjects: selectedForPlan,
          pendingAssignments,
          examSchedule,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = response.data.data;
      const nextPlan = data?.plan || [];

      setStudyPlan(nextPlan);
      setCompletedTasks({});
      setSavedPlanInfo(data || null);
      setSavedPlanLoaded(Boolean(nextPlan.length));

      alert(
        response.data.message ||
          "Study plan generated successfully! 🤖"
      );
    } catch (error) {
      console.error("Generate Study Plan Error:", error);
      alert(
        error.response?.data?.message ||
          "Failed to prepare study plan."
      );
    } finally {
      setGenerating(false);
    }
  };

  const saveCompletedTaskState = async (nextState) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      await axios.put(
        "http://localhost:5000/api/study-planner/progress",
        {
          completedTasks: Object.keys(nextState).filter(
            (key) => nextState[key]
          ),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    } catch (error) {
      console.error("Failed to save study progress:", error);
    }
  };

  const handleTaskToggle = (dayIndex, taskIndex, checked) => {
    const taskKey = `${dayIndex}-${taskIndex}`;

    setCompletedTasks((prev) => {
      const next = { ...prev };
      if (checked) {
        next[taskKey] = true;
      } else {
        delete next[taskKey];
      }
      saveCompletedTaskState(next);
      return next;
    });
  };

  const getMissedTasks = () => {
    if (!studyPlan.length || !startDate) return [];

    const currentDayIndex = diffDays(startDate, today);
    if (currentDayIndex < 0 || currentDayIndex >= studyPlan.length) return [];

    const missed = [];

    studyPlan.forEach((day, dayIndex) => {
      if (dayIndex > currentDayIndex) return;

      (day.tasks || []).forEach((task, taskIndex) => {
        const key = `${dayIndex}-${taskIndex}`;

        if (completedTasks[key]) return;

        missed.push({
          plannedDate: addDaysToDateString(startDate, dayIndex),
          subject: task.subject,
          topic: task.topic,
          minutes: Number(task.minutes || 0),
          type: task.type,
        });
      });
    });

    return missed;
  };

  const sendReplanRequest = async (
    missedTasks,
    recoveryDecision = null,
    approvedDailyMinutes = null
  ) => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Session expired. Please login again.");
      navigate("/login/student");
      return null;
    }

    return axios.post(
      "http://localhost:5000/api/study-planner/replan",
      {
        missedDate: today,
        missedTasks,
        recoveryDecision,
        approvedDailyMinutes,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  };

  const handleAdaptiveReplan = async () => {
    if (studyPlan.length === 0) {
      alert("Please generate a study plan first.");
      return;
    }

    const currentDayIndex = diffDays(startDate, today);

    if (currentDayIndex < 0 || currentDayIndex >= studyPlan.length) {
      alert(
        "Today is outside the current plan window. Please generate a new study plan."
      );
      return;
    }

    const missedTasks = getMissedTasks();

    if (missedTasks.length === 0) {
      alert(
        "No unfinished tasks were found. Complete tasks are already safe."
      );
      return;
    }

    const confirmed = window.confirm(
      `You have ${missedTasks.reduce(
        (sum, task) => sum + Number(task.minutes || 0),
        0
      )} minutes of unfinished study work.\n\nAI will adapt the remaining plan without creating impossible workloads.\n\nContinue?`
    );

    if (!confirmed) return;

    try {
      setGenerating(true);

      let response = await sendReplanRequest(missedTasks);

      if (response?.data?.needsRecoveryDecision) {
        const recovery = response.data.data;

        const increaseConfirmed = window.confirm(
          `⚠️ Your remaining capacity may not be enough.\n\n` +
            `Current: ${recovery.currentDailyMinutes} min/day\n` +
            `Recommended: ${recovery.recommendedDailyMinutes} min/day\n\n` +
            `Increase daily study time for the remaining days?\n\n` +
            `OK = Increase\nCancel = Keep current time and defer lower-priority work`
        );

        response = await sendReplanRequest(
          missedTasks,
          increaseConfirmed ? "increase" : "keep",
          increaseConfirmed
            ? recovery.recommendedDailyMinutes
            : recovery.currentDailyMinutes
        );
      }

      const data = response?.data?.data;
      if (!data?.plan?.length) {
        alert(
          response?.data?.message ||
            "No revised study plan was returned."
        );
        return;
      }

      setStudyPlan(data.plan);
      setStartDate(
        data.planStartDate
          ? new Date(data.planStartDate).toISOString().split("T")[0]
          : startDate
      );
      setPlanDays(String(data.planDays || data.plan.length));
      setDailyTime(String(data.dailyStudyMinutes || dailyTime));
      setCompletedTasks({});
      setSavedPlanInfo(data);
      setSavedPlanLoaded(true);

      const applied = data.recovery?.appliedDailyMinutes;
      const extraMessage = applied
        ? `\n\nDaily study time used: ${applied} minutes.`
        : "";

      alert(
        `${response.data.message || "Study plan updated successfully."}${extraMessage}`
      );
    } catch (error) {
      console.error("Adaptive Replan Error:", error);
      alert(
        error.response?.data?.message ||
          "Failed to adapt your study plan."
      );
    } finally {
      setGenerating(false);
    }
  };

  const planEndDate = useMemo(() => {
    const days = Number(planDays);
    if (!startDate || !Number.isInteger(days) || days < 1) return "";
    return addDaysToDateString(startDate, days - 1);
  }, [startDate, planDays]);

  const planProgress = useMemo(() => {
    const totalTasks = studyPlan.reduce(
      (sum, day) => sum + (Array.isArray(day.tasks) ? day.tasks.length : 0),
      0
    );

    const completedCount = Object.values(completedTasks).filter(Boolean).length;

    return {
      totalTasks,
      completedCount: Math.min(completedCount, totalTasks),
      percentage:
        totalTasks > 0
          ? Math.round((Math.min(completedCount, totalTasks) / totalTasks) * 100)
          : 0,
    };
  }, [studyPlan, completedTasks]);

  const handleDownloadPDF = () => {
    if (!studyPlan.length) {
      alert("Please generate a study plan first.");
      return;
    }
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #study-plan-print-area,
          #study-plan-print-area * { visibility: visible !important; }
          #study-plan-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>

      <div className="bg-blue-900 text-white px-6 py-4 shadow no-print">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">🧠 Smart AI Study Planner</h1>
            <p className="text-xs text-blue-200 mt-1">
              Create a realistic, personalized study plan
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/student/dashboard")}
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-semibold"
          >
            ← Dashboard
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <form onSubmit={handleGenerate} className="space-y-6">
          {/* STUDY MODE */}
          <div className="bg-white rounded-xl shadow p-6 no-print">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Select Study Mode
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setMode("exam")}
                className={`p-4 rounded-xl border text-left ${
                  mode === "exam"
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <p className="font-bold text-gray-800">📅 Exam Preparation</p>
                <p className="text-xs text-gray-500 mt-1">
                  Prepare according to upcoming exams.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("regular")}
                className={`p-4 rounded-xl border text-left ${
                  mode === "regular"
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <p className="font-bold text-gray-800">📚 Regular Study</p>
                <p className="text-xs text-gray-500 mt-1">
                  Maintain a regular weekly study routine.
                </p>
              </button>
            </div>
          </div>

          {/* PLAN DURATION */}
          <div className="bg-white rounded-xl shadow p-6 no-print">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div className="flex-1">
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  📅 Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  min={today}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Today is selected automatically.
                </p>
              </div>

              <div className="flex-1">
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Plan Duration
                </label>
                <select
                  value={planDays}
                  onChange={(e) => setPlanDays(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1">1 Day</option>
                  <option value="2">2 Days</option>
                  <option value="3">3 Days</option>
                  <option value="4">4 Days</option>
                  <option value="5">5 Days</option>
                  <option value="6">6 Days</option>
                  <option value="7">7 Days</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choose between 1 and 7 days.
                </p>
              </div>

              <div className="md:w-44 bg-gray-50 border rounded-lg p-3">
                <p className="text-[11px] text-gray-500">Plan Ends</p>
                <p className="text-sm font-bold text-gray-800 mt-1">
                  {formatDate(planEndDate)}
                </p>
              </div>
            </div>
          </div>

          {/* EXAM TIMETABLE */}
          {mode === "exam" && (
            <div className="bg-white rounded-xl shadow p-6 no-print">
              <h2 className="text-lg font-bold text-gray-800 mb-2">
                Exam Timetable
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Upload your exam timetable PDF or image.
              </p>

              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setExamFile(e.target.files?.[0] || null)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />

              <div className="flex flex-wrap gap-3 mt-3">
                <button
                  type="button"
                  onClick={handleExamTimetableUpload}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  Upload Exam Timetable
                </button>

                {examFile && (
                  <button
                    type="button"
                    onClick={handleAnalyzeTimetable}
                    disabled={analyzing}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {analyzing
                      ? "🤖 Analyzing Timetable..."
                      : "🤖 Analyze Timetable with AI"}
                  </button>
                )}
              </div>

              {examFile && (
                <p className="text-xs text-green-600 mt-2">
                  Selected: {examFile.name}
                </p>
              )}

              {examSchedule.length > 0 && (
                <div className="mt-4 border rounded-lg p-4 bg-purple-50">
                  <h3 className="font-bold text-gray-800 mb-3">
                    🤖 AI Detected Exams
                  </h3>
                  <div className="space-y-2">
                    {examSchedule.map((exam, index) => (
                      <div
                        key={`${exam.subject}-${index}`}
                        className="flex justify-between items-center bg-white border rounded-lg px-3 py-2"
                      >
                        <span className="font-semibold text-gray-700">
                          {exam.subject}
                        </span>
                        <span className="text-sm text-purple-700 font-semibold">
                          {exam.examDate}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STUDY PREFERENCES */}
          <div className="bg-white rounded-xl shadow p-6 no-print">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Study Preferences
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Daily Available Study Time
                </label>
                <input
                  type="number"
                  min="30"
                  max="1440"
                  step="1"
                  placeholder="Example: 180 minutes"
                  value={dailyTime}
                  onChange={(e) => setDailyTime(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Target Marks / Percentage
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  placeholder="Example: 85"
                  value={targetMarks}
                  onChange={(e) => setTargetMarks(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* PENDING ASSIGNMENTS */}
          <div className="bg-white rounded-xl shadow p-6 no-print">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  📝 Pending Assignments
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  These assignments will be considered while creating your study plan.
                </p>
              </div>
              <span className="text-xs font-bold bg-red-50 text-red-600 px-3 py-1 rounded-full">
                {pendingAssignments.length} Pending
              </span>
            </div>

            {pendingAssignments.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400">
                No pending assignments 🎉
              </div>
            ) : (
              <div className="space-y-3">
                {pendingAssignments.map((assignment) => (
                  <div
                    key={assignment._id}
                    className="border rounded-lg p-4 bg-gray-50"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <p className="font-semibold text-gray-800">
                          {assignment.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {assignment.subject?.subjectName || "Subject not available"}
                        </p>
                        {assignment.description && (
                          <p className="text-xs text-gray-600 mt-2">
                            {assignment.description}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-gray-400">Due Date</p>
                        <p className="text-xs font-bold text-red-600">
                          {assignment.dueDate
                            ? new Date(assignment.dueDate).toLocaleDateString()
                            : "No deadline"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SUBJECTS */}
          <div className="bg-white rounded-xl shadow p-6 no-print">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-800">
                Subjects & Syllabus Progress
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Select the subjects you want to include in your study plan.
              </p>
            </div>

            <div className="space-y-3">
              {loadingSubjects ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Loading your subjects...
                </p>
              ) : subjects.length === 0 ? (
                <p className="text-sm text-red-500 text-center py-4">
                  No subjects found for your course and semester.
                </p>
              ) : (
                subjects.map((subject, index) => (
                  <div
                    key={`${subject.name}-${index}`}
                    className="border rounded-lg p-4 bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={subject.selected !== false}
                        onChange={(e) => {
                          const updated = [...subjects];
                          updated[index] = {
                            ...updated[index],
                            selected: e.target.checked,
                          };
                          setSubjects(updated);
                        }}
                        className="w-4 h-4 accent-blue-600"
                      />

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 truncate">
                          {subject.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {subject.selected === false
                            ? "Excluded from this study plan"
                            : "Included in this study plan"}
                        </p>
                      </div>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        placeholder="Progress %"
                        value={subject.progress}
                        onChange={(e) =>
                          handleSubjectChange(index, "progress", e.target.value)
                        }
                        disabled={subject.selected === false}
                        className="w-32 border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                      />

                      <button
                        type="button"
                        onClick={() => removeSubject(index)}
                        className="text-red-500 hover:text-red-700 text-sm font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* GENERATE */}
          <button
            type="submit"
            disabled={generating}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow transition disabled:opacity-50 disabled:cursor-not-allowed no-print"
          >
            {generating
              ? "⏳ Preparing Study Plan..."
              : "✨ Generate Smart Study Plan"}
          </button>

          {/* SAVED PLAN */}
          {savedPlanLoaded && studyPlan.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 no-print">
              <p className="text-sm font-semibold text-green-800">
                ✅ Current saved study plan loaded automatically.
              </p>
              {savedPlanInfo?.planStartDate && savedPlanInfo?.planEndDate && (
                <p className="text-xs text-green-700 mt-1">
                  {formatDate(savedPlanInfo.planStartDate)} → {formatDate(savedPlanInfo.planEndDate)}
                </p>
              )}

              {savedPlanInfo?.adaptiveReplan?.missedDays > 0 && (
                <p className="text-xs text-green-700 mt-1">
                  Adaptive replans used: {savedPlanInfo.adaptiveReplan.missedDays}
                </p>
              )}
            </div>
          )}

          {/* AI PLAN */}
          {studyPlan.length > 0 && (
            <div
              id="study-plan-print-area"
              className="bg-white rounded-xl shadow p-6 mt-6"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    🤖 Your Smart {studyPlan.length}-Day Study Plan
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatDate(startDate)} → {formatDate(planEndDate)} · {mode === "exam" ? "Exam Preparation" : "Regular Study"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Personalized using your subjects, progress, study time, assignments and target marks.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
                      ✅ {planProgress.completedCount}/{planProgress.totalTasks} tasks complete
                    </span>

                    <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full">
                      📈 {planProgress.percentage}% progress
                    </span>

                    <span className="text-xs font-semibold bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full">
                      ⏱️ {dailyTime || 0} min/day
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 no-print">
                  <button
                    type="button"
                    onClick={handleAdaptiveReplan}
                    disabled={generating}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🔄 I Couldn't Study Today
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition"
                  >
                    📥 Download PDF
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                {studyPlan.map((day, dayIndex) => (
                  <div
                    key={`${day.day}-${dayIndex}`}
                    className="border rounded-xl overflow-hidden"
                  >
                    <div className="bg-blue-50 px-5 py-4 flex justify-between items-center gap-4">
                      <div>
                        <h3 className="font-bold text-lg text-gray-800">
                          📅 {formatDate(addDaysToDateString(startDate, dayIndex))}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          Day {dayIndex + 1} of {studyPlan.length}
                        </p>
                      </div>

                      <div className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-bold">
                        ⏱️ {day.totalMinutes} min
                      </div>
                    </div>

                    <div className="p-5 space-y-3">
                      {day.tasks && day.tasks.length > 0 ? (
                        day.tasks.map((task, taskIndex) => {
                          const taskKey = `${dayIndex}-${taskIndex}`;
                          const completed = Boolean(completedTasks[taskKey]);

                          return (
                            <div
                              key={taskKey}
                              className={`border rounded-lg p-4 transition ${
                                completed
                                  ? "bg-green-50 border-green-200"
                                  : "bg-gray-50"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={completed}
                                  onChange={(e) =>
                                    handleTaskToggle(
                                      dayIndex,
                                      taskIndex,
                                      e.target.checked
                                    )
                                  }
                                  className="mt-1 w-4 h-4 accent-blue-600"
                                />

                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={`font-bold ${
                                          completed
                                            ? "text-green-800 line-through"
                                            : "text-gray-800"
                                        }`}
                                      >
                                        {task.subject}
                                      </p>

                                      <p
                                        className={`text-sm mt-1 ${
                                          completed
                                            ? "text-green-700 line-through"
                                            : "text-gray-700"
                                        }`}
                                      >
                                        {task.topic}
                                      </p>

                                      <span className="inline-block mt-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-semibold">
                                        {task.type}
                                      </span>
                                    </div>

                                    <div className="shrink-0">
                                      <span className="text-sm font-bold text-blue-700">
                                        {task.minutes} min
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-4">
                          No tasks available for this day.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
