import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api/helpdesk-staff";
const BASE = "http://localhost:5000";
const statusClass = (status) => ({ Assigned: "bg-blue-100 text-blue-700", "In Progress": "bg-amber-100 text-amber-700", "Awaiting Verification": "bg-purple-100 text-purple-700", Fixed: "bg-green-100 text-green-700", Rejected: "bg-red-100 text-red-700" }[status] || "bg-gray-100 text-gray-600");
const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";

export default function StaffDashboard() {
  const [staffToken, setStaffToken] = useState(() => sessionStorage.getItem("helpdeskStaffToken") || "");
  const [staff, setStaff] = useState(null);
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [proofPhotos, setProofPhotos] = useState([]);
  const [newUrlToken] = useState(() => new URLSearchParams(window.location.search).get("token") || "");
  const [ticketFromUrl] = useState(() => new URLSearchParams(window.location.search).get("ticketId") || "");

  useEffect(() => {
    if (newUrlToken) {
      sessionStorage.setItem("helpdeskStaffToken", newUrlToken);
      setStaffToken(newUrlToken);
      window.history.replaceState({}, document.title, "/staff/helpdesk");
    }
  }, [newUrlToken]);

  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${staffToken}` } }), [staffToken]);

  const load = async (preferredId = "") => {
    if (!staffToken) { setError("This page must be opened from a valid CampusCore Helpdesk staff link."); setLoading(false); return; }
    try {
      setLoading(true); setError("");
      const [meRes, reqRes] = await Promise.all([axios.get(`${API}/me`, auth), axios.get(`${API}/requests`, auth)]);
      setStaff(meRes.data?.staff || null);
      const data = reqRes.data || [];
      setRequests(data);
      const nextId = preferredId && data.some((item) => String(item._id) === String(preferredId)) ? preferredId : data[0]?._id || null;
      setSelectedId(nextId);
    } catch (err) {
      setError(err.response?.data?.message || "Your staff access link is invalid or expired.");
    } finally { setLoading(false); }
  };

 useEffect(() => {
  if (staffToken) {
    load(ticketFromUrl);
  } else {
    setLoading(false);
    setError(
      "This page must be opened from a valid CampusCore Helpdesk staff link."
    );
  }
}, [staffToken]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = requests.find((item) => String(item._id) === String(selectedId)) || null;

  const accept = async () => {
    if (!selected) return;
    try { setActionBusy(true); await axios.put(`${API}/requests/${selected._id}/accept`, {}, auth); await load(selected._id); }
    catch (err) { alert(err.response?.data?.message || "Failed to accept request."); }
    finally { setActionBusy(false); }
  };

  const resolve = async (event) => {
    event.preventDefault();
    if (!selected) return;
    if (resolutionNote.trim().length < 10) return alert("Resolution details must be at least 10 characters.");
    if (proofPhotos.length < 1 || proofPhotos.length > 2) return alert("Upload 1 or 2 completion proof photos.");
    const fd = new FormData(); fd.append("resolutionNote", resolutionNote.trim()); proofPhotos.forEach((file) => fd.append("proofPhotos", file));
    try { setActionBusy(true); await axios.put(`${API}/requests/${selected._id}/resolve`, fd, { headers: { ...auth.headers, "Content-Type": "multipart/form-data" } }); setResolutionNote(""); setProofPhotos([]); await load(selected._id); alert("Resolution submitted. Waiting for Admin verification. ✅"); }
    catch (err) { alert(err.response?.data?.message || "Failed to submit resolution."); }
    finally { setActionBusy(false); }
  };

  const logout = () => { sessionStorage.removeItem("helpdeskStaffToken"); window.location.href = "/"; };

  if (loading) return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">Loading Helpdesk Staff Workspace…</div>;
  if (error) return <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl p-7 max-w-md w-full text-center"><div className="text-4xl">🔐</div><h2 className="font-bold text-lg mt-3 text-gray-800">Staff Access Unavailable</h2><p className="text-sm text-gray-500 mt-2">{error}</p><button type="button" onClick={() => window.location.href = "/"} className="mt-5 bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-semibold">Back to CampusCore</button></div></div>;

  return <div className="min-h-screen bg-gray-100 font-sans"><div className="bg-blue-900 text-white p-5 shadow"><div className="max-w-7xl mx-auto flex items-center justify-between"><div><h1 className="text-xl font-bold">🛠️ CampusCore Helpdesk Staff</h1><p className="text-xs text-blue-200 mt-1">{staff?.name} • {staff?.department}</p></div><button type="button" onClick={logout} className="bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-xs font-semibold">End Session</button></div></div>
    <div className="max-w-7xl mx-auto p-5"><div className="grid lg:grid-cols-[360px_1fr] gap-5"><div className="bg-white rounded-2xl shadow-sm border p-4 h-fit"><div className="flex justify-between items-center mb-3"><h2 className="font-bold text-gray-800">My Assigned Requests</h2><span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-1 font-bold">{requests.length}</span></div>{requests.length === 0 ? <p className="text-sm text-gray-400 py-10 text-center">No requests assigned yet.</p> : requests.map((request) => <button type="button" key={request._id} onClick={() => setSelectedId(request._id)} className={`w-full text-left border rounded-xl p-3 mb-2 ${String(selectedId) === String(request._id) ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"}`}><div className="flex justify-between gap-2"><div><p className="font-semibold text-xs text-gray-800">HD-{String(request._id).slice(-6)}</p><p className="text-[11px] text-blue-600 mt-1">{request.category}</p><p className="text-[10px] text-gray-400 mt-1">{request.location}</p></div><span className={`text-[10px] font-bold px-2 py-1 rounded-full h-fit ${statusClass(request.status)}`}>{request.status}</span></div></button>)}</div>
      {selected ? <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-gray-400">Ticket HD-{String(selected._id).slice(-6)}</p><h2 className="text-xl font-bold text-gray-800 mt-1">{selected.category}</h2><p className="text-sm text-gray-500">{selected.location}</p></div><span className={`px-3 py-1.5 rounded-full text-xs font-bold h-fit ${statusClass(selected.status)}`}>{selected.status}</span></div><div className="grid md:grid-cols-2 gap-4 mt-5"><div className="bg-gray-50 rounded-xl p-4 text-sm"><p><b>Student:</b> {selected.student?.name} ({selected.student?.id_no})</p><p className="mt-2"><b>Location:</b> {selected.location}</p><p className="mt-2"><b>Problem:</b> {selected.description}</p><p className="text-xs text-gray-400 mt-3">Submitted: {formatDate(selected.createdAt)}</p></div><div><p className="text-xs font-semibold text-gray-600 mb-2">Request Photos</p>{(selected.photoUrls || (selected.photoUrl ? [selected.photoUrl] : [])).map((url, i) => <a key={url} href={`${BASE}${url}`} target="_blank" rel="noreferrer" className="block text-blue-600 underline text-xs mt-1">View Request Photo {i + 1}</a>)}</div></div>
        {selected.status === "Assigned" && <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="font-semibold text-sm text-blue-900">Ready to start?</p><p className="text-xs text-blue-700 mt-1">Click Accept to officially start work. Admin and student will be notified.</p><button type="button" onClick={accept} disabled={actionBusy} className="mt-3 bg-blue-600 text-white rounded-lg px-5 py-2.5 text-xs font-semibold disabled:opacity-50">{actionBusy ? "Starting…" : "Accept Request & Start Work"}</button></div>}
        {selected.status === "In Progress" && <form onSubmit={resolve} className="mt-5 border rounded-xl p-4"><h3 className="font-bold text-gray-800">Complete Work & Submit Proof</h3><p className="text-xs text-gray-500 mt-1">Describe what you fixed, then upload 1–2 proof photos.</p><textarea required minLength="10" maxLength="1000" rows="5" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="Example: Replaced the damaged power cable and tested the computer successfully." className="w-full mt-3 border rounded-lg p-3 text-sm"/><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length > 2) { e.target.value = ""; return alert("Maximum 2 proof photos."); } setProofPhotos(files); }} className="w-full mt-3 border rounded-lg p-2.5 text-xs"/><p className="text-[10px] text-gray-400 mt-1">JPG / PNG / WEBP • 5 MB each • 1–2 photos required</p><button disabled={actionBusy} className="mt-3 bg-green-600 text-white rounded-lg px-5 py-2.5 text-xs font-semibold disabled:opacity-50">{actionBusy ? "Submitting…" : "Submit for Admin Verification"}</button></form>}
        {selected.status === "Awaiting Verification" && <div className="mt-5 rounded-xl border border-purple-200 bg-purple-50 p-4"><p className="font-semibold text-sm text-purple-900">⏳ Awaiting Admin Verification</p><p className="text-xs text-purple-700 mt-1">Your resolution and proof photos have been sent to Admin.</p></div>}
        {selected.status === "Fixed" && <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4"><p className="font-semibold text-sm text-green-900">✅ Request Closed</p><p className="text-xs text-green-700 mt-1">Admin verified your work.</p></div>}
        <div className="mt-6"><h3 className="font-bold text-sm text-gray-700 mb-2">Ticket Timeline</h3><div className="space-y-2">{(selected.history || []).slice().reverse().map((event, i) => <div key={i} className="border rounded-lg p-3"><div className="flex justify-between"><p className="text-xs font-semibold">{event.action}</p><p className="text-[10px] text-gray-400">{formatDate(event.createdAt)}</p></div><p className="text-[10px] text-gray-500 mt-1">{event.actorName} • {event.fromStatus || "—"} → {event.toStatus || "—"}</p>{event.note && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{event.note}</p>}</div>)}</div></div></div> : <div className="bg-white rounded-2xl shadow-sm border flex items-center justify-center min-h-[500px] text-sm text-gray-400">Select an assigned request.</div>}</div></div></div>;
}
