import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./FeesManagement.css";

const API = `${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/fees`;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateTimeText = (value) => value ? new Date(value).toLocaleString("en-IN") : "—";
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const methodLabel = (method) => ({
  upi: "UPI", card: "Card", netbanking: "Net Banking", wallet: "Wallet",
  emi: "EMI", paylater: "Pay Later", razorpay: "Razorpay"
}[String(method || "").toLowerCase()] || "Online Gateway");

export default function AdminFeesPanel() {
  const [data, setData] = useState({ invoices: [], payments: [], stats: {} });
  const [meta, setMeta] = useState({ departments: [], courses: [] });
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearingTestData, setClearingTestData] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [filters, setFilters] = useState({ department: "", course: "", semester: "" });
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [assignmentMode, setAssignmentMode] = useState("selected");
  const [form, setForm] = useState({
    academicYear: "2026-27",
    description: "Academic Fees",
    semester: "",
    components: [{ name: "Tuition Fee", amount: "" }],
    installments: [{ title: "First Installment", amount: "", dueDate: "" }]
  });
  const [reportFilter, setReportFilter] = useState({
    search: "", department: "", course: "", status: "", method: "", from: "", to: ""
  });

  const showMessage = useCallback((text, type = "info") => {
    setMessage(text);
    setMessageType(type);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [overview, academic] = await Promise.all([
        axios.get(`${API}/admin/overview`, { headers: headers() }),
        axios.get(`${API}/admin/meta`, { headers: headers() })
      ]);
      setData({
        invoices: overview.data.invoices || [],
        payments: overview.data.payments || [],
        stats: overview.data.stats || {}
      });
      setMeta({
        departments: academic.data.departments || [],
        courses: academic.data.courses || []
      });
    } catch (error) {
      showMessage(error.response?.data?.message || "Could not load fee information. Check the backend connection and Fees API.", "error");
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setSelectedStudentIds([]);
    try {
      const params = {};
      if (filters.department) params.department = filters.department;
      if (filters.course) params.course = filters.course;
      if (filters.semester) params.semester = filters.semester;
      const result = await axios.get(`${API}/admin/students`, { headers: headers(), params });
      setStudents(result.data.students || []);
    } catch (error) {
      setStudents([]);
      showMessage(error.response?.data?.message || "Could not load students for the selected academic group.", "error");
    } finally {
      setStudentsLoading(false);
    }
  }, [filters.department, filters.course, filters.semester, showMessage]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  const filteredStudents = useMemo(() => {
    const search = studentSearch.trim().toLowerCase();
    if (!search) return students;
    return students.filter((student) =>
      [student.name, student.firstName, student.surname, student.secondName, student.id_no, student.email]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(search))
    );
  }, [students, studentSearch]);

  const courseOptions = meta.courses.filter((course) =>
    !filters.department || !course.departmentId || String(course.departmentId) === String(filters.department)
  );
  const componentTotal = form.components.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const installmentTotal = form.installments.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const updateComponent = (index, key, value) => setForm((current) => ({
    ...current,
    components: current.components.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)
  }));

  const updateInstallment = (index, key, value) => setForm((current) => ({
    ...current,
    installments: current.installments.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)
  }));

  const toggleStudent = (id) => setSelectedStudentIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );

  const toggleAllVisible = () => {
    const visibleIds = filteredStudents.map((student) => student._id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedStudentIds.includes(id));
    setSelectedStudentIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]
    );
  };

  const assignFees = async (event) => {
    event.preventDefault();
    if (!filters.department && !filters.course) {
      showMessage("Select a department or a course before assigning fees.", "error");
      return;
    }
    if (assignmentMode === "selected" && selectedStudentIds.length === 0) {
      showMessage("Select at least one student, or choose the all-matching-students option.", "error");
      return;
    }
    if (assignmentMode === "all" && !filters.course && !filters.department) {
      showMessage("Choose a department or course before assigning fees to the matching group.", "error");
      return;
    }
    if (componentTotal <= 0 || Math.abs(componentTotal - installmentTotal) > 0.01) {
      showMessage("The installment amounts must add up exactly to the fee total.", "error");
      return;
    }
    if (form.installments.some((item) => !item.title.trim() || !item.dueDate || Number(item.amount) <= 0)) {
      showMessage("Complete every installment title, amount and due date.", "error");
      return;
    }

    setSaving(true);
    try {
      const departmentName = meta.departments.find((item) => String(item._id) === String(filters.department))?.departmentName || filters.department;
      const payload = {
        mode: assignmentMode,
        studentIds: selectedStudentIds,
        target: { department: filters.department, departmentName, course: filters.course, semester: filters.semester || form.semester },
        academicYear: form.academicYear,
        description: form.description,
        course: filters.course,
        semester: filters.semester || form.semester,
        components: form.components.map((item) => ({ ...item, amount: Number(item.amount) })),
        installments: form.installments.map((item) => ({ ...item, amount: Number(item.amount) }))
      };
      const result = await axios.post(`${API}/admin/invoices/bulk`, payload, { headers: headers() });
      showMessage(`${result.data.assigned || 0} invoice(s) assigned. ${result.data.skipped || 0} duplicate assignment(s) skipped.`, "success");
      setSelectedStudentIds([]);
      await Promise.all([loadOverview(), loadStudents()]);
    } catch (error) {
      showMessage(error.response?.data?.message || "Could not assign fees.", "error");
    } finally {
      setSaving(false);
    }
  };

  const clearTestFeeData = async () => {
    if (!data.stats.testMode) {
      showMessage("Test fee data can only be cleared while Razorpay Test Mode keys are configured.", "error");
      return;
    }
    const accepted = window.confirm("This permanently removes all fee invoices, fee payment records, and Fees-module notifications. Student accounts and all other CampusCore modules remain unchanged. Continue?");
    if (!accepted) return;
    const phrase = window.prompt('Type CLEAR TEST FEES to confirm removal of all test fee records:');
    if (phrase !== "CLEAR TEST FEES") {
      showMessage("No data was deleted. The confirmation text did not match.", "info");
      return;
    }
    setClearingTestData(true);
    try {
      const result = await axios.delete(`${API}/admin/test-data`, {
        headers: headers(), data: { confirmation: "CLEAR TEST FEES" }
      });
      setSelectedStudentIds([]);
      showMessage(result.data.message || "Test fee data cleared.", "success");
      await loadOverview();
    } catch (error) {
      showMessage(error.response?.data?.message || "Could not clear test fee data.", "error");
    } finally {
      setClearingTestData(false);
    }
  };

  const invoicePayments = useMemo(() => {
    const result = new Map();
    for (const payment of data.payments) {
      const invoiceId = String(payment.invoice?._id || payment.invoice);
      if (!result.has(invoiceId)) result.set(invoiceId, []);
      result.get(invoiceId).push(payment);
    }
    return result;
  }, [data.payments]);

  const reportRows = useMemo(() => {
    const search = reportFilter.search.trim().toLowerCase();
    const fromDate = reportFilter.from ? new Date(`${reportFilter.from}T00:00:00`) : null;
    const toDate = reportFilter.to ? new Date(`${reportFilter.to}T23:59:59`) : null;
    return data.invoices.filter((invoice) => {
      const student = invoice.student || {};
      const relatedPayments = invoicePayments.get(String(invoice._id)) || [];
      const searchMatches = !search || [student.name, student.id_no, student.email, invoice.description, invoice.course, invoice.department]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
      const selectedDepartment = meta.departments.find((item) => String(item._id) === String(reportFilter.department));
      const selectedDepartmentName = selectedDepartment?.departmentName || reportFilter.department;
      const departmentMatches = !reportFilter.department ||
        String(student.departmentId || "") === String(reportFilter.department) ||
        String(student.department || invoice.department || "").toLowerCase() === String(selectedDepartmentName).toLowerCase();
      const courseMatches = !reportFilter.course || String(invoice.course || student.course) === reportFilter.course;
      const statusMatches = !reportFilter.status || invoice.status === reportFilter.status;
      const methodMatches = !reportFilter.method || relatedPayments.some((payment) => payment.method === reportFilter.method);
      const dateMatches = (!fromDate && !toDate) || relatedPayments.some((payment) => {
        if (payment.status !== "paid" || !payment.paidAt) return false;
        const paidAt = new Date(payment.paidAt);
        return (!fromDate || paidAt >= fromDate) && (!toDate || paidAt <= toDate);
      });
      return searchMatches && departmentMatches && courseMatches && statusMatches && methodMatches && dateMatches;
    });
  }, [data.invoices, invoicePayments, reportFilter, meta.departments]);

  const groupSummaries = useMemo(() => {
    const groups = new Map();
    for (const invoice of data.invoices) {
      const department = invoice.department || invoice.student?.department || "Unassigned Department";
      const course = invoice.course || invoice.student?.course || "Unassigned Course";
      const key = `${department}::${course}`;
      if (!groups.has(key)) groups.set(key, {
        department, course, invoices: 0, students: new Set(), total: 0, paid: 0, balance: 0
      });
      const group = groups.get(key);
      group.invoices += 1;
      if (invoice.student?._id) group.students.add(String(invoice.student._id));
      group.total += Number(invoice.totalAmount || 0);
      group.paid += Number(invoice.paidAmount || 0);
      group.balance += Number(invoice.balance ?? Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0)));
    }
    return [...groups.values()].map((group) => ({
      ...group, students: group.students.size,
      collectionRate: group.total > 0 ? Math.round((group.paid / group.total) * 100) : 0
    })).sort((a, b) => a.department.localeCompare(b.department) || a.course.localeCompare(b.course));
  }, [data.invoices]);

  const downloadReport = () => {
    const rows = [[
      "Enrollment ID", "Student Name", "Email", "Department", "Course", "Semester", "Academic Year",
      "Fee Description", "Invoice Total", "Total Paid", "Balance", "Invoice Status", "Payment Amount",
      "Payment Method", "Gateway Payment ID", "Payment Status", "Payment Date", "Receipt Number"
    ]];
    for (const invoice of reportRows) {
      const student = invoice.student || {};
      const related = (invoicePayments.get(String(invoice._id)) || []).filter((payment) => {
        if (reportFilter.method && payment.method !== reportFilter.method) return false;
        if (reportFilter.from || reportFilter.to) {
          if (!payment.paidAt) return false;
          const date = new Date(payment.paidAt);
          if (reportFilter.from && date < new Date(`${reportFilter.from}T00:00:00`)) return false;
          if (reportFilter.to && date > new Date(`${reportFilter.to}T23:59:59`)) return false;
        }
        return true;
      });
      const common = [
        student.id_no || "", student.name || "", student.email || "", invoice.department || student.department || "",
        invoice.course || student.course || "", invoice.semester || student.semester || "", invoice.academicYear || "",
        invoice.description || "", invoice.totalAmount || 0, invoice.paidAmount || 0,
        invoice.balance ?? Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0)), invoice.status || ""
      ];
      if (related.length) related.forEach((payment) => rows.push([
        ...common, payment.amount, methodLabel(payment.method), payment.gatewayPaymentId || payment.reference || "",
        payment.status, payment.paidAt ? dateTimeText(payment.paidAt) : dateTimeText(payment.createdAt), payment.receiptNumber || ""
      ]));
      else rows.push([...common, 0, "", "", "No gateway payment", "", ""]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `CampusCore_Fee_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const filterGroup = (group) => {
    const department = meta.departments.find((item) => item.departmentName.toLowerCase() === group.department.toLowerCase());
    setReportFilter((current) => ({ ...current, department: department?._id || group.department, course: group.course }));
  };

  return (
    <section className="cc-fees cc-admin-fees">
      <header className="cc-fee-hero">
        <div>
          <div className="cc-fee-eyebrow"><span className="cc-fee-live-dot" /> ONLINE FEE COLLECTION</div>
          <h2>Fees Management</h2>
          <p>Manage academic fee structures, assign invoices by course and track online collections.</p>
        </div>
        <div className="cc-fee-hero-actions">
          {data.stats.testMode && <span className="cc-fee-mode-badge">Razorpay Test Mode</span>}
          {data.stats.testMode && <button type="button" className="cc-fee-button danger" onClick={clearTestFeeData} disabled={loading || clearingTestData}>{clearingTestData ? "Clearing…" : "Clear Test Fee Data"}</button>}
          <button type="button" className="cc-fee-button secondary" onClick={loadOverview} disabled={loading}>↻ Refresh</button>
        </div>
      </header>

      {message && <div className={`cc-fee-message ${messageType}`} role="status">{message}</div>}

      <div className="cc-fee-stats cc-fee-admin-stats">
        <article><span className="cc-fee-stat-icon indigo">₹</span><small>Total Assigned</small><strong>{money(data.stats.total)}</strong><em>{data.stats.invoices || 0} invoices</em></article>
        <article><span className="cc-fee-stat-icon green">✓</span><small>Collected Online</small><strong>{money(data.stats.collected)}</strong><em>Gateway-confirmed payments</em></article>
        <article><span className="cc-fee-stat-icon amber">◷</span><small>Outstanding</small><strong>{money(data.stats.pending)}</strong><em>Awaiting student payment</em></article>
        <article><span className="cc-fee-stat-icon red">!</span><small>Overdue Invoices</small><strong>{data.stats.overdue || 0}</strong><em>Past due date</em></article>
        <article><span className="cc-fee-stat-icon blue">↗</span><small>Payments Processing</small><strong>{data.stats.gatewayProcessing || 0}</strong><em>Awaiting gateway capture</em></article>
      </div>

      <section className="cc-fee-card cc-fee-summary-card">
        <div className="cc-fee-section-head">
          <div><span className="cc-fee-kicker">ACADEMIC BREAKDOWN</span><h3>Department & Course Collection Summary</h3><p className="cc-fee-help">View invoice count, collection and outstanding balance separately for every academic group.</p></div>
          <span className="cc-fee-count-pill">{groupSummaries.length} group(s)</span>
        </div>
        <div className="cc-fee-table-wrap">
          <table className="cc-fee-table cc-fee-summary-table">
            <thead><tr><th>Department</th><th>Course</th><th>Students</th><th>Invoices</th><th>Total Fees</th><th>Collected</th><th>Outstanding</th><th>Collection</th><th /></tr></thead>
            <tbody>
              {groupSummaries.map((group) => <tr key={`${group.department}-${group.course}`}>
                <td><strong>{group.department}</strong></td>
                <td>{group.course}</td><td>{group.students}</td><td>{group.invoices}</td>
                <td>{money(group.total)}</td><td className="cc-fee-positive">{money(group.paid)}</td><td className="cc-fee-warning">{money(group.balance)}</td>
                <td><div className="cc-fee-progress"><span style={{ width: `${group.collectionRate}%` }} /></div><small>{group.collectionRate}%</small></td>
                <td><button type="button" className="cc-fee-link-button" onClick={() => filterGroup(group)}>View details</button></td>
              </tr>)}
              {!groupSummaries.length && <tr><td colSpan="9" className="cc-fee-empty">No fee invoices have been assigned yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="cc-fee-admin-grid">
        <form className="cc-fee-card cc-fee-assign-card" onSubmit={assignFees}>
          <div className="cc-fee-card-title"><div><span className="cc-fee-kicker">NEW FEE ASSIGNMENT</span><h3>Assign Fees</h3><p className="cc-fee-help">Choose the academic group, select students and set the fee schedule.</p></div><span className="cc-fee-step-badge">01</span></div>

          <div className="cc-fee-field-grid">
            <label>Department
              <select value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value, course: "" }))}>
                <option value="">Select department</option>
                {meta.departments.map((department) => <option key={department._id} value={department._id}>{department.departmentName}</option>)}
              </select>
            </label>
            <label>Course
              <select value={filters.course} onChange={(event) => {
                const course = meta.courses.find((item) => item.courseName === event.target.value);
                setFilters((current) => ({ ...current, course: event.target.value, department: current.department || course?.departmentId || "" }));
              }}>
                <option value="">Select course</option>
                {courseOptions.map((course) => <option key={course._id} value={course.courseName}>{course.courseName}</option>)}
              </select>
            </label>
            <label>Current Semester
              <select value={filters.semester} onChange={(event) => setFilters((current) => ({ ...current, semester: event.target.value }))}>
                <option value="">All Semesters</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}
              </select>
            </label>
          </div>

          <div className="cc-fee-student-picker">
            <div className="cc-fee-picker-head">
              <div><strong>Choose Students</strong><small>{studentsLoading ? "Loading students…" : `${filteredStudents.length} shown · ${selectedStudentIds.length} selected`}</small></div>
              <button type="button" className="cc-fee-button secondary compact" onClick={toggleAllVisible} disabled={!filteredStudents.length || studentsLoading}>
                {filteredStudents.length && filteredStudents.every((student) => selectedStudentIds.includes(student._id)) ? "Clear selection" : "Select all shown"}
              </button>
            </div>
            <input className="cc-fee-search-input" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search name, enrollment ID or email" />
            <div className="cc-fee-student-list">
              {studentsLoading ? <p className="cc-fee-empty">Loading student list…</p> : filteredStudents.length ? filteredStudents.map((student) => (
                <label className="cc-fee-student-option" key={student._id}>
                  <input type="checkbox" checked={selectedStudentIds.includes(student._id)} onChange={() => toggleStudent(student._id)} />
                  <span><strong>{student.name || [student.firstName, student.secondName, student.surname].filter(Boolean).join(" ")}</strong><small>{student.id_no || student.email} · {student.course || "Course not set"} · Sem {student.semester || "—"}</small></span>
                </label>
              )) : <p className="cc-fee-empty">{students.length ? "No students match your search." : "No active students found for this academic group."}</p>}
            </div>
            <div className="cc-fee-assignment-mode">
              <label><input type="radio" value="selected" checked={assignmentMode === "selected"} onChange={() => setAssignmentMode("selected")} /><span><strong>Selected students</strong><small>Assign only to the students checked above.</small></span></label>
              <label><input type="radio" value="all" checked={assignmentMode === "all"} onChange={() => setAssignmentMode("all")} /><span><strong>Entire matching group</strong><small>Assign to all active students in this department, course and semester.</small></span></label>
            </div>
          </div>

          <div className="cc-fee-subsection-title"><h4>Fee Details</h4><span>02</span></div>
          <div className="cc-fee-field-grid">
            <label>Academic Year<input required value={form.academicYear} onChange={(event) => setForm((current) => ({ ...current, academicYear: event.target.value }))} placeholder="2026-27" /></label>
            <label>Invoice Semester
              <select value={form.semester} onChange={(event) => setForm((current) => ({ ...current, semester: event.target.value }))}>
                <option value="">Use each student's current semester</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}
              </select>
            </label>
            <label className="cc-fee-field-full">Fee Description<input required value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Tuition Fees / Examination Fees" /></label>
          </div>

          <div className="cc-fee-section-head"><h4>Fee Components</h4><button type="button" className="cc-fee-link-button" onClick={() => setForm((current) => ({ ...current, components: [...current.components, { name: "", amount: "" }] }))}>+ Add component</button></div>
          {form.components.map((item, index) => <div className="cc-fee-edit-row" key={`component-${index}`}>
            <input value={item.name} onChange={(event) => updateComponent(index, "name", event.target.value)} placeholder="Component, e.g. Tuition Fee" required />
            <input type="number" min="0" step="0.01" value={item.amount} onChange={(event) => updateComponent(index, "amount", event.target.value)} placeholder="Amount (₹)" required />
            {form.components.length > 1 && <button type="button" className="cc-fee-remove-button" onClick={() => setForm((current) => ({ ...current, components: current.components.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button>}
          </div>)}
          <div className="cc-fee-total-line"><span>Total Fee</span><strong>{money(componentTotal)}</strong></div>

          <div className="cc-fee-section-head"><h4>Installments & Due Dates</h4><button type="button" className="cc-fee-link-button" onClick={() => setForm((current) => ({ ...current, installments: [...current.installments, { title: `Installment ${current.installments.length + 1}`, amount: "", dueDate: "" }] }))}>+ Add installment</button></div>
          {form.installments.map((item, index) => <div className="cc-fee-edit-row cc-fee-installment-row" key={`installment-${index}`}>
            <input value={item.title} onChange={(event) => updateInstallment(index, "title", event.target.value)} placeholder="Installment title" required />
            <input type="number" min="1" step="0.01" value={item.amount} onChange={(event) => updateInstallment(index, "amount", event.target.value)} placeholder="Amount (₹)" required />
            <input type="date" value={item.dueDate} onChange={(event) => updateInstallment(index, "dueDate", event.target.value)} required />
            {form.installments.length > 1 && <button type="button" className="cc-fee-remove-button" onClick={() => setForm((current) => ({ ...current, installments: current.installments.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button>}
          </div>)}
          <div className={`cc-fee-total-line ${Math.abs(componentTotal - installmentTotal) <= 0.01 ? "valid" : "invalid"}`}><span>Installment Total</span><strong>{money(installmentTotal)}</strong></div>
          <button className="cc-fee-button primary cc-fee-assign-button" type="submit" disabled={saving || loading || studentsLoading}>
            {saving ? "Assigning fees…" : assignmentMode === "all" ? "Assign to entire matching group" : `Assign to ${selectedStudentIds.length} selected student(s)`}
          </button>
        </form>

        <aside className="cc-fee-side-column">
          <section className="cc-fee-card cc-fee-gateway-card">
            <div className="cc-fee-gateway-mark">↗</div>
            <span className="cc-fee-kicker">AUTOMATED CHECKOUT</span>
            <h3>Online Payments</h3>
            <p>Students pay securely through Razorpay Checkout. Payment capture is verified by the backend, receipts are generated automatically and reports update without office approval.</p>
            <div className="cc-fee-gateway-list"><span>✓ UPI & QR</span><span>✓ Debit / Credit Cards</span><span>✓ Net Banking & eligible wallets</span><span>✓ Automatic receipt generation</span></div>
            <div className="cc-fee-gateway-state"><span className="cc-fee-live-dot" />{data.stats.testMode ? "Test mode is active" : "Gateway collection enabled"}</div>
          </section>
          <section className="cc-fee-card cc-fee-quick-card">
            <span className="cc-fee-kicker">QUICK CHECK</span><h3>Current Assignment</h3>
            <div className="cc-fee-quick-row"><span>Department</span><strong>{meta.departments.find((item) => String(item._id) === String(filters.department))?.departmentName || "Not selected"}</strong></div>
            <div className="cc-fee-quick-row"><span>Course</span><strong>{filters.course || "Not selected"}</strong></div>
            <div className="cc-fee-quick-row"><span>Students selected</span><strong>{assignmentMode === "all" ? `${filteredStudents.length} matching` : selectedStudentIds.length}</strong></div>
            <div className="cc-fee-quick-row"><span>Fee amount</span><strong>{money(componentTotal)}</strong></div>
            <p className="cc-fee-help">Review the academic group and total before assigning. Duplicate assignments for the same academic year are skipped.</p>
          </section>
        </aside>
      </div>

      <section className="cc-fee-card cc-fee-report">
        <div className="cc-fee-section-head">
          <div><span className="cc-fee-kicker">PAYMENT REGISTER</span><h3>Student-wise Fee & Collection Report</h3><p className="cc-fee-help">Search by student, filter by department/course/status/method/date and export the current result.</p></div>
          <button type="button" className="cc-fee-button primary" onClick={downloadReport}>↓ Download CSV</button>
        </div>
        <div className="cc-fee-report-filters">
          <input value={reportFilter.search} onChange={(event) => setReportFilter((current) => ({ ...current, search: event.target.value }))} placeholder="Search student, enrollment ID or email" />
          <select value={reportFilter.department} onChange={(event) => setReportFilter((current) => ({ ...current, department: event.target.value }))}><option value="">All Departments</option>{meta.departments.map((item) => <option key={item._id} value={item._id}>{item.departmentName}</option>)}</select>
          <select value={reportFilter.course} onChange={(event) => setReportFilter((current) => ({ ...current, course: event.target.value }))}><option value="">All Courses</option>{meta.courses.map((item) => <option key={item._id} value={item.courseName}>{item.courseName}</option>)}</select>
          <select value={reportFilter.status} onChange={(event) => setReportFilter((current) => ({ ...current, status: event.target.value }))}><option value="">All Fee Statuses</option><option value="paid">Paid</option><option value="partial">Partially Paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option></select>
          <select value={reportFilter.method} onChange={(event) => setReportFilter((current) => ({ ...current, method: event.target.value }))}><option value="">All Gateway Methods</option><option value="upi">UPI</option><option value="card">Debit / Credit Card</option><option value="netbanking">Net Banking</option><option value="wallet">Wallet</option><option value="emi">EMI</option><option value="paylater">Pay Later</option><option value="razorpay">Other / Gateway</option></select>
          <label>Paid From<input type="date" value={reportFilter.from} onChange={(event) => setReportFilter((current) => ({ ...current, from: event.target.value }))} /></label>
          <label>Paid To<input type="date" value={reportFilter.to} onChange={(event) => setReportFilter((current) => ({ ...current, to: event.target.value }))} /></label>
          <button type="button" className="cc-fee-button secondary" onClick={() => setReportFilter({ search: "", department: "", course: "", status: "", method: "", from: "", to: "" })}>Reset filters</button>
        </div>
        <div className="cc-fee-report-summary"><strong>{reportRows.length} invoice(s)</strong><span>Outstanding in current results: {money(reportRows.reduce((sum, item) => sum + Number(item.balance || 0), 0))}</span></div>
        <div className="cc-fee-table-wrap">
          <table className="cc-fee-table">
            <thead><tr><th>Student</th><th>Department / Course</th><th>Academic Year</th><th>Total</th><th>Paid</th><th>Balance</th><th>Last Payment</th><th>Method</th><th>Status</th><th>Gateway Transactions</th></tr></thead>
            <tbody>
              {reportRows.map((invoice) => {
                const payments = invoicePayments.get(String(invoice._id)) || [];
                const paidPayments = payments.filter((item) => item.status === "paid").sort((a, b) => new Date(b.paidAt || b.createdAt) - new Date(a.paidAt || a.createdAt));
                const lastPayment = paidPayments[0];
                return <tr key={invoice._id}>
                  <td><strong>{invoice.student?.name || "Student"}</strong><small>{invoice.student?.id_no || invoice.student?.email || "—"}</small></td>
                  <td>{invoice.department || invoice.student?.department || "—"}<small>{invoice.course || invoice.student?.course || "—"} · Sem {invoice.semester || invoice.student?.semester || "—"}</small></td>
                  <td>{invoice.academicYear}<small>{invoice.description}</small></td>
                  <td>{money(invoice.totalAmount)}</td><td className="cc-fee-positive">{money(invoice.paidAmount)}</td><td className="cc-fee-warning">{money(invoice.balance)}</td>
                  <td>{lastPayment ? dateTimeText(lastPayment.paidAt) : "—"}</td>
                  <td>{lastPayment ? methodLabel(lastPayment.method) : "—"}</td>
                  <td><span className={`cc-fee-status ${invoice.status}`}>{String(invoice.status || "pending").toUpperCase()}</span></td>
                  <td><details><summary>{payments.length} record(s)</summary>{payments.map((payment) => <p key={payment._id}>{money(payment.amount)} · {methodLabel(payment.method)} · {String(payment.status).toUpperCase()} · {payment.gatewayPaymentId || payment.reference || "No gateway ID"} · {dateTimeText(payment.paidAt || payment.createdAt)} {payment.receiptNumber ? `· ${payment.receiptNumber}` : ""}</p>)}</details></td>
                </tr>;
              })}
              {!reportRows.length && <tr><td colSpan="10" className="cc-fee-empty">No fee records match the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {loading && <p className="cc-fee-help">Loading fee information…</p>}
    </section>
  );
}
