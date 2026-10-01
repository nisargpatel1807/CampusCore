import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api/student";
const CATEGORIES = [
  ["Projector Issue", "Projector Not Working"],
  ["Computer Breakdown", "Computer / Lab PC Broken"],
  ["Fan / AC Problem", "Fan / AC Broken"],
  ["Classroom Light", "Classroom Light Broken"],
  ["Washroom Maintenance", "Washroom Issue"],
  ["Wi-Fi Connectivity", "Wi-Fi / Internet Problem"],
];
const statusClass = (status) => ({
  "Pending Review": "bg-slate-100 text-slate-700",
  Assigned: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  "Awaiting Verification": "bg-purple-100 text-purple-700",
  Fixed: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
}[status] || "bg-gray-100 text-gray-600");
const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";

export default function StudentHelpdeskPanel({ token, user, startInNew = false, onClose }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState(startInNew ? "new" : "list");
  const [form, setForm] = useState({ category: "Projector Issue", location: "", description: "", confirmGenuine: false });
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const response = await axios.get(`${API}/service-requests`, auth);
      const data = response.data || [];
      setRequests(data);
      if (!selectedId && data[0]?._id) setSelectedId(data[0]._id);
    } catch (error) { alert(error.response?.data?.message || "Failed to load Helpdesk requests."); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => requests.find((item) => String(item._id) === String(selectedId)) || null, [requests, selectedId]);

  const submit = async (event) => {
    event.preventDefault();
    const location = form.location.trim();
    const description = form.description.trim();
    if (location.length < 2 || location.length > 100) return alert("Location / room number must be between 2 and 100 characters.");
    if (description.length < 10 || description.length > 1000) return alert("Description must be between 10 and 1000 characters.");
    if (!form.confirmGenuine) return alert("Please confirm that this complaint is genuine before submitting.");
    if (photos.length > 3) return alert("You can attach a maximum of 3 photos.");
    for (const photo of photos) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) return alert("Photos must be JPG, PNG or WEBP.");
      if (photo.size > 5 * 1024 * 1024) return alert("Each photo must be 5 MB or smaller.");
    }
    const fd = new FormData();
    fd.append("category", form.category); fd.append("location", location); fd.append("description", description); fd.append("confirmGenuine", String(form.confirmGenuine));
    photos.forEach((photo) => fd.append("photos", photo));
    try {
      setSubmitting(true);
      const response = await axios.post(`${API}/service-requests`, fd, { headers: { ...auth.headers, "Content-Type": "multipart/form-data" } });
      setForm({ category: "Projector Issue", location: "", description: "", confirmGenuine: false });
      setPhotos([]); setView("list");
      await load();
      setSelectedId(response.data?.request?._id || null);
      alert(response.data.message || "Complaint registered successfully. 🛠️");
    } catch (error) { alert(error.response?.data?.message || "Failed to submit request."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-5 border-b flex items-start justify-between gap-4"><div><h3 className="text-xl font-bold text-gray-800">🛠️ Campus Facility Helpdesk</h3><p className="text-xs text-gray-500 mt-1">Raise a genuine request and track every update until closure.</p></div><div className="flex gap-2"><button type="button" onClick={() => setView("new")} className="bg-blue-600 text-white rounded-lg px-3 py-2 text-xs font-semibold">+ Raise Complaint</button><button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button></div></div>
        <div className="flex-1 overflow-hidden grid md:grid-cols-[330px_1fr]">
          <div className="border-r overflow-y-auto p-3 bg-gray-50">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">My Requests</p>
            {requests.length === 0 ? <p className="text-xs text-gray-400 py-8 text-center">No requests yet.</p> : requests.map((request) => <button type="button" key={request._id} onClick={() => { setSelectedId(request._id); setView("details"); }} className={`w-full text-left rounded-xl border p-3 mb-2 bg-white ${String(selectedId) === String(request._id) && view !== "new" ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"}`}><div className="flex justify-between gap-2"><div><p className="font-semibold text-xs text-gray-800">{request.category}</p><p className="text-[11px] text-blue-600 mt-1">{request.location}</p></div><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusClass(request.status)}`}>{request.status}</span></div><p className="text-[10px] text-gray-400 mt-2">{formatDate(request.createdAt)}</p></button>)}
          </div>

          <div className="overflow-y-auto p-5">
            {view === "new" ? (
              <form onSubmit={submit} className="max-w-2xl mx-auto space-y-4"><div><h4 className="text-lg font-bold text-gray-800">New Infrastructure Complaint</h4><p className="text-xs text-gray-500 mt-1">Your Student ID is automatically linked to this request.</p></div><div className="grid md:grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-gray-600">Student ID</label><input value={user?.id_no || ""} disabled className="w-full mt-1 border rounded-lg p-2.5 text-xs bg-gray-100 text-gray-500"/></div><div><label className="text-xs font-semibold text-gray-600">Student Name</label><input value={user?.name || ""} disabled className="w-full mt-1 border rounded-lg p-2.5 text-xs bg-gray-100 text-gray-500"/></div></div><div><label className="text-xs font-semibold text-gray-600">Issue Category *</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full mt-1 border rounded-lg p-2.5 text-xs bg-white">{CATEGORIES.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></div><div><label className="text-xs font-semibold text-gray-600">Location / Room No *</label><input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Room 204 or CS Lab 2" className="w-full mt-1 border rounded-lg p-2.5 text-xs"/></div><div><label className="text-xs font-semibold text-gray-600">Detailed Description *</label><textarea required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the problem clearly..." className="w-full mt-1 border rounded-lg p-2.5 text-xs"/></div><div><label className="text-xs font-semibold text-gray-600">Request Photos <span className="font-normal text-gray-400">(optional, max 3)</span></label><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => { const selected = Array.from(e.target.files || []); if (selected.length > 3) { e.target.value = ""; return alert("You can attach a maximum of 3 photos."); } setPhotos(selected); }} className="w-full mt-1 border rounded-lg p-2 text-xs"/><p className="text-[10px] text-gray-400 mt-1">JPG / PNG / WEBP • max 5 MB each</p></div><label className="flex gap-2 items-start rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900"><input type="checkbox" checked={form.confirmGenuine} onChange={(e) => setForm({ ...form, confirmGenuine: e.target.checked })} className="mt-0.5"/><span>I confirm this complaint is genuine and the information above is accurate.</span></label><div className="flex gap-2"><button type="button" onClick={() => setView("list")} className="flex-1 border rounded-lg py-2.5 text-xs font-semibold">Cancel</button><button disabled={submitting} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-xs font-semibold disabled:opacity-50">{submitting ? "Submitting…" : "Submit Complaint"}</button></div></form>
            ) : selected ? (
              <div className="space-y-5"><div className="flex items-start justify-between"><div><h4 className="text-lg font-bold text-gray-800">Ticket HD-{String(selected._id).slice(-6)}</h4><p className="text-xs text-gray-500">{selected.category} • {selected.location}</p></div><span className={`px-3 py-1 rounded-full text-xs font-bold ${statusClass(selected.status)}`}>{selected.status}</span></div><div className="grid md:grid-cols-2 gap-4"><div className="bg-gray-50 rounded-xl p-4 text-sm"><p><b>Student ID:</b> {user?.id_no || selected.student?.id_no}</p><p className="mt-1"><b>Issue:</b> {selected.category}</p><p className="mt-1"><b>Location:</b> {selected.location}</p><p className="mt-1"><b>Description:</b> {selected.description}</p><p className="mt-2"><b>Assigned Staff:</b> {selected.assignedStaff?.name || "Waiting for assignment"}</p><p className="mt-2"><b>Staff Department:</b> {selected.assignedStaff?.department || "—"}</p><p className="mt-2"><b>Resolution:</b> {selected.resolutionNote || selected.staffNote || "Not submitted yet"}</p>{selected.adminNote && <p className="mt-2 text-blue-700"><b>Admin Note:</b> {selected.adminNote}</p>}</div><div><p className="text-xs font-semibold text-gray-600">Your Request Photos</p>{(selected.photoUrls || (selected.photoUrl ? [selected.photoUrl] : [])).map((url, i) => <a href={`http://localhost:5000${url}`} target="_blank" rel="noreferrer" key={url} className="block text-blue-600 underline text-xs mt-1">View Request Photo {i + 1}</a>)}{Array.isArray(selected.resolutionPhotos) && selected.resolutionPhotos.length > 0 && <><p className="text-xs font-semibold text-gray-600 mt-4">Completion Proof</p>{selected.resolutionPhotos.map((url, i) => <a href={`http://localhost:5000${url}`} target="_blank" rel="noreferrer" key={url} className="block text-blue-600 underline text-xs mt-1">View Proof Photo {i + 1}</a>)}</>}</div></div><div><h5 className="font-semibold text-sm text-gray-700 mb-2">Request Timeline</h5><div className="space-y-2">{(selected.history || []).slice().reverse().map((event, index) => <div key={index} className="border rounded-lg p-3"><div className="flex justify-between gap-3"><p className="text-xs font-semibold text-gray-800">{event.action}</p><p className="text-[10px] text-gray-400">{formatDate(event.createdAt)}</p></div><p className="text-[10px] text-gray-500 mt-1">{event.actorName} • {event.fromStatus || "—"} → {event.toStatus || "—"}</p>{event.note && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{event.note}</p>}</div>)}</div></div>{selected.status === "Awaiting Verification" && <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-xs text-purple-800">Your repair proof has been submitted. The Admin is now verifying the completion.</div>}{selected.status === "Fixed" && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">✅ This helpdesk request has been verified and closed.</div>}</div>
            ) : <div className="h-full flex items-center justify-center text-sm text-gray-400">Select a request or raise a new complaint.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
