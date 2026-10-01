import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export default function StudentResultPanel({ onClose }) {
  const token = localStorage.getItem("token");
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const [data, setData] = useState({
    student: null,
    results: [],
    semesters: [],
    cgpa: 0,
    totalCredits: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState("");

  const loadResults = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await axios.get(`${API}/results/student`, authConfig);
      setData(response.data);
      if (!selectedKey && response.data?.semesters?.length) {
        const first = response.data.semesters[0];
        setSelectedKey(`${first.academicYear}::${first.semester}`);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Failed to load published results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSemester = useMemo(
    () => data.semesters.find(
      (item) => `${item.academicYear}::${item.semester}` === selectedKey
    ),
    [data.semesters, selectedKey]
  );

  const downloadResultFile = () => {
    if (!selectedSemester || !data.student) {
      alert("No result is available to download.");
      return;
    }

    const student = data.student;
    const rows = selectedSemester.rows || [];

    const subjectRows = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.subject?.subjectCode)}</td>
        <td>${escapeHtml(row.subject?.subjectName)}</td>
        <td>${escapeHtml(row.credit)}</td>
        <td>${escapeHtml(row.cec)} / 30</td>
        <td>${escapeHtml(row.cecWeighted)}</td>
        <td>${escapeHtml(row.midterm)} / 50</td>
        <td>${escapeHtml(row.midtermWeighted)}</td>
        <td>${escapeHtml(row.external)} / 70</td>
        <td>${escapeHtml(row.externalWeighted)}</td>
        <td><strong>${escapeHtml(row.total)} / 100</strong></td>
        <td>${escapeHtml(row.percentage)}%</td>
        <td><strong>${escapeHtml(row.grade)}</strong></td>
        <td>${escapeHtml(row.gradePoint)}</td>
      </tr>
    `).join("");

    const documentHtml = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>CampusCore Result - ${escapeHtml(student.id_no)} - Semester ${escapeHtml(selectedSemester.semester)}</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#222}
.header{border-bottom:3px solid #ea580c;padding-bottom:14px;margin-bottom:20px}
h1{margin:0 0 6px;color:#c2410c}
h2{margin:20px 0 10px}
.info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px}
.info div{padding:8px;background:#f7f7f7;border:1px solid #ddd}
table{width:100%;border-collapse:collapse;font-size:11px}
th,td{border:1px solid #ccc;padding:7px;text-align:left}
th{background:#fff7ed}
.summary{display:flex;gap:12px;margin-top:18px}
.card{border:1px solid #ddd;padding:12px;flex:1}
.note{margin-top:24px;font-size:11px;color:#666}
@media print{button{display:none}}
</style>
</head>
<body>
<div class="header">
  <h1>CampusCore</h1>
  <div>Official Semester Result Statement</div>
</div>

<div class="info">
  <div><strong>Student Name:</strong> ${escapeHtml(student.name)}</div>
  <div><strong>Student ID:</strong> ${escapeHtml(student.id_no)}</div>
  <div><strong>Email:</strong> ${escapeHtml(student.email)}</div>
  <div><strong>Course:</strong> ${escapeHtml(student.course)}</div>
  <div><strong>Year:</strong> ${escapeHtml(student.year)}</div>
  <div><strong>Semester:</strong> ${escapeHtml(selectedSemester.semester)}</div>
  <div><strong>Division:</strong> ${escapeHtml(student.division)}</div>
  <div><strong>Academic Year:</strong> ${escapeHtml(selectedSemester.academicYear)}</div>
</div>

<h2>Subject-wise Result</h2>
<table>
<thead>
<tr>
<th>Code</th><th>Subject</th><th>Credit</th>
<th>CEC Raw</th><th>CEC Weighted</th>
<th>Midterm Raw</th><th>Midterm Weighted</th>
<th>External Raw</th><th>External Weighted</th>
<th>Final</th><th>%</th><th>Grade</th><th>GP</th>
</tr>
</thead>
<tbody>${subjectRows}</tbody>
</table>

<div class="summary">
  <div class="card"><strong>Marks</strong><br>${escapeHtml(selectedSemester.obtainedMarks)} / ${escapeHtml(selectedSemester.maxMarks)}</div>
  <div class="card"><strong>Percentage</strong><br>${escapeHtml(selectedSemester.percentage)}%</div>
  <div class="card"><strong>Credits</strong><br>${escapeHtml(selectedSemester.creditTotal)}</div>
  <div class="card"><strong>GPE</strong><br>${escapeHtml(selectedSemester.gpe)}</div>
  <div class="card"><strong>SGPA</strong><br>${escapeHtml(selectedSemester.sgpa)}</div>
  <div class="card"><strong>CGPA</strong><br>${escapeHtml(data.cgpa)}</div>
</div>

<div class="note">
Assessment formula: CEC 30%, Midterm 20%, External 50%. Midterm is converted from 50 raw marks to 20 weighted marks. External is converted from 70 raw marks to 50 weighted marks. This document contains published CampusCore result data.
</div>
</body>
</html>`;

    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `CampusCore_Result_${student.id_no}_Sem${selectedSemester.semester}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[95vh] w-full max-w-[1450px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-white px-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Academic Records</div>
            <h3 className="mt-1 text-2xl font-extrabold text-gray-900">My Results</h3>
            <p className="mt-1 text-sm text-gray-500">Published semester results, SGPA, CGPA and subject-wise marks.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
        </div>

        <div className="overflow-y-auto p-6">
          {loading ? (
            <div className="rounded-2xl border p-10 text-center text-gray-500">Loading published results...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>
          ) : !data.semesters.length ? (
            <div className="rounded-2xl border bg-gray-50 p-10 text-center">
              <div className="text-lg font-extrabold text-gray-800">No Published Results</div>
              <p className="mt-1 text-sm text-gray-500">Your result will appear here after the administration publishes it.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-2xl border bg-gray-50 p-4">
                  <div className="text-xs font-bold uppercase text-gray-500">Student</div>
                  <div className="mt-1 font-extrabold text-gray-900">{data.student?.name}</div>
                  <div className="text-xs text-gray-500">{data.student?.id_no}</div>
                </div>
                <div className="rounded-2xl border bg-gray-50 p-4">
                  <div className="text-xs font-bold uppercase text-gray-500">Course</div>
                  <div className="mt-1 font-extrabold text-gray-900">{data.student?.course || "—"}</div>
                  <div className="text-xs text-gray-500">Division {data.student?.division || "—"}</div>
                </div>
                <div className="rounded-2xl border bg-blue-50 p-4">
                  <div className="text-xs font-bold uppercase text-blue-600">CGPA</div>
                  <div className="mt-1 text-2xl font-extrabold text-blue-900">{data.cgpa}</div>
                </div>
                <div className="rounded-2xl border bg-green-50 p-4">
                  <div className="text-xs font-bold uppercase text-green-700">Total Credits</div>
                  <div className="mt-1 text-2xl font-extrabold text-green-900">{data.totalCredits}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedKey}
                  onChange={(event) => setSelectedKey(event.target.value)}
                  className="rounded-xl border p-3 text-sm font-bold"
                >
                  {data.semesters.map((semester) => {
                    const key = `${semester.academicYear}::${semester.semester}`;
                    return (
                      <option key={key} value={key}>
                        Semester {semester.semester} · {semester.academicYear}
                      </option>
                    );
                  })}
                </select>

                <button
                  type="button"
                  onClick={downloadResultFile}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-700"
                >
                  Download Result File
                </button>
              </div>

              {selectedSemester && (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {[
                      ["Marks", `${selectedSemester.obtainedMarks}/${selectedSemester.maxMarks}`],
                      ["Percentage", `${selectedSemester.percentage}%`],
                      ["Credits", selectedSemester.creditTotal],
                      ["GPE", selectedSemester.gpe],
                      ["SGPA", selectedSemester.sgpa],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border bg-gray-50 p-4">
                        <div className="text-xs font-bold uppercase text-gray-500">{label}</div>
                        <div className="mt-1 text-xl font-extrabold text-gray-900">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-auto rounded-2xl border">
                    <table className="min-w-[1300px] w-full text-sm">
                      <thead className="border-b bg-gray-50">
                        <tr>
                          {["Code", "Subject", "Credit", "CEC", "CEC Weighted", "Midterm", "Midterm Weighted", "External", "External Weighted", "Final / 100", "Grade", "GP"].map((header) => (
                            <th key={header} className="p-3 text-left font-extrabold text-gray-700">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedSemester.rows.map((row) => (
                          <tr key={row._id} className="hover:bg-blue-50/40">
                            <td className="p-3 font-bold">{row.subject?.subjectCode}</td>
                            <td className="p-3">{row.subject?.subjectName}</td>
                            <td className="p-3">{row.credit}</td>
                            <td className="p-3">{row.cec} / 30</td>
                            <td className="p-3">{row.cecWeighted}</td>
                            <td className="p-3">{row.midterm} / 50</td>
                            <td className="p-3">{row.midtermWeighted}</td>
                            <td className="p-3">{row.external} / 70</td>
                            <td className="p-3">{row.externalWeighted}</td>
                            <td className="p-3 font-extrabold">{row.total} / 100</td>
                            <td className="p-3 font-extrabold">{row.grade}</td>
                            <td className="p-3">{row.gradePoint}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
