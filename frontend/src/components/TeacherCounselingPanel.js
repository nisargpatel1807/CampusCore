import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "http://localhost:5000";

const authConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  },
});

const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const statusStyle = {
  REQUESTED: "bg-yellow-100 text-yellow-700 border-yellow-200",
  PROPOSED: "bg-purple-100 text-purple-700 border-purple-200",
  CONFIRMED: "bg-green-100 text-green-700 border-green-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
  COMPLETED: "bg-blue-100 text-blue-700 border-blue-200",
  NO_SHOW: "bg-red-100 text-red-700 border-red-200",
};

const emptySchedule = { date: "", startTime: "", endTime: "", location: "", message: "" };

export default function TeacherCounselingPanel({ onClose }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [scheduleFor, setScheduleFor] = useState(null);
  const [schedule, setSchedule] = useState(emptySchedule);

  const load = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/api/counseling/appointments/teacher`, authConfig());
      setAppointments(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load counseling appointments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const buildSchedule = (appointment, useRequested = true) => {
    const dateValue = appointment.scheduledStart || appointment.requestedStart;
    const startValue = appointment.scheduledStart || appointment.requestedStart;
    const endValue = appointment.scheduledEnd || appointment.requestedEnd;
    const date = dateValue ? new Date(dateValue) : null;
    return {
      date: date ? date.toISOString().slice(0, 10) : "",
      startTime: useRequested && startValue ? new Date(startValue).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
      endTime: useRequested && endValue ? new Date(endValue).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
      location: appointment.location || "",
      message: appointment.teacherMessage || "",
    };
  };

  const openDecision = (appointment) => {
    setScheduleFor(appointment);
    setSchedule(buildSchedule(appointment, true));
  };

  const submitDecision = async (action) => {
    if (!scheduleFor) return;
    if (action !== "REJECT" && (!schedule.date || !schedule.startTime || !schedule.endTime)) {
      return alert("Please provide date, start time and end time.");
    }

    let payload = {
      action,
      location: schedule.location.trim(),
      message: schedule.message.trim(),
    };

    if (action !== "REJECT") {
      const start = new Date(`${schedule.date}T${schedule.startTime}`);
      const end = new Date(`${schedule.date}T${schedule.endTime}`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return alert("Please provide a valid schedule.");
      }
      payload.scheduledStart = start.toISOString();
      payload.scheduledEnd = end.toISOString();
    }

    try {
      setWorkingId(scheduleFor._id);
      await axios.put(
        `${API_BASE}/api/counseling/appointments/${scheduleFor._id}/decision`,
        payload,
        authConfig()
      );
      setScheduleFor(null);
      setSchedule(emptySchedule);
      await load();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to update request.");
    } finally {
      setWorkingId(null);
    }
  };

  const cancelAppointment = async (appointment) => {
    if (!window.confirm("Cancel this counseling appointment?")) return;
    try {
      setWorkingId(appointment._id);
      await axios.put(
        `${API_BASE}/api/counseling/appointments/${appointment._id}/cancel`,
        {},
        authConfig()
      );
      await load();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to cancel appointment.");
    } finally {
      setWorkingId(null);
    }
  };

  const complete = async (appointment, outcome) => {
    try {
      setWorkingId(appointment._id);
      await axios.put(
        `${API_BASE}/api/counseling/appointments/${appointment._id}/complete`,
        { outcome },
        authConfig()
      );
      await load();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to update appointment outcome.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-6xl w-full p-6 shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-xl font-bold text-gray-800">👨‍🏫 Counseling Appointments</h3>
            <p className="text-xs text-gray-500 mt-1">Review requests, confirm a time, or propose an alternative.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading appointments…</div>
        ) : appointments.length === 0 ? (
          <div className="border rounded-xl p-10 text-center text-sm text-gray-400">No counseling requests yet.</div>
        ) : (
          <div className="overflow-y-auto space-y-3">
            {appointments.map((appointment) => {
              const start = appointment.scheduledStart || appointment.requestedStart;
              const end = appointment.scheduledEnd || appointment.requestedEnd;
              return (
                <div key={appointment._id} className="border rounded-xl p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-bold text-gray-800">{appointment.student?.name || "Student"}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {appointment.student?.id_no || ""}
                        {appointment.student?.course ? ` • ${appointment.student.course}` : ""}
                        {appointment.student?.semester ? ` • Sem ${appointment.student.semester}` : ""}
                        {appointment.student?.division ? ` • Div ${appointment.student.division}` : ""}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusStyle[appointment.status] || statusStyle.CANCELLED}`}>
                      {appointment.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                    <div><b>Reason:</b> {appointment.reason}</div>
                    <div><b>Requested:</b> {formatDateTime(appointment.requestedStart)} – {appointment.requestedEnd ? new Date(appointment.requestedEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                    <div><b>Scheduled:</b> {formatDateTime(start)} – {end ? new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                    <div><b>Location:</b> {appointment.location || "Not specified"}</div>
                  </div>

                  {appointment.details && (
                    <div className="mt-2 text-xs bg-gray-50 border rounded-lg p-2 text-gray-600">
                      <b>Student details:</b> {appointment.details}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {["REQUESTED", "PROPOSED"].includes(appointment.status) && (
                      <button
                        disabled={workingId === appointment._id}
                        onClick={() => openDecision(appointment)}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60"
                      >
                        Accept / Propose
                      </button>
                    )}
                    {["REQUESTED", "PROPOSED", "CONFIRMED"].includes(appointment.status) && (
                      <button
                        disabled={workingId === appointment._id}
                        onClick={() => cancelAppointment(appointment)}
                        className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    )}
                    {appointment.status === "CONFIRMED" && (
                      <>
                        <button
                          disabled={workingId === appointment._id}
                          onClick={() => complete(appointment, "COMPLETED")}
                          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60"
                        >
                          Mark Completed
                        </button>
                        <button
                          disabled={workingId === appointment._id}
                          onClick={() => complete(appointment, "NO_SHOW")}
                          className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60"
                        >
                          Mark No-Show
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {scheduleFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="font-bold text-gray-800">Respond to Counseling Request</h4>
                <p className="text-xs text-gray-500 mt-1">Choose Accept, Propose another time, or Reject.</p>
              </div>
              <button onClick={() => setScheduleFor(null)}>✕</button>
            </div>

            <div className="text-xs bg-gray-50 border rounded-lg p-3 mb-3">
              <b>{scheduleFor.student?.name}</b> — {scheduleFor.reason}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Date</label>
                <input
                  type="date"
                  value={schedule.date}
                  onChange={(e) => setSchedule({ ...schedule, date: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Start</label>
                <input
                  type="time"
                  value={schedule.startTime}
                  onChange={(e) => setSchedule({ ...schedule, startTime: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">End</label>
                <input
                  type="time"
                  value={schedule.endTime}
                  onChange={(e) => setSchedule({ ...schedule, endTime: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Meeting Location</label>
              <input
                value={schedule.location}
                onChange={(e) => setSchedule({ ...schedule, location: e.target.value })}
                maxLength={200}
                placeholder="Faculty Cabin / Lab / Online"
                className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
              />
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Message</label>
              <textarea
                value={schedule.message}
                onChange={(e) => setSchedule({ ...schedule, message: e.target.value })}
                maxLength={1000}
                rows={3}
                placeholder="Message for the student"
                className="w-full border rounded-lg p-2 text-sm bg-white outline-none resize-none"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button onClick={() => submitDecision("REJECT")} className="bg-red-50 text-red-600 border border-red-200 rounded-lg py-2 text-sm font-semibold">
                Reject
              </button>
              <button onClick={() => submitDecision("PROPOSE")} className="bg-purple-600 text-white rounded-lg py-2 text-sm font-semibold">
                Propose Time
              </button>
              <button onClick={() => submitDecision("ACCEPT")} className="bg-green-600 text-white rounded-lg py-2 text-sm font-semibold">
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
