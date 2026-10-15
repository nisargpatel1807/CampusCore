import React, { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api/admin/departments";

export default function DepartmentManagementPanel({ token, onClose, onChanged }) {
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ departmentCode: "", departmentName: "", description: "", status: true });
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const config = { headers: { Authorization: `Bearer ${token}` } };

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API, config);
      setDepartments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to load departments.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const reset = () => {
    setEditingId("");
    setForm({ departmentCode: "", departmentName: "", description: "", status: true });
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      departmentCode: form.departmentCode.trim().toUpperCase(),
      departmentName: form.departmentName.trim(),
      description: form.description.trim(),
      status: Boolean(form.status)
    };
    if (!/^[A-Z0-9-]{2,20}$/.test(payload.departmentCode)) return alert("Department code must be 2–20 characters and use letters, numbers, or hyphens.");
    if (payload.departmentName.length < 2 || payload.departmentName.length > 100) return alert("Department name must be 2–100 characters.");
    try {
      if (editingId) await axios.put(`${API}/${editingId}`, payload, config);
      else await axios.post(API, payload, config);
      reset();
      await load();
      if (onChanged) onChanged();
    } catch (err) { alert(err.response?.data?.message || "Could not save department."); }
  };

  const remove = async (department) => {
    if (!window.confirm(`Delete department "${department.departmentName}"? Departments linked to courses or teachers cannot be deleted.`)) return;
    try {
      await axios.delete(`${API}/${department._id}`, config);
      await load();
      if (onChanged) onChanged();
    } catch (err) { alert(err.response?.data?.message || "Could not delete department."); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div><h2 className="text-xl font-bold text-gray-800">Department Management</h2><p className="mt-1 text-sm text-gray-500">Create departments and manage their status.</p></div>
          <button type="button" onClick={onClose} className="text-xl text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <div className="grid gap-5 overflow-y-auto p-5 md:grid-cols-[320px_1fr]">
          <form onSubmit={save} className="h-fit space-y-3 rounded-xl border bg-gray-50 p-4">
            <h3 className="font-bold text-gray-800">{editingId ? "Edit Department" : "Add Department"}</h3>
            <label className="block text-xs font-semibold text-gray-600">Department Code
              <input required maxLength="20" value={form.departmentCode} onChange={e => setForm({ ...form, departmentCode: e.target.value.toUpperCase() })} placeholder="e.g. CA" className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-gray-600">Department Name
              <input required minLength="2" maxLength="100" value={form.departmentName} onChange={e => setForm({ ...form, departmentName: e.target.value })} placeholder="e.g. Computer Applications" className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-gray-600">Description
              <textarea maxLength="500" rows="3" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional department description" className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.status} onChange={e => setForm({ ...form, status: e.target.checked })} /> Active</label>
            <div className="flex gap-2">
              <button className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700">{editingId ? "Save Changes" : "Create Department"}</button>
              {editingId && <button type="button" onClick={reset} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>}
            </div>
          </form>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Code</th><th className="p-3">Department</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y">
                {loading ? <tr><td colSpan="4" className="p-5 text-center text-gray-500">Loading departments...</td></tr> :
                 departments.length === 0 ? <tr><td colSpan="4" className="p-5 text-center text-gray-500">No departments created yet.</td></tr> :
                 departments.map(d => <tr key={d._id} className="hover:bg-gray-50">
                   <td className="p-3 font-mono font-semibold">{d.departmentCode}</td>
                   <td className="p-3"><div className="font-semibold text-gray-800">{d.departmentName}</div>{d.description && <div className="mt-1 max-w-xs text-xs text-gray-500">{d.description}</div>}</td>
                   <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${d.status ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{d.status ? "Active" : "Inactive"}</span></td>
                   <td className="space-x-2 p-3 text-right whitespace-nowrap">
                     <button type="button" onClick={() => { setEditingId(d._id); setForm({ departmentCode: d.departmentCode || "", departmentName: d.departmentName || "", description: d.description || "", status: d.status !== false }); }} className="rounded bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Edit</button>
                     <button type="button" onClick={() => remove(d)} className="rounded bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Delete</button>
                   </td>
                 </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
