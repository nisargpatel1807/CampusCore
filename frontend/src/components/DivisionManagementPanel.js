import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api";
const today = () => new Date().toISOString().slice(0, 10);

export default function DivisionManagementPanel({ token, onClose }) {
  const [meta, setMeta] = useState({ courses: [] });
  const [divisions, setDivisions] = useState([]);
  const [students, setStudents] = useState([]);
  const [course, setCourse] = useState("");
  const [semester, setSemester] = useState("1");
  const [division, setDivision] = useState("");
  const [name, setName] = useState("A");
  const [capacity, setCapacity] = useState(60);
  const [search, setSearch] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [selected, setSelected] = useState([]);
  const [exportDate, setExportDate] = useState(today());
  const [exportDivision, setExportDivision] = useState("ALL");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const headers = { Authorization: `Bearer ${token}` };

  const load = async () => {
    if (!course) { setDivisions([]); setStudents([]); return; }
    try {
      const [ds, st] = await Promise.all([
        axios.get(`${API}/divisions`, { headers, params: { course, semester } }),
        axios.get(`${API}/divisions/students`, { headers, params: { course, semester, ...(unassignedOnly ? { unassigned: "true" } : {}) } }),
      ]);
      setDivisions(ds.data || []); setStudents(st.data || []); setSelected([]); setError("");
    } catch (e) { setError(e.response?.data?.message || "Unable to load division data."); }
  };
  useEffect(() => { (async () => { try { const r = await axios.get(`${API}/admin/academic-meta`, { headers }); setMeta(r.data || { courses: [] }); } catch (e) { setError("Unable to load academic courses."); } })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [course, semester, unassignedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const courseNames = (meta.courses || []).map(c => typeof c === "string" ? c : c.courseName).filter(Boolean);
  const filteredStudents = useMemo(() => students.filter(s => `${s.name || ""} ${s.id_no || ""} ${s.email || ""} ${s.division || "Unassigned"}`.toLowerCase().includes(search.toLowerCase())), [students, search]);
  const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every(s => selected.includes(s._id));
  const toggleAll = () => setSelected(allVisibleSelected ? selected.filter(id => !filteredStudents.some(s => s._id === id)) : [...new Set([...selected, ...filteredStudents.map(s => s._id)])]);
  const create = async e => { e.preventDefault(); try { await axios.post(`${API}/divisions`, { course, semester: Number(semester), name: name.toUpperCase(), capacity: Number(capacity) }, { headers }); setMessage("Division created."); setError(""); await load(); } catch (e) { setError(e.response?.data?.message || "Could not create division."); } };
  const bulkAssign = async () => { try { const r = await axios.put(`${API}/divisions/students/bulk-assignment`, { studentIds: selected, course, semester: Number(semester), division }, { headers }); setMessage(r.data?.message || "Student assignments updated."); setError(""); await load(); } catch (e) { setError(e.response?.data?.message || "Could not update selected students."); } };
  const exportExcel = () => {
    const exportStudents = students.filter(s => exportDivision === "ALL" || (exportDivision === "UNASSIGNED" ? !s.division : s.division === exportDivision));
    const rows = exportStudents.map(s => [s.id_no || "", s.name || [s.surname, s.firstName, s.secondName].filter(Boolean).join(" "), remark]);
    const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const html = `<html><head><meta charset="utf-8"></head><body><table><tr><th colspan="3">${esc(course)}</th></tr><tr><th colspan="3">Date: ${esc(exportDate)}</th></tr><tr><th>Enrollment ID</th><th>Student Name</th><th>Remark</th></tr>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Enrollment_${course.replace(/[^a-z0-9_-]/gi, "_")}_Sem${semester}_${exportDate}.xls`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/50 p-3 sm:p-5"><div className="mx-auto my-4 max-w-7xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
    <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-gray-900">Division Management</h2><p className="mt-1 text-sm text-gray-500">Create divisions, bulk-assign students, and export an enrollment sheet.</p></div><button onClick={onClose} className="rounded-lg border px-3 py-2">Close</button></div>
    {error && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}{message && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</div>}
    <div className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2"><label className="text-sm font-semibold">Course<select value={course} onChange={e => setCourse(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2"><option value="">Select course</option>{courseNames.map(c => <option key={c} value={c}>{c}</option>)}</select></label><label className="text-sm font-semibold">Semester<select value={semester} onChange={e => setSemester(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2">{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.5fr]">
      <section className="rounded-xl border p-4"><h3 className="mb-3 font-bold">Create / Manage Divisions</h3><form onSubmit={create} className="grid grid-cols-2 gap-2"><label className="text-xs">Division Name<input value={name} onChange={e => setName(e.target.value.toUpperCase())} maxLength={10} required className="mt-1 w-full rounded border p-2 uppercase" /></label><label className="text-xs">Capacity<input type="number" min="1" max="500" value={capacity} onChange={e => setCapacity(e.target.value)} required className="mt-1 w-full rounded border p-2" /></label><button disabled={!course} className="col-span-2 mt-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Create Division</button></form><div className="mt-4 space-y-2">{divisions.length ? divisions.map(d => <div key={d._id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm"><div><b>{d.name}</b><div className="text-xs text-gray-500">Capacity: {d.capacity}</div></div><div className="flex gap-2"><button onClick={async () => { const next = window.prompt("Rename division", d.name); if (next && next.trim()) { try { await axios.put(`${API}/divisions/${d._id}`, { name: next.toUpperCase() }, { headers }); await load(); } catch (e) { setError(e.response?.data?.message || "Could not rename division."); } } }} className="text-blue-600">Edit</button><button onClick={async () => { if (!window.confirm(`Delete division ${d.name}?`)) return; try { await axios.delete(`${API}/divisions/${d._id}`, { headers }); await load(); } catch (e) { setError(e.response?.data?.message || "Could not delete division."); } }} className="text-red-600">Delete</button></div></div>) : <p className="text-sm text-gray-500">No divisions created for this course and semester.</p>}</div></section>
      <section className="rounded-xl border p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">Student Division Assignment</h3><p className="text-xs text-gray-500">New students remain unassigned until the admin selects a division.</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">{selected.length} selected</span></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]"> <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, enrollment ID, email..." className="rounded-lg border p-2 text-sm" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unassignedOnly} onChange={e => setUnassignedOnly(e.target.checked)} />Unassigned only</label></div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><button onClick={toggleAll} disabled={!filteredStudents.length} className="rounded-lg border px-3 py-2 text-sm font-semibold">{allVisibleSelected ? "Deselect All" : "Select All Visible"}</button><select value={division} onChange={e => setDivision(e.target.value)} className="rounded-lg border p-2 text-sm"><option value="">Unassign selected</option>{divisions.map(d => <option key={d._id} value={d.name}>{d.name}</option>)}</select><button onClick={bulkAssign} disabled={!selected.length} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Apply to Selected</button></div>
        <div className="mt-3 max-h-[360px] overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-gray-100"><tr><th className="p-2"><input aria-label="Select all visible students" type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th><th className="p-2">Student</th><th className="p-2">Enrollment ID</th><th className="p-2">Division</th></tr></thead><tbody>{filteredStudents.map(s => <tr key={s._id} className="border-t"><td className="p-2"><input type="checkbox" checked={selected.includes(s._id)} onChange={e => setSelected(old => e.target.checked ? [...old, s._id] : old.filter(id => id !== s._id))} /></td><td className="p-2">{s.name}</td><td className="p-2 font-mono text-xs">{s.id_no}</td><td className="p-2">{s.division || "Unassigned"}</td></tr>)}{!filteredStudents.length && <tr><td colSpan="4" className="p-5 text-center text-gray-500">No students match these filters.</td></tr>}</tbody></table></div>
      </section>
    </div>
    <section className="mt-5 rounded-xl border p-4"><div className="mb-3"><h3 className="font-bold">Enrollment Export</h3><p className="text-xs text-gray-500">Exports the currently filtered student list as an Excel-compatible sheet with the requested three columns.</p></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Report Date<input type="date" value={exportDate} onChange={e => setExportDate(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm">Division<select value={exportDivision} onChange={e => setExportDivision(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="ALL">All Divisions</option><option value="UNASSIGNED">Unassigned</option>{divisions.map(d => <option key={d._id} value={d.name}>{d.name}</option>)}</select></label><label className="text-sm">Remark<input value={remark} onChange={e => setRemark(e.target.value)} placeholder="Optional remark for all rows" className="mt-1 w-full rounded-lg border p-2" /></label></div><button onClick={exportExcel} disabled={!course || !exportDate} className="mt-3 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Export Excel (.xls)</button></section>
  </div></div>;
}
