import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000/api";

const initialScheme = {
  courseId: "",
  semester: 1,
  academicYear: "",
  cecMax: 30,
  midtermMax: 50,
  externalMax: 70,
  cecWeight: 30,
  midtermWeight: 20,
  externalWeight: 50,
  passingPercent: 40,
};

export default function AdminResultPanel({ courses = [], onClose }) {
  const token = localStorage.getItem("token");
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const [tab, setTab] = useState("scheme");
  const [schemeForm, setSchemeForm] = useState(initialScheme);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [list, setList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [statusFilter, setStatusFilter] = useState("draft");
  const [publishedAt, setPublishedAt] = useState(null);
  const [savingScheme, setSavingScheme] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((course) => String(course._id) === String(schemeForm.courseId)),
    [courses, schemeForm.courseId]
  );

  const setField = (key, value) => {
    setSchemeForm((current) => ({ ...current, [key]: value }));
  };

  const saveScheme = async (event) => {
    event.preventDefault();
    if (!schemeForm.courseId || !schemeForm.academicYear.trim()) {
      alert("Please select a course and enter the academic year.");
      return;
    }

    try {
      setSavingScheme(true);
      const response = await axios.post(`${API}/results/schemes`, schemeForm, authConfig);
      alert(response.data.message || "Assessment scheme saved successfully.");
      setTab("import");
    } catch (error) {
      alert(error.response?.data?.message || "Failed to save the assessment scheme.");
    } finally {
      setSavingScheme(false);
    }
  };

  const downloadTemplate = async () => {
    if (!schemeForm.courseId || !schemeForm.semester || !schemeForm.academicYear.trim()) {
      alert("Please select the course, semester and academic year first.");
      return;
    }

    try {
      const response = await axios.get(`${API}/results/template`, {
        ...authConfig,
        responseType: "blob",
        params: {
          courseId: schemeForm.courseId,
          semester: schemeForm.semester,
          academicYear: schemeForm.academicYear.trim(),
        },
      });

      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `CampusCore_${selectedCourse?.courseCode || "Course"}_Sem${schemeForm.semester}_Result_Template.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.response?.data?.message || "Template download failed.");
    }
  };

  const loadResults = async () => {
    if (!schemeForm.courseId || !schemeForm.semester || !schemeForm.academicYear.trim()) return;

    try {
      setLoadingList(true);
      const response = await axios.get(`${API}/results/admin`, {
        ...authConfig,
        params: {
          courseId: schemeForm.courseId,
          semester: schemeForm.semester,
          academicYear: schemeForm.academicYear.trim(),
          status: statusFilter,
        },
      });
      setList(response.data?.results || []);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load results.");
    } finally {
      setLoadingList(false);
    }
  };

  const importExcel = async (event) => {
    event.preventDefault();
    if (!schemeForm.courseId || !schemeForm.academicYear.trim()) {
      alert("Please select the course and enter the academic year first.");
      return;
    }
    if (!file) {
      alert("Please select the completed Excel workbook.");
      return;
    }

    try {
      setImporting(true);
      setImportResult(null);
      setErrors([]);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("courseId", schemeForm.courseId);
      formData.append("semester", schemeForm.semester);
      formData.append("academicYear", schemeForm.academicYear.trim());

      const response = await axios.post(`${API}/results/import`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setImportResult(response.data);
      setFile(null);
      setTab("review");
      await loadResults();
    } catch (error) {
      const payload = error.response?.data || {};
      setImportResult(payload);
      setErrors(payload.errors || [payload.message || "Result import failed."]);
      setTab("review");
    } finally {
      setImporting(false);
    }
  };

  const publish = async () => {
    if (!list.length) {
      alert("There are no Draft results to publish.");
      return;
    }

    const confirmed = window.confirm(
      "Publish all Draft results for the selected course, semester and academic year?"
    );
    if (!confirmed) return;

    try {
      const response = await axios.post(
        `${API}/results/publish`,
        {
          courseId: schemeForm.courseId,
          semester: schemeForm.semester,
          academicYear: schemeForm.academicYear.trim(),
        },
        authConfig
      );

      setPublishedAt(response.data?.publishedAt || new Date().toISOString());
      setStatusFilter("published");
      await loadResults();
      alert(response.data.message || "Results published successfully.");
    } catch (error) {
      alert(error.response?.data?.message || "Publishing failed.");
    }
  };

  useEffect(() => {
    if (tab === "review" || tab === "publish") loadResults();
  }, [tab, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const complete = list.filter((row) => row.total !== null && row.total !== undefined).length;
    const pending = list.filter((row) => row.total === null || row.total === undefined).length;
    return { total: list.length, complete, pending };
  }, [list]);

  const tabClass = (key) =>
    `rounded-xl px-4 py-2.5 text-sm font-bold transition ${
      tab === key
        ? "bg-orange-600 text-white shadow-sm"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[95vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-orange-50 to-white px-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-orange-600">Academic Results</div>
            <h3 className="mt-1 text-2xl font-extrabold text-gray-900">Result Management</h3>
            <p className="mt-1 text-sm text-gray-500">
              Configure the assessment, download the generated workbook, review the imported records, and publish the final result.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </div>

        <div className="border-b bg-white px-6 py-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTab("scheme")} className={tabClass("scheme")}>
              1. Assessment Scheme
            </button>
            <button type="button" onClick={() => setTab("import")} className={tabClass("import")}>
              2. Excel Import
            </button>
            <button type="button" onClick={() => setTab("review")} className={tabClass("review")}>
              3. Review
            </button>
            <button type="button" onClick={() => setTab("publish")} className={tabClass("publish")}>
              4. Publish
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-xs font-bold text-gray-600">
              Course
              <select
                value={schemeForm.courseId}
                onChange={(event) => setField("courseId", event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-3 text-sm font-normal outline-none focus:border-orange-500"
              >
                <option value="">Select Course</option>
                {courses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.courseName} ({course.courseCode})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-gray-600">
              Semester
              <select
                value={schemeForm.semester}
                onChange={(event) => setField("semester", Number(event.target.value))}
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-3 text-sm font-normal outline-none focus:border-orange-500"
              >
                {Array.from({ length: 10 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    Semester {index + 1}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-gray-600">
              Academic Year
              <input
                value={schemeForm.academicYear}
                onChange={(event) => setField("academicYear", event.target.value)}
                placeholder="2026-27"
                className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-sm font-normal outline-none focus:border-orange-500"
              />
            </label>
          </div>

          {tab === "scheme" && (
            <form onSubmit={saveScheme} className="space-y-5">
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-orange-900">Final Marking Formula</div>
                    <div className="mt-1 text-sm text-orange-800">
                      The final result is calculated out of 100 marks.
                    </div>
                  </div>
                  <div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-orange-900 shadow-sm">
                    CEC 30% + Midterm 20% + External 50%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  ["CEC Raw Maximum", "cecMax", 30],
                  ["Midterm Raw Maximum", "midtermMax", 50],
                  ["External Raw Maximum", "externalMax", 70],
                ].map(([label, key, value]) => (
                  <label key={key} className="text-xs font-bold text-gray-600">
                    {label}
                    <input
                      value={value}
                      readOnly
                      className="mt-1 w-full rounded-xl border bg-gray-100 p-3 text-sm text-gray-700"
                    />
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  ["CEC Contribution", "cecWeight", "30%"],
                  ["Midterm Contribution", "midtermWeight", "20%"],
                  ["External Contribution", "externalWeight", "50%"],
                ].map(([label, key, value]) => (
                  <label key={key} className="text-xs font-bold text-gray-600">
                    {label}
                    <input
                      value={value}
                      readOnly
                      className="mt-1 w-full rounded-xl border bg-gray-100 p-3 text-sm text-gray-700"
                    />
                  </label>
                ))}
              </div>

              <label className="block max-w-xs text-xs font-bold text-gray-600">
                Passing Percentage
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={schemeForm.passingPercent}
                  onChange={(event) => setField("passingPercent", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-sm font-normal outline-none focus:border-orange-500"
                />
              </label>

              <div className="rounded-2xl border bg-gray-50 p-5 text-sm text-gray-700">
                <div className="font-bold text-gray-900">Calculation example</div>
                <div className="mt-2 space-y-1">
                  <div>CEC: 30 / 30 → 30 weighted marks</div>
                  <div>Midterm: 25 / 50 → 10 weighted marks</div>
                  <div>External: 35 / 70 → 25 weighted marks</div>
                  <div className="pt-2 font-extrabold text-orange-700">Final Total: 65 / 100</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingScheme}
                className="w-full rounded-xl bg-orange-600 py-3 font-extrabold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50"
              >
                {savingScheme ? "Saving..." : "Save Assessment Scheme"}
              </button>
            </form>
          )}

          {tab === "import" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <div className="font-extrabold text-blue-900">Generated Excel Template</div>
                <p className="mt-1 text-sm text-blue-800">
                  The workbook is generated from the selected course and semester. It includes the active students and all subjects automatically.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-orange-700"
                >
                  Download Excel Template
                </button>
                <span className="text-sm text-gray-500">
                  {selectedCourse?.courseName || "No course selected"} · Semester {schemeForm.semester} · {schemeForm.academicYear || "No academic year"}
                </span>
              </div>

              <form onSubmit={importExcel} className="rounded-2xl border bg-gray-50 p-5">
                <label className="block text-sm font-bold text-gray-700">
                  Completed Result Workbook
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                    className="mt-2 block w-full rounded-xl border bg-white p-3 text-sm"
                  />
                </label>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                  Enter only raw marks. CampusCore converts them automatically to the final 100-mark scale.
                </div>

                <button
                  type="submit"
                  disabled={importing}
                  className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {importing ? "Validating and Importing..." : "Validate and Save as Draft"}
                </button>
              </form>
            </div>
          )}

          {tab === "review" && (
            <div className="space-y-5">
              {errors.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <div className="font-extrabold">Validation Errors</div>
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                    {errors.map((error, index) => <div key={index}>• {error}</div>)}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ["Records", importResult?.importedRows ?? counts.total, "gray"],
                  ["Complete", importResult?.completeRows ?? counts.complete, "green"],
                  ["Pending", importResult?.pendingRows ?? counts.pending, "amber"],
                  ["Current Status", statusFilter === "published" ? "Published" : "Draft", statusFilter === "published" ? "blue" : "orange"],
                ].map(([label, value, tone]) => {
                  const toneClass = {
                    gray: "bg-gray-50",
                    green: "bg-green-50",
                    amber: "bg-amber-50",
                    blue: "bg-blue-50",
                    orange: "bg-orange-50",
                  }[tone] || "bg-gray-50";
                  return (
                    <div key={label} className={`rounded-2xl border ${toneClass} p-4`}>
                      <div className="text-xs font-bold uppercase text-gray-500">{label}</div>
                      <div className="mt-1 text-xl font-extrabold text-gray-900">{value}</div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={loadResults}
                className="rounded-xl border bg-white px-4 py-2.5 text-sm font-bold hover:bg-gray-50"
              >
                Refresh Results
              </button>

              <div className="overflow-auto rounded-2xl border">
                <table className="min-w-[1250px] w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      {["Student", "Subject", "CEC", "Midterm", "External", "Final / 100", "Grade", "GP", "Status"].map((header) => (
                        <th key={header} className="p-3 text-left font-extrabold text-gray-700">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(importResult?.preview?.length ? importResult.preview : list).slice(0, 200).map((row, index) => (
                      <tr key={row._id || `${row.studentId}-${row.subjectCode}-${index}`} className="hover:bg-orange-50/40">
                        <td className="p-3">
                          <div className="font-bold">{row.studentName || row.student?.name}</div>
                          <div className="text-xs text-gray-500">{row.studentId || row.student?.id_no}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold">{row.subjectCode || row.subject?.subjectCode}</div>
                          <div className="text-xs text-gray-500">{row.subjectName || row.subject?.subjectName}</div>
                        </td>
                        <td className="p-3">{row.cec ?? "—"} → {row.cecWeighted ?? "—"}</td>
                        <td className="p-3">{row.midterm ?? "—"} → {row.midtermWeighted ?? "—"}</td>
                        <td className="p-3">{row.external ?? "—"} → {row.externalWeighted ?? "—"}</td>
                        <td className="p-3 font-extrabold">{row.total ?? "—"}</td>
                        <td className="p-3 font-extrabold">{row.grade || "—"}</td>
                        <td className="p-3">{row.gradePoint ?? "—"}</td>
                        <td className="p-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                            row.status === "published" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                          }`}>
                            {row.status === "published" ? "Published" : "Draft"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "publish" && (
            <div className="space-y-5">
              <div className="rounded-2xl border bg-gray-50 p-5">
                <div className="text-xs font-bold uppercase text-gray-500">Current Selection</div>
                <div className="mt-1 text-lg font-extrabold text-gray-900">
                  {selectedCourse?.courseName || "Course"} · Semester {schemeForm.semester} · {schemeForm.academicYear || "Academic Year"}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-xl border p-3 text-sm font-bold"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>

                <button
                  type="button"
                  onClick={loadResults}
                  className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-gray-50"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={publish}
                  disabled={statusFilter !== "draft" || !list.length}
                  className="rounded-xl bg-green-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-green-700 disabled:opacity-40"
                >
                  Publish Draft Results
                </button>
              </div>

              {statusFilter === "published" && list.length > 0 && (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white">✓</div>
                    <div>
                      <div className="font-extrabold text-green-900">Results Published</div>
                      <div className="text-sm text-green-800">
                        Published results are now available to students.
                        {publishedAt ? ` Published at ${new Date(publishedAt).toLocaleString()}.` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-auto rounded-2xl border">
                <table className="min-w-[1050px] w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      {["Student", "Subject", "Final / 100", "Percentage", "Grade", "GP", "Status"].map((header) => (
                        <th key={header} className="p-3 text-left font-extrabold text-gray-700">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loadingList ? (
                      <tr><td colSpan="7" className="p-10 text-center text-gray-400">Loading results...</td></tr>
                    ) : list.length === 0 ? (
                      <tr><td colSpan="7" className="p-10 text-center text-gray-400">No result records found.</td></tr>
                    ) : (
                      list.slice(0, 300).map((row) => (
                        <tr key={row._id}>
                          <td className="p-3">
                            <div className="font-bold">{row.student?.name}</div>
                            <div className="text-xs text-gray-500">{row.student?.id_no}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold">{row.subject?.subjectCode}</div>
                            <div className="text-xs text-gray-500">{row.subject?.subjectName}</div>
                          </td>
                          <td className="p-3 font-extrabold">{row.total ?? "—"} / 100</td>
                          <td className="p-3">{row.percentage ?? "—"}%</td>
                          <td className="p-3 font-extrabold">{row.grade || "—"}</td>
                          <td className="p-3">{row.gradePoint ?? "—"}</td>
                          <td className="p-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                              row.status === "published" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                            }`}>
                              {row.status === "published" ? "Published" : "Draft"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
