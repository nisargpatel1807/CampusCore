import React, { useMemo, useState } from "react";
import axios from "axios";

const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const downloadCsv = (rows) => {
  const header = ["Student Name", "Enrollment No", "Course", "Semester", "Division", "Subject Code", "Subject", "Total Lectures", "Present", "Absent", "Attendance %", "Required %", "Status"];
  const body = rows.map((r) => [r.studentName, r.enrollmentNo, r.course, r.semester, r.division, r.subjectCode, r.subjectName, r.totalLectures, r.attended, r.absent, r.percentage, r.requiredPercent, r.belowRequired ? "Below Required" : "Good"]);
  const blob = new Blob([[header, ...body].map((line) => line.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "CampusCore_Admin_Attendance_Report.csv"; a.click(); URL.revokeObjectURL(url);
};

export default function AdminAttendanceReportPanel({ onClose, courses = [], subjects = [] }) {
  const [course, setCourse] = useState("ALL");
  const [semester, setSemester] = useState("ALL");
  const [division, setDivision] = useState("ALL");
  const [subjectId, setSubjectId] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");

  const visibleSubjects = useMemo(() => subjects.filter((s) => semester === "ALL" || String(s.semester) === String(semester)), [subjects, semester]);

  const loadReport = async () => {
    if (fromDate && toDate && fromDate > toDate) return setError("From date cannot be after to date.");
    try {
      setLoading(true); setError("");
      const params = new URLSearchParams({ course, semester, division, subjectId });
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await axios.get(`http://localhost:5000/api/attendance-reports/admin?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      setReport(res.data);
    } catch (err) { setError(err.response?.data?.message || "Failed to load admin attendance report."); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-7xl w-full p-6 shadow-2xl max-h-[94vh] flex flex-col">
        <div className="flex justify-between items-start gap-4 mb-4"><div><h3 className="text-xl font-bold text-gray-800">🛡️ Attendance Control & Report</h3><p className="text-xs text-gray-500 mt-1">Filter attendance by course, semester, division and subject.</p></div><button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button></div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 p-4 bg-gray-50 rounded-xl border mb-4">
          <select value={course} onChange={(e) => { setCourse(e.target.value); setSubjectId("ALL"); }} className="border rounded-lg p-2 text-xs bg-white"><option value="ALL">All Courses</option>{courses.map((c) => <option key={c._id} value={c.courseName}>{c.courseName}</option>)}</select>
          <select value={semester} onChange={(e) => setSemester(e.target.value)} className="border rounded-lg p-2 text-xs bg-white"><option value="ALL">All Semesters</option>{[1,2,3,4,5,6,7,8].map((s) => <option key={s} value={s}>Sem {s}</option>)}</select>
          <select value={division} onChange={(e) => setDivision(e.target.value)} className="border rounded-lg p-2 text-xs bg-white"><option value="ALL">All Divisions</option><option value="A">Division A</option><option value="B">Division B</option><option value="C">Division C</option></select>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="border rounded-lg p-2 text-xs bg-white"><option value="ALL">All Subjects</option>{visibleSubjects.map((s) => <option key={s._id} value={s._id}>{s.subjectName} ({s.subjectCode})</option>)}</select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border rounded-lg p-2 text-xs bg-white" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border rounded-lg p-2 text-xs bg-white" />
          <button type="button" onClick={loadReport} disabled={loading} className="rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-50">{loading ? "Loading..." : "Generate"}</button>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
        {!report ? <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Choose filters and generate the report.</div> : (
          <div className="overflow-y-auto overflow-x-auto border rounded-xl flex-1">
            <div className="sticky top-0 z-10 bg-white border-b p-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-gray-600"><b>Required:</b> {report.minimumRequiredPercent}% &nbsp;•&nbsp; <b>Students:</b> {report.totals.students} &nbsp;•&nbsp; <b className="text-red-600">Below required:</b> {report.totals.belowRequired}</p><button type="button" onClick={() => downloadCsv(report.rows)} className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold">Download CSV</button></div>
            <table className="w-full text-xs text-left"><thead className="bg-gray-100 text-gray-700 uppercase"><tr><th className="p-3">Student</th><th>Course</th><th>Sem</th><th>Div</th><th>Subject</th><th>Total</th><th>Present</th><th>Absent</th><th>Attendance</th><th>Status</th></tr></thead><tbody className="divide-y">
              {report.rows.map((row) => <tr key={`${row.subjectId}-${row.studentId}`} className={row.belowRequired ? "bg-red-50/70" : ""}><td className="p-3"><p className="font-semibold text-gray-800">{row.studentName}</p><p className="text-[10px] font-mono text-gray-500">{row.enrollmentNo}</p></td><td>{row.course}</td><td>{row.semester}</td><td>{row.division}</td><td><p className="font-semibold">{row.subjectName}</p><p className="text-[10px] text-gray-500">{row.subjectCode}</p></td><td>{row.totalLectures}</td><td className="text-green-700 font-semibold">{row.attended}</td><td className="text-red-700 font-semibold">{row.absent}</td><td className={`font-bold ${row.belowRequired ? "text-red-700" : "text-green-700"}`}>{Number(row.percentage || 0).toFixed(2)}%</td><td className={`font-bold ${row.belowRequired ? "text-red-700" : "text-green-700"}`}>{row.belowRequired ? "Below Required" : "Good"}</td></tr>)}
            </tbody></table>
          </div>
        )}
      </div>
    </div>
  );
}
