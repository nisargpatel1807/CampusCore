import React, { useMemo } from "react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TYPE_STYLES = {
  Lecture: "bg-blue-50 border-blue-200 text-blue-800",
  Lab: "bg-purple-50 border-purple-200 text-purple-800",
  Practical: "bg-violet-50 border-violet-200 text-violet-800",
  Seminar: "bg-cyan-50 border-cyan-200 text-cyan-800",
  Workshop: "bg-amber-50 border-amber-200 text-amber-800",
  Activity: "bg-emerald-50 border-emerald-200 text-emerald-800",
  Break: "bg-slate-50 border-slate-200 text-slate-600",
  Other: "bg-gray-50 border-gray-200 text-gray-700",
  "Extra Class": "bg-indigo-50 border-indigo-200 text-indigo-800",
};

const formatDate = (dateString) => {
  try {
    return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
    });
  } catch (_) {
    return dateString;
  }
};

const entryKey = (entry) => String(entry?._id || `${entry?.dayOfWeek}-${entry?.startTime}-${entry?.title || "entry"}`);

export default function TimetableWeekGrid({ week = [], loading = false }) {
  const normalized = useMemo(
    () => DAYS.map((day) => week.find((item) => item.dayOfWeek === day) || { dayOfWeek: day, entries: [] }),
    [week],
  );

  const today = new Date().toISOString().slice(0, 10);

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-500">Loading timetable...</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <div className="min-w-[1050px] grid grid-cols-7 divide-x">
        {normalized.map((day) => {
          const isToday = day.date === today;
          return (
            <section key={day.dayOfWeek} className="min-h-[360px]">
              <div className={`sticky top-0 z-10 border-b px-3 py-3 ${isToday ? "bg-blue-50" : "bg-gray-50"}`}>
                <div className={`text-sm font-bold ${isToday ? "text-blue-700" : "text-gray-800"}`}>
                  {day.dayOfWeek}
                </div>
                <div className="text-[11px] text-gray-500">{formatDate(day.date)}</div>
                {isToday && <span className="mt-1 inline-block text-[10px] font-bold text-blue-700">TODAY</span>}
              </div>

              <div className="space-y-2 p-2.5">
                {day.entries?.length ? (
                  day.entries.map((entry) => {
                    const cancelled = Boolean(entry.cancelled);
                    const changed = Boolean(entry.changeId);
                    const style = cancelled
                      ? "bg-red-50 border-red-300 text-red-800"
                      : TYPE_STYLES[entry.type] || TYPE_STYLES.Other;

                    return (
                      <article key={entryKey(entry)} className={`rounded-lg border p-2.5 shadow-sm ${style} ${cancelled ? "opacity-80" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-extrabold">
                            {entry.startTime} – {entry.endTime}
                          </div>
                          <span className="text-[9px] font-bold uppercase tracking-wide">
                            {cancelled ? "Cancelled" : entry.type}
                          </span>
                        </div>

                        <div className={`mt-1 text-sm font-bold ${cancelled ? "line-through" : ""}`}>
                          {entry.subject?.subjectName || entry.type || "Class"}
                        </div>

                        {entry.subject?.subjectCode && (
                          <div className="mt-0.5 text-[10px] opacity-80">{entry.subject.subjectCode}</div>
                        )}

                        {entry.teacher?.name && entry.type !== "Break" && (
                          <div className="mt-2 text-[11px]">👨‍🏫 {entry.teacher.name}</div>
                        )}

                        {entry.room && entry.type !== "Break" && (
                          <div className="text-[11px]">📍 {entry.room.roomCode || entry.room.roomName}</div>
                        )}

                        {entry.division && entry.type !== "Break" && (
                          <div className="text-[10px] opacity-80">
                            {entry.course?.courseName || "Course"} • Sem {entry.semester} • Div {entry.division}
                          </div>
                        )}

                        {changed && !cancelled && (
                          <div className="mt-2 rounded bg-white/70 px-2 py-1 text-[10px] font-semibold">
                            🔔 Timetable changed{entry.changeType ? ` • ${entry.changeType}` : ""}
                            {entry.originalStartTime && entry.originalEndTime && entry.changeType === "Time Change" && (
                              <div>Original: {entry.originalStartTime} – {entry.originalEndTime}</div>
                            )}
                          </div>
                        )}

                        {entry.isExtraClass && (
                          <div className="mt-2 rounded bg-white/70 px-2 py-1 text-[10px] font-bold">
                            ⭐ Extra Class
                          </div>
                        )}

                        {entry.notes && <div className="mt-2 text-[10px] opacity-80">{entry.notes}</div>}
                      </article>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-[11px] text-gray-400">No class</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
