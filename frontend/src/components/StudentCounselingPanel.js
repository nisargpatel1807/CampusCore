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

export default function StudentCounselingPanel({ onClose }) {
  const [teachers, setTeachers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [form, setForm] = useState({
    teacherId: "",
    reason: "",
    details: "",
    date: "",
    startTime: "",
    endTime: "",
  });

  const load = async () => {
    try {
      setLoading(true);
      const [teacherRes, appointmentRes] = await Promise.all([
        axios.get(`${API_BASE}/api/counseling/teachers`, authConfig()),
        axios.get(`${API_BASE}/api/counseling/appointments/student`, authConfig()),
      ]);
      setTeachers(Array.isArray(teacherRes.data) ? teacherRes.data : []);
      setAppointments(Array.isArray(appointmentRes.data) ? appointmentRes.data : []);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load counseling data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.teacherId || !form.date || !form.startTime || !form.endTime) {
      return alert("Please select teacher, date, start time and end time.");
    }
    if (form.reason.trim().length < 3) return alert("Please enter a valid reason.");

    const requestedStart = new Date(`${form.date}T${form.startTime}`);
    const requestedEnd = new Date(`${form.date}T${form.endTime}`);
    if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
      return alert("Please provide a valid date and time.");
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_BASE}/api/counseling/appointments`,
        {
          teacherId: form.teacherId,
          reason: form.reason.trim(),
          details: form.details.trim(),
          requestedStart: requestedStart.toISOString(),
          requestedEnd: requestedEnd.toISOString(),
        },
        authConfig()
      );

      alert("Counseling request sent successfully. 📅");
      setForm({ teacherId: "", reason: "", details: "", date: "", startTime: "", endTime: "" });
      await load();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to send counseling request.");
    } finally {
      setSaving(false);
    }
  };

  const confirmProposal = async (appointment) => {
    try {
      await axios.put(
        `${API_BASE}/api/counseling/appointments/${appointment._id}/confirm`,
        {},
        authConfig()
      );
      await load();
      alert("Proposed appointment time confirmed. ✅");
    } catch (error) {
      alert(error.response?.data?.message || "Failed to confirm appointment.");
    }
  };

  const cancelAppointment = async (appointment) => {
    if (!window.confirm("Cancel this counseling appointment?")) return;
    try {
      await axios.put(
        `${API_BASE}/api/counseling/appointments/${appointment._id}/cancel`,
        {},
        authConfig()
      );
      await load();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to cancel appointment.");
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">Loading counseling…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-6xl w-full p-6 shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-xl font-bold text-gray-800">👨‍🏫 Teacher Counseling</h3>
            <p className="text-xs text-gray-500 mt-1">Request a private appointment with a faculty member.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 overflow-y-auto">
          <form onSubmit={handleSubmit} className="bg-gray-50 border rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-gray-800">Book a Counseling Appointment</h4>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Teacher</label>
              <select
                value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
              >
                <option value="">Select teacher</option>
                {teachers.map((teacher) => (
                  <option key={teacher._id} value={teacher._id}>
                    {teacher.name} {teacher.department ? `• ${teacher.department}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Reason</label>
              <input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                maxLength={300}
                placeholder="Project discussion / Academic guidance / Other"
                className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Details (optional)</label>
              <textarea
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                maxLength={1500}
                rows={4}
                placeholder="Briefly explain what you want to discuss."
                className="w-full border rounded-lg p-2 text-sm bg-white outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Start</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">End</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm bg-white outline-none"
                />
              </div>
            </div>

            <p className="text-[11px] text-gray-500">The teacher can accept your requested time or propose another time.</p>

            <button
              disabled={saving}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm"
            >
              {saving ? "Sending…" : "Request Appointment"}
            </button>
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-800">My Appointments ({appointments.length})</h4>
            </div>

            {appointments.length === 0 ? (
              <div className="border rounded-xl p-6 text-center text-sm text-gray-400">No counseling appointments yet.</div>
            ) : (
              appointments.map((appointment) => {
                const start = appointment.scheduledStart || appointment.requestedStart;
                const end = appointment.scheduledEnd || appointment.requestedEnd;
                return (
                  <div key={appointment._id} className="border rounded-xl p-4 hover:bg-gray-50">
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="font-bold text-gray-800">{appointment.teacher?.name || "Faculty"}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{appointment.reason}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusStyle[appointment.status] || statusStyle.CANCELLED}`}>
                        {appointment.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-gray-600 space-y-1">
                      <div>📅 {formatDateTime(start)} – {end ? new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                      {appointment.location && <div>📍 {appointment.location}</div>}
                      {appointment.teacherMessage && <div>💬 {appointment.teacherMessage}</div>}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {appointment.status === "PROPOSED" && (
                        <button onClick={() => confirmProposal(appointment)} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold">
                          Confirm Proposed Time
                        </button>
                      )}
                      {["REQUESTED", "PROPOSED", "CONFIRMED"].includes(appointment.status) && (
                        <button onClick={() => cancelAppointment(appointment)} className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg font-semibold">
                          Cancel
                        </button>
                      )}
                      <button onClick={() => setSelectedAppointment(appointment)} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-semibold">
                        Details
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {selectedAppointment && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold">Appointment Details</h4>
                <button onClick={() => setSelectedAppointment(null)}>✕</button>
              </div>
              <div className="text-sm space-y-2 text-gray-700">
                <div><b>Teacher:</b> {selectedAppointment.teacher?.name}</div>
                <div><b>Reason:</b> {selectedAppointment.reason}</div>
                <div><b>Requested:</b> {formatDateTime(selectedAppointment.requestedStart)} – {selectedAppointment.requestedEnd ? new Date(selectedAppointment.requestedEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                <div><b>Scheduled:</b> {formatDateTime(selectedAppointment.scheduledStart)} – {selectedAppointment.scheduledEnd ? new Date(selectedAppointment.scheduledEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                <div><b>Location:</b> {selectedAppointment.location || "Not specified"}</div>
                <div><b>Status:</b> {selectedAppointment.status.replace("_", " ")}</div>
                {selectedAppointment.details && <div><b>Details:</b> {selectedAppointment.details}</div>}
                {selectedAppointment.teacherMessage && <div><b>Teacher message:</b> {selectedAppointment.teacherMessage}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
