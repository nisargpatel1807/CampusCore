import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api/admin";
const STATUS_CLASSES = {
  "Pending Review": "bg-slate-100 text-slate-700 border-slate-200",
  Assigned: "bg-blue-50 text-blue-700 border-blue-200",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
  "Awaiting Verification": "bg-purple-50 text-purple-700 border-purple-200",
  Fixed: "bg-green-50 text-green-700 border-green-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
};

const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";
const photosFor = (item, key) => {
  const many = Array.isArray(item?.[key]) ? item[key] : [];
  if (many.length) return many;
  return key === "photoUrls" && item?.photoUrl ? [item.photoUrl] : [];
};

export default function HelpdeskAdminPanel({ onClose }) {
  const token = localStorage.getItem("token");
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [requests, setRequests] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [reassigning, setReassigning] = useState(null);
  const [reassignStaffId, setReassignStaffId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [showStaffManager, setShowStaffManager] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: "", staffId: "", email: "", password: "", mobile: "", department: "Maintenance Staff" });
  const [busy, setBusy] = useState(false);
  const [verifyModal, setVerifyModal] = useState(null);
  const [returnNote, setReturnNote] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const [requestRes, staffRes] = await Promise.all([
        axios.get(`${API}/service-requests`, auth),
        axios.get(`${API}/service-staff?all=true`, auth),
      ]);
      setRequests(requestRes.data || []);
      setStaff(staffRes.data || []);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load Helpdesk data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeStaff = useMemo(() => staff.filter((item) => item.active), [staff]);

  const assign = async (request) => {
    const staffId = assignments[request._id] || "";
    if (!staffId) return alert("Please select a staff member first.");
    if (request.assignedStaff) return alert("This request is already assigned. Use Reassign Staff.");
    try {
      setBusy(true);
      const response = await axios.put(`${API}/service-requests/${request._id}/assign`, { staffId }, auth);
      await load();
      const message = response.data?.emailSent
        ? "Request assigned and email sent to the staff member. 📧"
        : response.data?.emailFailed
          ? `Request assigned, but email failed: ${response.data?.emailError || "provider rejected the message."}`
          : "Request assigned, but email was skipped because Brevo is not configured.";
      alert(message);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to assign request.");
    } finally { setBusy(false); }
  };

  const reassign = async () => {
    if (!reassigning || !reassignStaffId) return alert("Choose a new staff member.");
    if (reassignReason.trim().length < 5) return alert("Please provide a reassignment reason.");
    try {
      setBusy(true);
      const response = await axios.put(`${API}/service-requests/${reassigning._id}/reassign`, { staffId: reassignStaffId, reason: reassignReason.trim() }, auth);
      setReassigning(null); setReassignStaffId(""); setReassignReason("");
      await load();
      alert(response.data?.emailSent ? "Request reassigned and new staff notified by email. 📧" : "Request reassigned. Email was not sent; check Brevo configuration.");
    } catch (error) {
      alert(error.response?.data?.message || "Failed to reassign request.");
    } finally { setBusy(false); }
  };

  const saveStaff = async (e) => {
    e.preventDefault();
    const payload = {
      name: staffForm.name.trim(),
      staffId: staffForm.staffId.trim().toUpperCase(),
      email: staffForm.email.trim().toLowerCase(),
      password: staffForm.password,
      mobile: staffForm.mobile.trim(),
      department: staffForm.department.trim(),
    };
    if (payload.name.length < 2) return alert("Enter a valid staff name.");
    if (!/^[A-Z0-9_-]{3,30}$/.test(payload.staffId)) return alert("Staff ID must be 3–30 characters and use only letters, numbers, hyphens or underscores.");
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) return alert("Enter a valid email address.");
    if (!editingStaff && payload.password.length < 6) return alert("Password must be at least 6 characters for a new staff account.");
    if (editingStaff && payload.password && payload.password.length < 6) return alert("New password must be at least 6 characters.");
    try {
      setBusy(true);
      if (editingStaff) await axios.put(`${API}/service-staff/${editingStaff._id}`, payload, auth);
      else await axios.post(`${API}/service-staff`, payload, auth);
      setEditingStaff(null);
      setStaffForm({ name: "", staffId: "", email: "", password: "", mobile: "", department: "Maintenance Staff" });
      await load();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to save staff member.");
    } finally { setBusy(false); }
  };

  const toggleStaff = async (person) => {
    const next = !person.active;
    if (!next && !window.confirm(`Deactivate ${person.name}?`)) return;
    try {
      setBusy(true);
      await axios.patch(`${API}/service-staff/${person._id}/status`, { active: next }, auth);
      await load();
    } catch (error) { alert(error.response?.data?.message || "Failed to update staff status."); }
    finally { setBusy(false); }
  };

  const verify = async (action, request, note = "") => {
    try {
      setBusy(true);
      await axios.put(`${API}/service-requests/${request._id}/verify`, { action, note }, auth);
      setVerifyModal(null); setReturnNote("");
      await load();
    } catch (error) { alert(error.response?.data?.message || "Failed to update verification."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-800">🛠️ Campus Maintenance & Helpdesk</h3>
            <p className="text-xs text-gray-500 mt-1">Review tickets, assign or reassign staff, verify repairs, and keep a complete activity history.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowStaffManager((v) => !v)} className="bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-2 rounded-lg text-xs font-semibold">{showStaffManager ? "Hide Staff" : "Manage Staff"}</button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
          </div>
        </div>

        {showStaffManager && (
          <div className="p-4 border-b bg-gray-50">
            <div className="flex justify-between items-center mb-3"><h4 className="font-bold text-gray-800">Helpdesk Staff</h4><button
  type="button"
  onClick={() => {
    setEditingStaff(null);
    setShowStaffForm(true);
    setStaffForm({
      name: "",
      staffId: "",
      email: "",
      password: "",
      mobile: "",
      department: "Maintenance Staff"
    });
  }}
  className="text-xs bg-orange-600 text-white px-3 py-2 rounded-lg"
>
  + Add New Staff
</button></div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-44 overflow-y-auto">
              {staff.map((person) => (
                <div key={person._id} className={`rounded-xl border p-3 bg-white ${person.active ? "" : "opacity-60"}`}>
                  <div className="flex justify-between gap-2"><div><p className="font-semibold text-sm text-gray-800">{person.name}</p><p className="text-[11px] text-gray-500">{person.department}</p><p className="text-[11px] text-gray-400">Staff ID: {person.staffId || "Not set"}</p><p className="text-[11px] text-gray-400 break-all">{person.email}</p></div><span className={`text-[10px] font-bold px-2 py-1 rounded-full h-fit ${person.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>{person.active ? "Active" : "Inactive"}</span></div>
                  <div className="flex gap-2 mt-2"><button type="button" onClick={() => { setEditingStaff(person); setShowStaffForm(true); setStaffForm({ name: person.name, staffId: person.staffId || "", email: person.email, password: "", mobile: person.mobile || "", department: person.department }); }} className="flex-1 border text-xs rounded-lg py-1.5">Edit</button><button type="button" onClick={() => toggleStaff(person)} disabled={busy} className="flex-1 border text-xs rounded-lg py-1.5">{person.active ? "Deactivate" : "Activate"}</button></div>
                </div>
              ))}
            </div>
            {showStaffForm && (
              <form onSubmit={saveStaff} className="mt-3 bg-white border rounded-xl p-3 grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                <input required value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} placeholder="Full name" className="border rounded-lg p-2 text-xs" />
                <input required value={staffForm.staffId} onChange={(e) => setStaffForm({ ...staffForm, staffId: e.target.value.toUpperCase() })} placeholder="Staff ID (e.g. HD001)" maxLength={30} className="border rounded-lg p-2 text-xs" />
                <input required type="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="Email" className="border rounded-lg p-2 text-xs" />
                <input type="password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} placeholder={editingStaff ? "New password (optional)" : "Password (min 6 chars)"} autoComplete="new-password" maxLength={100} className="border rounded-lg p-2 text-xs" />
                <input value={staffForm.mobile} onChange={(e) => setStaffForm({ ...staffForm, mobile: e.target.value })} placeholder="Mobile (optional)" className="border rounded-lg p-2 text-xs" />
                <select value={staffForm.department} onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })} className="border rounded-lg p-2 text-xs bg-white"><option>Maintenance Staff</option><option>IT Support</option><option>Electrical</option><option>Cleaning Staff</option><option>Security</option><option>Other</option></select>
                <div className="md:col-span-2 lg:col-span-3 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-gray-400">{editingStaff ? "Leave password blank to keep the current password." : "Staff ID + password will be used for Helpdesk Staff login."}</p>
                  <div className="flex gap-2"><button type="button" onClick={() => { setEditingStaff(null); setShowStaffForm(false); }} className="border rounded-lg px-4 py-2 text-xs">Cancel</button><button disabled={busy} className="bg-orange-600 text-white rounded-lg px-4 py-2 text-xs font-semibold">{editingStaff ? "Save Changes" : "Add Staff"}</button></div>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {loading ? <p className="text-sm text-gray-500 p-6 text-center">Loading Helpdesk…</p> : (
            <table className="w-full text-left text-xs min-w-[1250px]">
              <thead className="bg-gray-50 sticky top-0 z-10 text-[11px] uppercase text-gray-500 border-b"><tr><th className="p-3">Ticket / Location</th><th className="p-3">Issue</th><th className="p-3">Student</th><th className="p-3">Description</th><th className="p-3">Request Photos</th><th className="p-3 min-w-[240px]">Assignment</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
              <tbody className="divide-y">
                {requests.length === 0 ? <tr><td colSpan="8" className="p-10 text-center text-gray-400">No helpdesk requests found.</td></tr> : requests.map((request) => {
                  const reqPhotos = photosFor(request, "photoUrls");
                  const assigned = Boolean(request.assignedStaff);
                  return <tr key={request._id} className="align-top hover:bg-gray-50">
                    <td className="p-3"><button type="button" onClick={() => setSelected(request)} className="font-bold text-blue-700 hover:underline">HD-{String(request._id).slice(-6)}</button><div className="font-semibold text-gray-800 mt-1">{request.location}</div><div className="text-[10px] text-gray-400">{formatDate(request.createdAt)}</div></td>
                    <td className="p-3 font-semibold text-purple-700">{request.category}</td>
                    <td className="p-3"><div className="font-semibold">{request.student?.name || "—"}</div><div className="text-[10px] text-gray-400">ID: {request.student?.id_no || "—"}</div></td>
                    <td className="p-3 max-w-[230px] text-gray-600">{request.description}</td>
                    <td className="p-3">{reqPhotos.length ? reqPhotos.map((url, i) => <a key={url} href={`http://localhost:5000${url}`} target="_blank" rel="noreferrer" className="block text-blue-600 underline">View {i + 1}</a>) : <span className="text-gray-400">None</span>}</td>
                    <td className="p-3">
                      {assigned ? <>
                        <div className="font-semibold text-gray-800">{request.assignedStaff?.name}</div><div className="text-[10px] text-gray-400">{request.assignedStaff?.department}</div>
                        {(request.status !== "Fixed" && request.status !== "Rejected") && <button type="button" onClick={() => { setReassigning(request); setReassignStaffId(""); setReassignReason(""); }} className="mt-2 w-full border border-blue-200 text-blue-700 py-1.5 rounded-lg font-semibold">Reassign Staff</button>}
                      </> : <>
                        <select value={assignments[request._id] || ""} onChange={(e) => setAssignments((prev) => ({ ...prev, [request._id]: e.target.value }))} className="w-full border rounded-lg p-2 bg-white"><option value="">Select active staff</option>{activeStaff.map((person) => <option key={person._id} value={person._id}>{person.name} — {person.department}</option>)}</select>
                        <button type="button" onClick={() => assign(request)} disabled={busy || !assignments[request._id]} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg font-semibold">Assign & Send Email</button>
                      </>}
                    </td>
                    <td className="p-3"><span className={`inline-block border rounded-full px-2.5 py-1 font-bold ${STATUS_CLASSES[request.status] || "bg-gray-100 text-gray-600"}`}>{request.status}</span></td>
                    <td className="p-3 space-y-2 min-w-[155px]">
                      <button type="button" onClick={() => setSelected(request)} className="w-full border rounded-lg py-1.5 font-semibold">View Details</button>
                      {request.status === "Awaiting Verification" && <button type="button" onClick={() => setVerifyModal(request)} className="w-full bg-green-600 text-white rounded-lg py-1.5 font-semibold">Verify Repair</button>}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {reassigning && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70]"><div className="bg-white rounded-xl w-full max-w-md p-5 shadow-2xl"><h4 className="font-bold text-gray-800">Reassign Helpdesk Request</h4><p className="text-xs text-gray-500 mt-1">Current: {reassigning.assignedStaff?.name}</p><select value={reassignStaffId} onChange={(e) => setReassignStaffId(e.target.value)} className="w-full border rounded-lg p-2.5 mt-3 text-sm"><option value="">Choose new staff</option>{activeStaff.filter((person) => String(person._id) !== String(reassigning.assignedStaff?._id)).map((person) => <option key={person._id} value={person._id}>{person.name} — {person.department}</option>)}</select><textarea rows="3" value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} placeholder="Why does this request need reassignment?" className="w-full border rounded-lg p-2.5 mt-2 text-sm"/><div className="flex gap-2 mt-3"><button type="button" onClick={() => setReassigning(null)} className="flex-1 border rounded-lg py-2">Cancel</button><button type="button" onClick={reassign} disabled={busy} className="flex-1 bg-blue-600 text-white rounded-lg py-2 font-semibold">Reassign & Notify</button></div></div></div>}

      {verifyModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70]"><div className="bg-white rounded-xl w-full max-w-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto"><div className="flex justify-between"><h4 className="font-bold text-gray-800">Verify Completed Repair</h4><button type="button" onClick={() => setVerifyModal(null)}>✕</button></div><div className="mt-3 grid md:grid-cols-2 gap-4"><div><p className="text-xs text-gray-500">Ticket</p><p className="font-semibold">HD-{String(verifyModal._id).slice(-6)}</p><p className="text-xs text-gray-500 mt-2">Student</p><p className="font-semibold">{verifyModal.student?.name} ({verifyModal.student?.id_no})</p><p className="text-xs text-gray-500 mt-2">Staff</p><p className="font-semibold">{verifyModal.assignedStaff?.name}</p><p className="text-xs text-gray-500 mt-2">Resolution</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{verifyModal.resolutionNote || verifyModal.staffNote || "—"}</p></div><div><p className="text-xs font-semibold text-gray-600">Completion Proof</p><div className="grid grid-cols-2 gap-2 mt-2">{photosFor(verifyModal, "resolutionPhotos").map((url, i) => <a key={url} href={`http://localhost:5000${url}`} target="_blank" rel="noreferrer" className="border rounded-lg overflow-hidden text-center"><img src={`http://localhost:5000${url}`} alt={`Proof ${i + 1}`} className="w-full h-32 object-cover"/><span className="block text-[10px] text-blue-600 py-1">View Photo {i + 1}</span></a>)}</div></div></div><div className="mt-4 flex flex-col sm:flex-row gap-2"><button type="button" onClick={() => verify("approve", verifyModal)} disabled={busy} className="flex-1 bg-green-600 text-white rounded-lg py-2.5 font-semibold">Approve & Close ✅</button><button type="button" onClick={() => setReturnNote("")} className="flex-1 bg-amber-500 text-white rounded-lg py-2.5 font-semibold">Return for More Work</button></div><div className="mt-3"><textarea rows="3" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="Return note (required only when sending back)" className="w-full border rounded-lg p-2.5 text-sm"/><button type="button" onClick={() => verify("return", verifyModal, returnNote.trim())} disabled={busy || returnNote.trim().length < 5} className="w-full mt-2 border border-amber-300 text-amber-700 rounded-lg py-2 font-semibold disabled:opacity-50">Send Back to Staff</button></div></div></div>}

      {selected && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[65]"><div className="bg-white rounded-xl w-full max-w-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto"><div className="flex justify-between"><div><h4 className="font-bold text-lg">Helpdesk Ticket HD-{String(selected._id).slice(-6)}</h4><p className="text-xs text-gray-500">Complete request timeline</p></div><button type="button" onClick={() => setSelected(null)}>✕</button></div><div className="grid md:grid-cols-2 gap-4 mt-4"><div className="bg-gray-50 rounded-xl p-3 text-sm"><p><b>Student:</b> {selected.student?.name} ({selected.student?.id_no})</p><p className="mt-1"><b>Issue:</b> {selected.category}</p><p className="mt-1"><b>Location:</b> {selected.location}</p><p className="mt-1"><b>Status:</b> {selected.status}</p><p className="mt-1"><b>Staff:</b> {selected.assignedStaff?.name || "Not assigned"}</p><p className="mt-2 whitespace-pre-wrap"><b>Description:</b> {selected.description}</p><p className="mt-2"><b>Admin Note:</b> {selected.adminNote || "—"}</p><p className="mt-2"><b>Resolution:</b> {selected.resolutionNote || selected.staffNote || "—"}</p></div><div><p className="font-semibold text-xs text-gray-600 mb-2">Request Photos</p>{photosFor(selected, "photoUrls").map((url, i) => <a key={url} href={`http://localhost:5000${url}`} target="_blank" rel="noreferrer" className="block text-blue-600 underline text-xs mb-1">View Request Photo {i + 1}</a>)}{photosFor(selected, "resolutionPhotos").length > 0 && <><p className="font-semibold text-xs text-gray-600 mt-4 mb-2">Completion Proof</p>{photosFor(selected, "resolutionPhotos").map((url, i) => <a key={url} href={`http://localhost:5000${url}`} target="_blank" rel="noreferrer" className="block text-blue-600 underline text-xs mb-1">View Proof Photo {i + 1}</a>)}</>}</div></div><div className="mt-5"><p className="font-semibold text-sm text-gray-700 mb-2">Activity Timeline</p><div className="space-y-2">{(selected.history || []).slice().reverse().map((event, index) => <div key={index} className="border rounded-lg p-2.5 bg-white"><div className="flex justify-between gap-3"><p className="font-semibold text-xs text-gray-800">{event.action}</p><p className="text-[10px] text-gray-400">{formatDate(event.createdAt)}</p></div><p className="text-[10px] text-gray-500 mt-1">{event.actorName} • {event.fromStatus || "—"} → {event.toStatus || "—"}</p>{event.note && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{event.note}</p>}</div>)}</div></div></div></div>}
    </div>
  );
}
