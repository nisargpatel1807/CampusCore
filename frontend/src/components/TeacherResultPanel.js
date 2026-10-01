import React, { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api";

export default function TeacherResultPanel({ subjects = [], onClose }) {
  const token = localStorage.getItem("token");
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const [subjectId, setSubjectId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("ALL");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [status, setStatus] = useState("draft");

  const loadRows = async () => {
    try {
      setLoading(true);
      const params = { status };
      if (subjectId) params.subjectId = subjectId;
      if (semester !== "ALL") params.semester = semester;
      if (academicYear.trim()) params.academicYear = academicYear.trim();

      const response = await axios.get(`${API}/results/teacher`, { ...authConfig, params });
      setRows(response.data?.results || []);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load result records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [subjectId, semester, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCec = async (resultId) => {
    const value = Number(drafts[resultId]);
    if (!Number.isFinite(value) || value < 0 || value > 30) {
      alert("CEC must be between 0 and 30.");
      return;
    }

    try {
      setSavingId(resultId);
      await axios.patch(`${API}/results/teacher/${resultId}/cec`, { cec: value }, authConfig);
      setStatus("draft");
      await loadRows();
      setDrafts((current) => ({ ...current, [resultId]: "" }));
    } catch (error) {
      alert(error.response?.data?.message || "Failed to save CEC.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[95vh] w-full max-w-[1450px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-purple-50 to-white px-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-purple-600">Faculty Results</div>
            <h3 className="mt-1 text-2xl font-extrabold text-gray-900">Result & CEC Management</h3>
            <p className="mt-1 text-sm text-gray-500">Enter CEC marks for your assigned subjects. Weighted totals are calculated automatically.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="rounded-xl border p-3 text-sm">
              <option value="">All Assigned Subjects</option>
              {subjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.subjectCode} - {subject.subjectName}
                </option>
              ))}
            </select>

            <select value={semester} onChange={(event) => setSemester(event.target.value)} className="rounded-xl border p-3 text-sm">
              <option value="ALL">All Semesters</option>
              {Array.from({ length: 10 }, (_, index) => (
                <option key={index + 1} value={index + 1}>Semester {index + 1}</option>
              ))}
            </select>

            <input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="Academic Year" className="rounded-xl border p-3 text-sm" />

            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border p-3 text-sm">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>

          <div className="mt-5 overflow-auto rounded-2xl border">
            <table className="min-w-[1250px] w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  {["Student", "Subject", "CEC / 30", "Midterm / 50", "External / 70", "Final / 100", "Grade", "Status", "Action"].map((header) => (
                    <th key={header} className="p-3 text-left font-extrabold text-gray-700">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan="9" className="p-10 text-center text-gray-400">Loading result records...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan="9" className="p-10 text-center text-gray-400">No result records found.</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row._id} className="hover:bg-purple-50/40">
                      <td className="p-3">
                        <div className="font-bold">{row.student?.name}</div>
                        <div className="text-xs text-gray-500">{row.student?.id_no}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold">{row.subject?.subjectCode}</div>
                        <div className="text-xs text-gray-500">{row.subject?.subjectName}</div>
                      </td>
                      <td className="p-3">
                        {status === "draft" ? (
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              max="30"
                              step="0.01"
                              value={drafts[row._id] ?? row.cec ?? ""}
                              onChange={(event) => setDrafts({ ...drafts, [row._id]: event.target.value })}
                              className="w-24 rounded-lg border p-2"
                            />
                          </div>
                        ) : (
                          `${row.cec ?? "—"} / 30`
                        )}
                      </td>
                      <td className="p-3">{row.midterm ?? "—"} / 50</td>
                      <td className="p-3">{row.external ?? "—"} / 70</td>
                      <td className="p-3 font-extrabold">{row.total ?? "—"} / 100</td>
                      <td className="p-3 font-extrabold">{row.grade || "—"}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.status === "published" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                          {row.status === "published" ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="p-3">
                        {status === "draft" && (
                          <button
                            type="button"
                            disabled={savingId === row._id}
                            onClick={() => saveCec(row._id)}
                            className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                          >
                            {savingId === row._id ? "Saving..." : "Save CEC"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
