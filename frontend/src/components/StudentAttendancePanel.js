import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const getStatusClass = (row) => (row.belowRequired ? "text-red-700 bg-red-50 border-red-200" : "text-green-700 bg-green-50 border-green-200");

const formatPercent = (value) => `${Number(value || 0).toFixed(2).replace(/\.00$/, "")}%`;

export default function StudentAttendancePanel({ onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await axios.get("http://localhost:5000/api/attendance-reports/student", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setReport(res.data);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load attendance report.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const sortedSubjects = useMemo(
    () => [...(report?.subjects || [])].sort((a, b) => (a.subjectCode || "").localeCompare(b.subjectCode || "")),
    [report],
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-6xl w-full p-6 shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-start gap-4 mb-5">
          <div>
            <h3 className="text-xl font-bold text-gray-800">📊 Attendance Details</h3>
            <p className="text-xs text-gray-500 mt-1">Subject-wise attendance, required percentage and lecture progress.</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        {loading ? <p className="text-center py-12 text-sm text-gray-400">Loading attendance report...</p> : error ? (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
        ) : (
          <div className="overflow-y-auto pr-1">
            <div className="grid md:grid-cols-4 gap-3 mb-5">
              <div className="rounded-xl border bg-blue-50 p-4"><p className="text-[10px] uppercase font-bold text-gray-500">Overall</p><p className={`text-2xl font-bold mt-1 ${report.overall.belowRequired ? "text-red-700" : "text-blue-700"}`}>{formatPercent(report.overall.percentage)}</p></div>
              <div className="rounded-xl border bg-green-50 p-4"><p className="text-[10px] uppercase font-bold text-gray-500">Attended</p><p className="text-2xl font-bold mt-1 text-green-700">{report.overall.attended}</p></div>
              <div className="rounded-xl border bg-red-50 p-4"><p className="text-[10px] uppercase font-bold text-gray-500">Absent</p><p className="text-2xl font-bold mt-1 text-red-700">{report.overall.absent}</p></div>
              <div className="rounded-xl border bg-amber-50 p-4"><p className="text-[10px] uppercase font-bold text-gray-500">Required</p><p className="text-2xl font-bold mt-1 text-amber-700">{report.minimumRequiredPercent}%</p></div>
            </div>

            <div className="mb-4 rounded-xl border bg-gray-50 p-4 text-xs text-gray-600">
              <span className="font-bold">Below required subjects:</span> {report.lowAttendanceCount} &nbsp;•&nbsp;
              <span className="font-bold">Required attendance:</span> {report.minimumRequiredPercent}%
            </div>

            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 text-gray-700 uppercase">
                  <tr><th className="p-3">Subject</th><th>Credits</th><th>Total</th><th>Present</th><th>Absent</th><th>Attendance</th><th>Progress</th><th className="pr-3">Status</th></tr>
                </thead>
                <tbody className="divide-y">
                  {sortedSubjects.map((row) => (
                    <tr key={String(row.subjectId)}>
                      <td className="p-3"><p className="font-semibold text-gray-800">{row.subjectName}</p><p className="text-[10px] text-gray-500">{row.subjectCode} • Sem {row.semester}</p></td>
                      <td>{row.credit}</td><td>{row.totalLectures}</td><td className="text-green-700 font-semibold">{row.attended}</td><td className="text-red-700 font-semibold">{row.absent}</td>
                      <td><span className={`inline-flex px-2 py-1 rounded-full border font-bold ${getStatusClass(row)}`}>{formatPercent(row.percentage)}</span></td>
                      <td className="min-w-[190px]">
                        {row.belowRequired ? <span className="text-red-700">Need {row.lecturesNeeded} consecutive lecture{row.lecturesNeeded === 1 ? "" : "s"} to reach {report.minimumRequiredPercent}%.</span> : <span className="text-green-700">You can miss up to {row.maxFutureAbsences} more.</span>}
                      </td>
                      <td className="pr-3"><span className={`font-bold ${row.belowRequired ? "text-red-600" : "text-green-600"}`}>{row.belowRequired ? "Below Required" : "Good"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
