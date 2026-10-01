import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import TimetableWeekGrid from "./TimetableWeekGrid";

const API = "http://localhost:5000/api";

const shiftDate = (dateString, amount) => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
};

const formatHumanDate = (dateString) => {
  try {
    return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch (_) {
    return dateString;
  }
};

export default function TeacherTimetablePanel({ onClose }) {
  const token = localStorage.getItem("token");
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };
  const [referenceDate, setReferenceDate] = useState(new Date().toISOString().slice(0, 10));
  const [academicYear, setAcademicYear] = useState("");
  const [week, setWeek] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWeek = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(`${API}/timetable/me/week`, {
        ...authConfig,
        params: { date: referenceDate },
      });
      setAcademicYear(res.data?.academicYear || "");
      setWeek(res.data?.week || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load your timetable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeek(); // eslint-disable-line react-hooks/exhaustive-deps
  }, [referenceDate]);

  const todayEntries = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return week.find((day) => day.date === today)?.entries || [];
  }, [week]);

  const stats = useMemo(() => {
    const entries = week.flatMap((day) => day.entries || []).filter((entry) => entry.type !== "Break");
    const changed = entries.filter((entry) => entry.changeId).length;
    const extra = entries.filter((entry) => entry.isExtraClass).length;
    return { total: entries.length, changed, extra };
  }, [week]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[94vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-gray-800">👨‍🏫 My Weekly Timetable</h3>
            <p className="text-xs text-gray-500">Your assigned classes, rooms and timetable changes.</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border bg-gray-50 p-3">
              <div className="text-[10px] font-bold uppercase text-gray-500">Academic Year</div>
              <div className="mt-1 font-bold text-gray-800">{academicYear || "—"}</div>
            </div>
            <div className="rounded-xl border bg-blue-50 p-3">
              <div className="text-[10px] font-bold uppercase text-blue-600">Classes This Week</div>
              <div className="mt-1 text-xl font-extrabold text-blue-900">{stats.total}</div>
            </div>
            <div className="rounded-xl border bg-amber-50 p-3">
              <div className="text-[10px] font-bold uppercase text-amber-700">Changed</div>
              <div className="mt-1 text-xl font-extrabold text-amber-900">{stats.changed}</div>
            </div>
            <div className="rounded-xl border bg-indigo-50 p-3">
              <div className="text-[10px] font-bold uppercase text-indigo-700">Extra Classes</div>
              <div className="mt-1 text-xl font-extrabold text-indigo-900">{stats.extra}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-gray-50 p-3">
            <button type="button" onClick={() => setReferenceDate(new Date().toISOString().slice(0, 10))} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-100">Current Week</button>
            <button type="button" onClick={() => setReferenceDate(shiftDate(referenceDate, -7))} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-100">← Previous</button>
            <button type="button" onClick={() => setReferenceDate(shiftDate(referenceDate, 7))} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-100">Next →</button>
            <input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-xs" />
            <span className="ml-auto text-xs text-gray-500">Reference: {formatHumanDate(referenceDate)}</span>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <TimetableWeekGrid week={week} loading={loading} />
        </div>
      </div>
    </div>
  );
}
