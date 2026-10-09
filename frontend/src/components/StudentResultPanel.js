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

const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};

const decimal = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return String(Number(number.toFixed(2)));
};

const gradeRows = [
  ["85–100", "O+", "Outstanding"],
  ["70–84", "O", "Excellent"],
  ["60–69", "A", "Very Good"],
  ["55–59", "B+", "Good"],
  ["48–54", "B", "Fair"],
  ["40–47", "C", "Average"],
  ["Below 40", "F", "Fail"],
];

const classificationRows = [
  ["8.50–10.00", "First Class with Distinction"],
  ["7.00–8.49", "First Class"],
  ["6.00–6.99", "Higher Second Class"],
  ["5.50–5.99", "Second Class"],
  ["4.80–5.49", "Pass Class"],
  ["Below 4.80", "Fail"],
];

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
    const logoUrl = `${window.location.origin}/campuscore-logo.png`;

    const subjectRows = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.subject?.subjectCode)}</td>
        <td>${escapeHtml(row.subject?.subjectName)}</td>
        <td class="center">${escapeHtml(row.credit)}</td>
        <td class="center"><strong>${whole(row.total)}</strong></td>
        <td class="center"><strong>${escapeHtml(row.grade)}</strong></td>
      </tr>
    `).join("");

    const gradeTableRows = gradeRows.map(([range, grade, description]) => `
      <tr><td>${range}</td><td><strong>${grade}</strong></td><td>${description}</td></tr>
    `).join("");

    const classificationTableRows = classificationRows.map(([range, description]) => `
      <tr><td>${range}</td><td>${description}</td></tr>
    `).join("");

    const documentHtml = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>CampusCore Result - ${escapeHtml(student.id_no)} - Semester ${escapeHtml(selectedSemester.semester)}</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#172033;background:#fff;font-size:12px}
.page{max-width:900px;margin:0 auto}
.header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:3px solid #2563eb;padding:0 0 14px;margin-bottom:18px}
.logo{width:210px;height:auto;max-height:92px;object-fit:contain;object-position:left center}
.title{text-align:right}.title h1{margin:0;font-size:22px;color:#0f172a}.title p{margin:5px 0 0;color:#475569;font-weight:700}
h2{font-size:15px;color:#0f2f66;margin:18px 0 8px}
.info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
.info div{padding:8px 10px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}.info div:nth-child(2n){border-right:0}.info div:nth-last-child(-n+2){border-bottom:0}
.info strong{display:inline-block;min-width:105px;color:#475569}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:8px 9px}th{background:#eff6ff;color:#0f2f66;text-align:left}.center{text-align:center}
.summary{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;margin-top:8px}.summary .card{padding:10px;text-align:center;border-right:1px solid #cbd5e1}.summary .card:last-child{border-right:0}.label{font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700}.value{font-size:16px;font-weight:800;margin-top:4px;color:#0f172a}
.tables{display:grid;grid-template-columns:1fr 1fr;gap:16px}.tables h2{margin-top:18px}
.note{margin-top:18px;padding:10px 12px;border:1px solid #dbeafe;background:#f8fbff;border-radius:8px;font-size:10px;color:#475569;line-height:1.5}
.footer{display:flex;justify-content:space-between;align-items:end;margin-top:28px;padding-top:12px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b}
.print{position:fixed;right:20px;top:20px;padding:10px 16px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer}
@media print{.print{display:none}.page{max-width:none}}
</style>
</head>
<body>
<div class="page">
  <button class="print" onclick="window.print()">Print / Save as PDF</button>
  <div class="header">
    <img class="logo" src="${logoUrl}" alt="CampusCore">
    <div class="title">
      <h1>Official Semester Result Statement</h1>
      <p>Master of Computer Application (MCA)</p>
    </div>
  </div>

  <h2>Student Details</h2>
  <div class="info">
    <div><strong>Student Name:</strong> ${escapeHtml(student.name)}</div>
    <div><strong>Student ID:</strong> ${escapeHtml(student.id_no)}</div>
    <div><strong>Course:</strong> ${escapeHtml(student.course)}</div>
    <div><strong>Year:</strong> ${escapeHtml(student.year)}</div>
    <div><strong>Semester:</strong> ${escapeHtml(selectedSemester.semester)}</div>
    <div><strong>Division:</strong> ${escapeHtml(student.division)}</div>
    <div><strong>Academic Year:</strong> ${escapeHtml(selectedSemester.academicYear)}</div>
    <div><strong>Examination:</strong> Regular</div>
  </div>

  <h2>Subject-wise Result</h2>
  <table>
    <thead><tr><th>Code</th><th>Subject</th><th class="center">Credit</th><th class="center">Total Marks (100)</th><th class="center">Grade</th></tr></thead>
    <tbody>${subjectRows}</tbody>
  </table>

  <h2>Result Summary</h2>
  <div class="summary">
    <div class="card"><div class="label">Total Marks</div><div class="value">${whole(selectedSemester.obtainedMarks)} / ${whole(selectedSemester.maxMarks)}</div></div>
    <div class="card"><div class="label">Percentage</div><div class="value">${whole(selectedSemester.percentage)}%</div></div>
    <div class="card"><div class="label">Total Credits</div><div class="value">${whole(selectedSemester.creditTotal)}</div></div>
    <div class="card"><div class="label">SGPA</div><div class="value">${decimal(selectedSemester.sgpa)}</div></div>
    <div class="card"><div class="label">CGPA</div><div class="value">${decimal(data.cgpa)}</div></div>
  </div>

  <div class="tables">
    <div>
      <h2>Grade and Description</h2>
      <table><thead><tr><th>Marks Range</th><th>Grade</th><th>Description</th></tr></thead><tbody>${gradeTableRows}</tbody></table>
    </div>
    <div>
      <h2>Result Classification (Based on CGPA)</h2>
      <table><thead><tr><th>CGPA Range</th><th>Classification</th></tr></thead><tbody>${classificationTableRows}</tbody></table>
    </div>
  </div>

  <div class="note">
    <strong>Note:</strong> Total marks shown above are final marks out of 100 for each subject. CEC, Midterm and External component marks are not displayed on the student result statement. Grade Point and GPE are internal academic calculation values and are not displayed to students. SGPA and CGPA are calculated using credit-weighted Grade Points.
  </div>

  <div class="footer">
    <div>Generated by CampusCore<br>Semester ${escapeHtml(selectedSemester.semester)} · ${escapeHtml(selectedSemester.academicYear)}</div>
    <div><strong>CampusCore Academic Records</strong></div>
  </div>
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
            <p className="mt-1 text-sm text-gray-500">Published semester results, SGPA, CGPA and final subject marks.</p>
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
                  <div className="mt-1 text-2xl font-extrabold text-blue-900">{decimal(data.cgpa)}</div>
                </div>
                <div className="rounded-2xl border bg-green-50 p-4">
                  <div className="text-xs font-bold uppercase text-green-700">Total Credits</div>
                  <div className="mt-1 text-2xl font-extrabold text-green-900">{whole(data.totalCredits)}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="rounded-xl border p-3 text-sm font-bold">
                  {data.semesters.map((semester) => {
                    const key = `${semester.academicYear}::${semester.semester}`;
                    return <option key={key} value={key}>Semester {semester.semester} · {semester.academicYear}</option>;
                  })}
                </select>
                <button type="button" onClick={downloadResultFile} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-700">
                  Download Result
                </button>
              </div>

              {selectedSemester && (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      ["Total Marks", `${whole(selectedSemester.obtainedMarks)}/${whole(selectedSemester.maxMarks)}`],
                      ["Percentage", `${whole(selectedSemester.percentage)}%`],
                      ["Credits", whole(selectedSemester.creditTotal)],
                      ["SGPA", decimal(selectedSemester.sgpa)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border bg-gray-50 p-4">
                        <div className="text-xs font-bold uppercase text-gray-500">{label}</div>
                        <div className="mt-1 text-xl font-extrabold text-gray-900">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-auto rounded-2xl border">
                    <table className="min-w-[700px] w-full text-sm">
                      <thead className="border-b bg-gray-50">
                        <tr>
                          {["Code", "Subject", "Credit", "Total Marks / 100", "Grade"].map((header) => (
                            <th key={header} className="p-3 text-left font-extrabold text-gray-700">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedSemester.rows.map((row) => (
                          <tr key={row._id} className="hover:bg-blue-50/40">
                            <td className="p-3 font-bold">{row.subject?.subjectCode}</td>
                            <td className="p-3">{row.subject?.subjectName}</td>
                            <td className="p-3">{whole(row.credit)}</td>
                            <td className="p-3 font-extrabold">{whole(row.total)}</td>
                            <td className="p-3 font-extrabold">{row.grade}</td>
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
