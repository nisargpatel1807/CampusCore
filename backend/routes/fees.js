const router = require("express").Router();
const crypto = require("crypto");
const mongoose = require("mongoose");

const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const User = require("../models/user");
const Course = require("../models/course.JS");
const Department = require("../models/Department");
const FeeInvoice = require("../models/FeeInvoice");
const FeePayment = require("../models/FeePayment");
const Notification = require("../models/Notification");

router.use(authMiddleware);

const userId = (req) => req.user?.id || req.user?._id || req.user?.user?.id || req.user?.user?._id;
const isObjectId = (value) => mongoose.isValidObjectId(value);
const adminOnly = requireRole("admin");
const studentOnly = requireRole("student");
const asMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const clean = (value) => String(value ?? "").trim();

function receiptNumber() {
  return `CC-${getDateKeyInIndia(new Date()).replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function razorpayCredentials() {
  const keyId = clean(process.env.RAZORPAY_KEY_ID);
  const keySecret = clean(process.env.RAZORPAY_KEY_SECRET);
  if (!keyId || !keySecret) {
    const error = new Error("Online payments are not configured. Add Razorpay test/live keys to backend/.env.");
    error.status = 503;
    throw error;
  }
  return { keyId, keySecret };
}

async function razorpayRequest(endpoint, { method = "GET", body } = {}) {
  const { keyId, keySecret } = razorpayCredentials();
  const response = await fetch(`https://api.razorpay.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.description || data.error?.reason || `Razorpay request failed (${response.status}).`);
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return data;
}

function safeSignatureEqual(expected, received) {
  if (!expected || !received || expected.length !== received.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch (_error) {
    return false;
  }
}

function normalizedGatewayMethod(method) {
  const allowed = new Set(["upi", "card", "netbanking", "wallet", "emi", "paylater"]);
  return allowed.has(String(method || "").toLowerCase()) ? String(method).toLowerCase() : "razorpay";
}

async function markGatewayPaymentCaptured(payment, gatewayPayment, checkoutSignature = "") {
  if (!payment || !gatewayPayment) return null;
  const amountPaise = Math.round(Number(payment.amount) * 100);
  if (gatewayPayment.status !== "captured" || Number(gatewayPayment.amount) !== amountPaise || gatewayPayment.currency !== "INR") {
    return null;
  }
  if (String(gatewayPayment.order_id) !== String(payment.gatewayOrderId)) return null;

  if (payment.status === "paid") return payment;
  const updated = await FeePayment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ["initiated", "cancelled", "failed"] } },
    { $set: {
      status: "paid",
      method: normalizedGatewayMethod(gatewayPayment.method),
      reference: gatewayPayment.id,
      gatewayPaymentId: gatewayPayment.id,
      gatewayStatus: "captured",
      ...(checkoutSignature ? { gatewaySignature: checkoutSignature } : {}),
      paidAt: new Date(gatewayPayment.created_at ? gatewayPayment.created_at * 1000 : Date.now()),
      receiptNumber: receiptNumber()
    } },
    { new: true, runValidators: true }
  );

  // A checkout callback and webhook can arrive together. Return the already-created receipt in that case.
  const finalPayment = updated || await FeePayment.findOne({ _id: payment._id, status: "paid" });
  if (!updated || !finalPayment) return finalPayment;

  const invoice = await FeeInvoice.findById(payment.invoice);
  if (invoice) await refreshInvoice(invoice);
  await createNotification(payment.student, "student", "Fee payment successful", `Your payment of ₹${Number(payment.amount).toLocaleString("en-IN")} was received successfully. Receipt: ${finalPayment.receiptNumber}.`, "fee-payment-success");
  await createAdminNotifications("Online fee payment received", `A gateway payment of ₹${Number(payment.amount).toLocaleString("en-IN")} was captured. Receipt: ${finalPayment.receiptNumber}.`, "fee-payment-success");
  return finalPayment;
}

async function createNotification(recipient, recipientRole, title, message, type = "fee") {
  try {
    await Notification.create({
      recipient,
      recipientRole,
      type,
      title,
      message,
      link: recipientRole === "student" ? "/student/fees" : "/admin/fees"
    });
  } catch (error) {
    console.error("Fees notification error:", error.message);
  }
}

async function createNotificationsForStudents(students, title, message, type = "fee") {
  if (!students.length) return;
  try {
    await Notification.insertMany(students.map((student) => ({
      recipient: student._id,
      recipientRole: "student",
      type,
      title,
      message,
      link: "/student/fees"
    })), { ordered: false });
  } catch (error) {
    console.error("Bulk fee notification error:", error.message);
  }
}

async function createAdminNotifications(title, message, type = "fee-payment") {
  try {
    const admins = await User.find({ role: "admin", status: { $ne: false } }).select("_id").lean();
    if (!admins.length) return;
    await Notification.insertMany(admins.map((admin) => ({
      recipient: admin._id,
      recipientRole: "admin",
      type,
      title,
      message,
      link: "/admin/fees"
    })), { ordered: false });
  } catch (error) {
    console.error("Admin fee notification error:", error.message);
  }
}

function getDateKeyInIndia(dateLike) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(dateLike));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayDifference(dueDate) {
  const todayKey = getDateKeyInIndia(new Date());
  const dueKey = getDateKeyInIndia(dueDate);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const due = new Date(`${dueKey}T00:00:00.000Z`);
  return Math.round((due - today) / 86400000);
}

async function refreshInvoice(invoice) {
  const paidPayments = await FeePayment.find({ invoice: invoice._id, status: "paid", gatewayProvider: "razorpay" })
    .select("amount paidAt")
    .sort({ paidAt: 1, createdAt: 1 })
    .lean();

  const paidTotal = asMoney(paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  let remainingPaid = paidTotal;
  const todayKey = getDateKeyInIndia(new Date());

  invoice.installments = (invoice.installments || []).map((installment) => {
    const allocated = Math.min(Number(installment.amount || 0), remainingPaid);
    remainingPaid = asMoney(Math.max(0, remainingPaid - allocated));
    const paidAmount = asMoney(allocated);
    const dueKey = getDateKeyInIndia(installment.dueDate);
    let status = "pending";
    if (paidAmount >= Number(installment.amount || 0)) status = "paid";
    else if (paidAmount > 0) status = "partial";
    else if (dueKey < todayKey) status = "overdue";
    return { ...installment.toObject(), paidAmount, status };
  });

  const balance = asMoney(Math.max(0, Number(invoice.totalAmount || 0) - paidTotal));
  const anyOverdue = invoice.installments.some((item) => item.status === "overdue" || (item.status === "partial" && getDateKeyInIndia(item.dueDate) < todayKey));
  invoice.paidAmount = paidTotal;
  invoice.balance = balance;
  invoice.status = balance <= 0 ? "paid" : (paidTotal > 0 ? "partial" : (anyOverdue ? "overdue" : "pending"));
  await invoice.save();
  return { paidAmount: paidTotal, balance, status: invoice.status };
}

function buildDepartmentFilter(departmentValue, departmentDoc) {
  if (!departmentValue) return null;
  if (departmentDoc) {
    return { $or: [{ departmentId: departmentDoc._id }, { department: departmentDoc.departmentName }] };
  }
  return { department: departmentValue };
}

async function buildStudentFilter({ department = "", course = "", semester = "", search = "" } = {}) {
  const filter = { role: "student", status: { $ne: false } };
  if (course) filter.course = course;
  if (semester) {
    const semesterNumber = Number(semester);
    if (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 20) {
      const error = new Error("Semester must be a number between 1 and 20.");
      error.status = 400;
      throw error;
    }
    filter.semester = semesterNumber;
  }
  if (department) {
    const departmentDoc = isObjectId(department) ? await Department.findById(department).lean() : null;
    const deptFilter = buildDepartmentFilter(department, departmentDoc);
    if (deptFilter) filter.$and = [...(filter.$and || []), deptFilter];
  }
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$and = [...(filter.$and || []), {
      $or: [{ name: regex }, { firstName: regex }, { surname: regex }, { id_no: regex }, { email: regex }]
    }];
  }
  return filter;
}

// Course and department selectors are populated from CampusCore's own academic records.
router.get("/admin/meta", adminOnly, async (_req, res) => {
  try {
    const [departmentsRaw, coursesRaw, studentCourses, studentDepartments] = await Promise.all([
      Department.find({ status: { $ne: false } }).sort({ departmentName: 1 }).lean(),
      Course.find().populate("department", "departmentName departmentCode").sort({ courseName: 1 }).lean(),
      User.distinct("course", { role: "student", status: { $ne: false } }),
      User.distinct("department", { role: "student", status: { $ne: false } })
    ]);

    const departments = departmentsRaw.map((item) => ({
      _id: String(item._id),
      departmentName: item.departmentName,
      departmentCode: item.departmentCode
    }));
    for (const name of studentDepartments.filter(Boolean)) {
      if (!departments.some((item) => item.departmentName.toLowerCase() === String(name).toLowerCase())) {
        departments.push({ _id: String(name), departmentName: String(name), departmentCode: "" });
      }
    }

    const courses = coursesRaw.map((item) => ({
      _id: String(item._id),
      courseName: item.courseName,
      courseCode: item.courseCode,
      durationYears: item.durationYears,
      departmentId: item.department?._id ? String(item.department._id) : "",
      departmentName: item.department?.departmentName || ""
    }));
    for (const name of studentCourses.filter(Boolean)) {
      if (!courses.some((item) => item.courseName.toLowerCase() === String(name).toLowerCase())) {
        courses.push({ _id: String(name), courseName: String(name), courseCode: "", durationYears: 3, departmentId: "", departmentName: "" });
      }
    }
    res.json({ departments, courses });
  } catch (error) {
    console.error("Fees metadata error:", error);
    res.status(500).json({ message: "Could not load course and department options." });
  }
});

// Student search is separate from invoice loading so an empty invoice table never hides student choices.
router.get("/admin/students", adminOnly, async (req, res) => {
  try {
    const filter = await buildStudentFilter({
      department: clean(req.query.department),
      course: clean(req.query.course),
      semester: clean(req.query.semester),
      search: clean(req.query.search)
    });
    const students = await User.find(filter)
      .select("_id name firstName surname secondName id_no email department departmentId course semester year division")
      .sort({ course: 1, semester: 1, id_no: 1 })
      .limit(3000)
      .lean();
    res.json({ students, count: students.length });
  } catch (error) {
    console.error("Fees student list error:", error);
    res.status(error.status || 500).json({ message: error.message || "Could not load students for fee assignment." });
  }
});

async function validateFeePayload(body) {
  const academicYear = clean(body.academicYear);
  const description = clean(body.description || "Academic fees");
  const components = Array.isArray(body.components) ? body.components.map((item) => ({
    name: clean(item.name),
    amount: asMoney(item.amount)
  })) : [];

  if (!academicYear || academicYear.length > 20) throw new Error("Enter a valid academic year.");
  if (!description || description.length > 160) throw new Error("Enter a fee description (maximum 160 characters).");
  if (!components.length || components.some((item) => !item.name || item.amount < 0 || !Number.isFinite(item.amount))) {
    throw new Error("Add at least one valid fee component.");
  }

  const totalAmount = asMoney(components.reduce((sum, item) => sum + item.amount, 0));
  if (totalAmount <= 0) throw new Error("The total fee must be greater than zero.");

  const installments = Array.isArray(body.installments) ? body.installments.map((item) => ({
    title: clean(item.title || "Installment"),
    amount: asMoney(item.amount),
    dueDate: new Date(item.dueDate)
  })) : [];
  if (!installments.length) throw new Error("Add at least one installment and due date.");
  if (installments.some((item) => !item.title || item.amount <= 0 || Number.isNaN(item.dueDate.getTime()))) {
    throw new Error("Each installment needs a title, amount and valid due date.");
  }
  const installmentTotal = asMoney(installments.reduce((sum, item) => sum + item.amount, 0));
  if (Math.abs(installmentTotal - totalAmount) > 0.01) {
    throw new Error("The installment amounts must add up exactly to the total fee.");
  }

  return { academicYear, description, components, totalAmount, installments };
}

async function assignToStudents({ students, body, adminId }) {
  const fee = await validateFeePayload(body);
  if (!students.length) return { assigned: 0, skipped: 0, message: "No active students match the selected course and department." };

  const batchId = crypto.randomUUID();
  const studentIds = students.map((student) => student._id);
  const existing = await FeeInvoice.find({
    student: { $in: studentIds },
    academicYear: fee.academicYear,
    description: fee.description
  }).select("student course semester").lean();

  const existingSet = new Set(existing.map((item) =>
    `${String(item.student)}|${clean(item.course)}|${Number(item.semester) || ""}`
  ));
  const newStudents = students.filter((student) => {
    const courseName = clean(body.course || student.course || "");
    const semesterNumber = Number(body.semester || student.semester) || "";
    return !existingSet.has(`${String(student._id)}|${courseName}|${semesterNumber}`);
  });
  const skipped = students.length - newStudents.length;

  if (!newStudents.length) return { assigned: 0, skipped, message: "The selected students already have this fee assigned for the chosen academic year." };

  const documents = newStudents.map((student) => ({
    student: student._id,
    academicYear: fee.academicYear,
    department: clean(body.departmentName || body.target?.departmentName || student.department || ""),
    course: clean(body.course || student.course || ""),
    semester: body.semester ? Number(body.semester) : (Number(student.semester) || null),
    description: fee.description,
    components: fee.components,
    totalAmount: fee.totalAmount,
    balance: fee.totalAmount,
    installments: fee.installments.map((item) => ({ ...item, status: "pending", paidAmount: 0 })),
    createdBy: adminId,
    assignmentBatch: batchId
  }));

  const created = await FeeInvoice.insertMany(documents, { ordered: false });
  await createNotificationsForStudents(
    newStudents,
    "New fee assigned",
    `${fee.description}: ₹${fee.totalAmount.toLocaleString("en-IN")} has been assigned for ${fee.academicYear}. Please check My Fees for installment due dates.`,
    "fee-assigned"
  );
  return { assigned: created.length, skipped, batchId, invoiceIds: created.map((item) => item._id) };
}

// Bulk assignment to selected student IDs or all active students matching department/course/semester.
router.post("/admin/invoices/bulk", adminOnly, async (req, res) => {
  try {
    const { studentIds = [], target = {}, course = "", semester = "", department = "", mode = "selected" } = req.body;
    let students = [];
    let departmentName = "";

    if (mode === "all") {
      const selectedDepartment = clean(target.department || department);
      const selectedCourse = clean(target.course || course);
      const selectedSemester = clean(target.semester || semester);
      if (!selectedCourse && !selectedDepartment) {
        return res.status(400).json({ message: "Choose a department or course before assigning fees to all matching students." });
      }
      const filter = await buildStudentFilter({
        department: selectedDepartment,
        course: selectedCourse,
        semester: selectedSemester
      });
      students = await User.find(filter)
        .select("_id name department departmentId course semester")
        .sort({ id_no: 1 })
        .limit(3000)
        .lean();
      const departmentDoc = isObjectId(selectedDepartment) ? await Department.findById(selectedDepartment).lean() : null;
      departmentName = departmentDoc?.departmentName || selectedDepartment;
    } else {
      const ids = [...new Set((Array.isArray(studentIds) ? studentIds : []).filter(isObjectId))];
      if (!ids.length) return res.status(400).json({ message: "Select one or more students, or choose all students in a course." });
      if (ids.length > 3000) return res.status(400).json({ message: "Please assign fees in batches of up to 3,000 students." });
      students = await User.find({ _id: { $in: ids }, role: "student", status: { $ne: false } })
        .select("_id name department departmentId course semester")
        .lean();
    }

    const result = await assignToStudents({
      students,
      body: { ...req.body, course: clean(target.course || course), departmentName },
      adminId: userId(req)
    });
    res.status(201).json({ ...result, matched: students.length });
  } catch (error) {
    console.error("Bulk fee assignment error:", error);
    res.status(400).json({ message: error.message || "Could not assign fees." });
  }
});

// Keep single-student assignment available for compatibility with older dashboard versions.
router.post("/admin/invoices", adminOnly, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.body.studentId, role: "student", status: { $ne: false } })
      .select("_id name department departmentId course semester")
      .lean();
    if (!student) return res.status(404).json({ message: "Student not found." });
    const result = await assignToStudents({ students: [student], body: req.body, adminId: userId(req) });
    res.status(201).json({ ...result, matched: 1 });
  } catch (error) {
    console.error("Single fee assignment error:", error);
    res.status(400).json({ message: error.message || "Could not assign fee." });
  }
});

// Clear all fee test records so administrators can repeat assignment and payment tests.
// This destructive operation is intentionally unavailable when Live Razorpay keys are configured.
router.delete("/admin/test-data", adminOnly, async (req, res) => {
  try {
    const keyId = clean(process.env.RAZORPAY_KEY_ID);
    if (!keyId.startsWith("rzp_test_")) {
      return res.status(403).json({ message: "Fee test data can only be cleared while Razorpay Test Mode keys are configured." });
    }
    if (clean(req.body?.confirmation) !== "CLEAR TEST FEES") {
      return res.status(400).json({ message: 'Confirmation text must be exactly "CLEAR TEST FEES".' });
    }

    const [invoiceCount, paymentCount] = await Promise.all([
      FeeInvoice.countDocuments({}),
      FeePayment.countDocuments({})
    ]);

    // Delete dependent payments first, then invoices. Student accounts and academic records remain untouched.
    await FeePayment.deleteMany({});
    await FeeInvoice.deleteMany({});

    // Remove only notifications created by the Fees module; preserve notices and other app notifications.
    const notificationResult = await Notification.deleteMany({
      type: { $regex: "^fee(?:-|$)", $options: "i" }
    });

    res.json({
      message: `Cleared ${invoiceCount} fee invoice(s), ${paymentCount} payment record(s), and ${notificationResult.deletedCount || 0} fee notification(s). Student accounts and other CampusCore modules were not changed.`,
      deleted: {
        invoices: invoiceCount,
        payments: paymentCount,
        notifications: notificationResult.deletedCount || 0
      }
    });
  } catch (error) {
    console.error("Clear fee test data error:", error);
    res.status(500).json({ message: "Could not clear fee test data. Check the backend logs and MongoDB connection." });
  }
});

router.get("/admin/overview", adminOnly, async (_req, res) => {
  try {
    const [invoicesRaw, payments] = await Promise.all([
      FeeInvoice.find().populate("student", "name firstName surname id_no email department course semester year").sort({ createdAt: -1 }).lean(),
      FeePayment.find({ gatewayProvider: "razorpay" }).populate("student", "name firstName surname id_no email department course semester").populate("invoice", "academicYear description totalAmount").sort({ createdAt: -1 }).lean()
    ]);
    const paidByInvoice = new Map();
    for (const payment of payments) {
      if (payment.status === "paid") {
        const key = String(payment.invoice?._id || payment.invoice);
        paidByInvoice.set(key, asMoney((paidByInvoice.get(key) || 0) + Number(payment.amount || 0)));
      }
    }
    const todayKey = getDateKeyInIndia(new Date());
    const invoices = invoicesRaw.map((invoice) => {
      const paidAmount = paidByInvoice.get(String(invoice._id)) || 0;
      const balance = asMoney(Math.max(0, invoice.totalAmount - paidAmount));
      const overdue = balance > 0 && (invoice.installments || []).some((item) => getDateKeyInIndia(item.dueDate) < todayKey);
      return { ...invoice, paidAmount, balance, status: balance <= 0 ? "paid" : paidAmount > 0 ? "partial" : overdue ? "overdue" : "pending" };
    });
    const total = asMoney(invoices.reduce((sum, item) => sum + item.totalAmount, 0));
    const collected = asMoney(payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount, 0));
    res.json({
      invoices,
      payments,
      stats: {
        invoices: invoices.length,
        total,
        collected,
        pending: asMoney(Math.max(0, total - collected)),
        overdue: invoices.filter((item) => item.status === "overdue").length,
        gatewayProcessing: payments.filter((item) => item.status === "initiated" && item.gatewayProvider === "razorpay").length,
        gatewayFailed: payments.filter((item) => item.status === "failed" && item.gatewayProvider === "razorpay").length,
        testMode: clean(process.env.RAZORPAY_KEY_ID).startsWith("rzp_test_")
      }
    });
  } catch (error) {
    console.error("Fees overview error:", error);
    res.status(500).json({ message: "Could not load fee data. Check the Fees API route and MongoDB connection." });
  }
});

router.get("/my", studentOnly, async (req, res) => {
  try {
    const invoices = await FeeInvoice.find({ student: userId(req) }).sort({ createdAt: -1 });
    const outputInvoices = [];
    for (const invoice of invoices) {
      await refreshInvoice(invoice);
      outputInvoices.push(invoice.toObject());
    }
    const payments = await FeePayment.find({ student: userId(req), gatewayProvider: "razorpay" })
      .populate("invoice", "description academicYear course semester totalAmount")
      .sort({ createdAt: -1 }).lean();
    const paidByInvoice = new Map();
    for (const payment of payments) {
      const invoiceId = String(payment.invoice?._id || payment.invoice);
      if (payment.status === "paid") {
        paidByInvoice.set(invoiceId, asMoney((paidByInvoice.get(invoiceId) || 0) + Number(payment.amount || 0)));
      }
    }
    const invoicesWithPaymentState = outputInvoices.map((invoice) => {
      const invoiceId = String(invoice._id);
      const paidAmount = paidByInvoice.get(invoiceId) || 0;
      const balance = asMoney(Math.max(0, Number(invoice.totalAmount || 0) - paidAmount));
      return {
        ...invoice,
        paidAmount,
        balance,
        availableToSubmit: balance
      };
    });
    const total = asMoney(outputInvoices.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0));
    const paid = asMoney(payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount || 0), 0));
    const processing = asMoney(payments.filter((item) => item.status === "initiated").reduce((sum, item) => sum + Number(item.amount || 0), 0));
    res.json({
      invoices: invoicesWithPaymentState,
      payments,
      stats: {
        total, paid,
        balance: asMoney(Math.max(0, total - paid)),
        processing,
        payable: asMoney(Math.max(0, total - paid))
      }
    });
  } catch (error) {
    console.error("Student fees load error:", error);
    res.status(500).json({ message: "Could not load your fees." });
  }
});

router.get("/config", studentOnly, (_req, res) => {
  res.json({
    gateway: "razorpay",
    enabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    keyId: process.env.RAZORPAY_KEY_ID || "",
    merchantName: process.env.FEE_UPI_NAME || "CampusCore College",
    currency: "INR"
  });
});

// Create a server-side Razorpay Order using the invoice amount, never a client-supplied total.
router.post("/razorpay/order", studentOnly, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const amount = asMoney(req.body.amount);
    if (!isObjectId(invoiceId) || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Choose a valid fee invoice and payment amount." });
    }
    const invoice = await FeeInvoice.findOne({ _id: invoiceId, student: userId(req) });
    if (!invoice) return res.status(404).json({ message: "Fee invoice not found." });
    const current = await refreshInvoice(invoice);
    if (amount > current.balance + 0.001) {
      return res.status(400).json({ message: `Amount exceeds the outstanding balance of ₹${current.balance.toLocaleString("en-IN")}.` });
    }

    const order = await razorpayRequest("/orders", {
      method: "POST",
      body: {
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: `cc${Date.now()}${crypto.randomBytes(3).toString("hex")}`.slice(0, 40),
        notes: {
          campuscore_invoice_id: String(invoice._id),
          campuscore_student_id: String(userId(req)),
          academic_year: invoice.academicYear,
          course: invoice.course || ""
        }
      }
    });

    const payment = await FeePayment.create({
      invoice: invoice._id,
      student: userId(req),
      amount,
      method: "razorpay",
      status: "initiated",
      gatewayProvider: "razorpay",
      gatewayOrderId: order.id,
      gatewayStatus: order.status || "created",
      submittedAt: new Date()
    });
    const { keyId } = razorpayCredentials();
    res.status(201).json({
      keyId,
      orderId: order.id,
      paymentRecordId: payment._id,
      amount: order.amount,
      currency: order.currency,
      merchantName: process.env.FEE_UPI_NAME || "CampusCore College",
      description: invoice.description
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    res.status(error.status || 500).json({ message: error.message || "Could not start secure online checkout." });
  }
});

// Verify the Checkout signature and independently fetch the payment from Razorpay.
router.post("/razorpay/verify", studentOnly, async (req, res) => {
  try {
    const orderId = clean(req.body.razorpay_order_id);
    const paymentId = clean(req.body.razorpay_payment_id);
    const signature = clean(req.body.razorpay_signature);
    if (!orderId || !paymentId || !signature) return res.status(400).json({ message: "Payment confirmation details are incomplete." });

    const payment = await FeePayment.findOne({ gatewayOrderId: orderId, student: userId(req), gatewayProvider: "razorpay" });
    if (!payment) return res.status(404).json({ message: "CampusCore could not find this payment order." });
    const { keySecret } = razorpayCredentials();
    const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
    if (!safeSignatureEqual(expected, signature)) return res.status(400).json({ message: "Payment signature could not be verified. No receipt was generated." });

    let gatewayPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if (String(gatewayPayment.order_id) !== orderId || Number(gatewayPayment.amount) !== Math.round(payment.amount * 100) || gatewayPayment.currency !== "INR") {
      return res.status(400).json({ message: "The payment details do not match this fee invoice." });
    }
    if (gatewayPayment.status === "authorized") {
      try {
        await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, {
          method: "POST",
          body: { amount: Math.round(payment.amount * 100), currency: "INR" }
        });
        gatewayPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
      } catch (captureError) {
        console.warn("Razorpay capture will be reconciled by webhook:", captureError.message);
      }
    }
    if (gatewayPayment.status !== "captured") {
      await FeePayment.updateOne(
        { _id: payment._id, status: { $in: ["initiated", "cancelled"] } },
        { $set: {
          gatewayPaymentId: paymentId,
          gatewayStatus: gatewayPayment.status || "processing",
          ...(gatewayPayment.status === "failed" ? { status: "failed" } : {})
        } }
      );
      return res.status(202).json({
        captured: false,
        status: gatewayPayment.status || "processing",
        message: gatewayPayment.status === "failed" ? "The bank or payment provider did not complete this payment. You can try again." : "Payment is being confirmed by the bank. CampusCore will update the receipt automatically once it is captured."
      });
    }

    const finalPayment = await markGatewayPaymentCaptured(payment, gatewayPayment, signature);
    if (!finalPayment || finalPayment.status !== "paid") {
      return res.status(409).json({ message: "Payment was received but CampusCore could not reconcile it yet. Please refresh the fee page; do not pay again." });
    }
    res.json({
      captured: true,
      message: "Payment successful. Your receipt has been generated automatically.",
      payment: finalPayment
    });
  } catch (error) {
    console.error("Razorpay payment verification error:", error);
    res.status(error.status || 500).json({ message: error.message || "Could not verify the payment. Please refresh before retrying." });
  }
});

router.post("/razorpay/cancel", studentOnly, async (req, res) => {
  try {
    const orderId = clean(req.body.orderId);
    if (!orderId) return res.status(400).json({ message: "Order ID is required." });
    await FeePayment.updateOne(
      { gatewayOrderId: orderId, student: userId(req), status: "initiated" },
      { $set: { status: "cancelled", gatewayStatus: "checkout_closed" } }
    );
    res.json({ message: "Checkout closed. No payment was recorded as paid." });
  } catch (error) {
    console.error("Razorpay checkout cancellation error:", error);
    res.status(500).json({ message: "Could not update the checkout status." });
  }
});

// This handler is mounted with express.raw() before express.json() in server.js.
router.handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = clean(process.env.RAZORPAY_WEBHOOK_SECRET);
    if (!webhookSecret) return res.status(503).json({ message: "Razorpay webhook secret is not configured." });
    const signature = clean(req.headers["x-razorpay-signature"]);
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (!safeSignatureEqual(expected, signature)) return res.status(400).json({ message: "Invalid webhook signature." });
    const eventBody = JSON.parse(rawBody.toString("utf8"));
    if (eventBody.event === "payment.captured") {
      const entity = eventBody.payload?.payment?.entity;
      if (entity?.order_id && entity?.id) {
        const payment = await FeePayment.findOne({ gatewayOrderId: entity.order_id, gatewayProvider: "razorpay" });
        if (payment) await markGatewayPaymentCaptured(payment, entity);
      }
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Razorpay webhook error:", error);
    res.status(500).json({ message: "Webhook processing failed." });
  }
};

// Manual/offline payment submission and office verification routes are intentionally not exposed.

router.get("/receipt/:paymentId", async (req, res) => {
  try {
    if (!isObjectId(req.params.paymentId)) return res.status(400).json({ message: "Invalid receipt ID." });
    const query = { _id: req.params.paymentId, status: "paid", gatewayProvider: "razorpay" };
    if (req.user.role !== "admin") query.student = userId(req);
    const payment = await FeePayment.findOne(query)
      .populate("invoice")
      .populate("student", "name firstName surname id_no email department course semester");
    if (!payment) return res.status(404).json({ message: "Receipt not found." });
    res.json({ payment });
  } catch (error) {
    console.error("Fee receipt error:", error);
    res.status(500).json({ message: "Could not load the receipt." });
  }
});

// Daily in-app reminders (7 days, 3 days, 1 day, due date and overdue).
async function sendDueDateReminders() {
  try {
    const invoices = await FeeInvoice.find({ status: { $ne: "paid" } }).select("student description installments").lean();
    for (const invoice of invoices) {
      for (const installment of invoice.installments || []) {
        if (installment.status === "paid") continue;
        const days = dayDifference(installment.dueDate);
        let reminderKey = "";
        let message = "";
        if (days < 0) {
          reminderKey = `overdue-${getDateKeyInIndia(installment.dueDate)}`;
          message = `${installment.title} for ${invoice.description} is overdue. Please check My Fees and contact the office if you have already paid.`;
        } else if (days <= 1) {
          reminderKey = `due-1-${getDateKeyInIndia(installment.dueDate)}`;
          message = `${installment.title} for ${invoice.description} is due today or tomorrow. Please arrange payment.`;
        } else if (days <= 3) {
          reminderKey = `due-3-${getDateKeyInIndia(installment.dueDate)}`;
          message = `${installment.title} for ${invoice.description} is due within 3 days.`;
        } else if (days <= 7) {
          reminderKey = `due-7-${getDateKeyInIndia(installment.dueDate)}`;
          message = `${installment.title} for ${invoice.description} is due within 7 days.`;
        }
        if (!reminderKey) continue;

        const updated = await FeeInvoice.findOneAndUpdate(
          { _id: invoice._id, installments: { $elemMatch: { _id: installment._id, reminderKeys: { $ne: reminderKey } } } },
          { $addToSet: { "installments.$.reminderKeys": reminderKey } },
          { new: true }
        ).select("student").lean();
        if (updated) {
          await createNotification(updated.student, "student", days < 0 ? "Fee installment overdue" : "Upcoming fee due date", message, "fee-reminder");
        }
      }
    }
  } catch (error) {
    console.error("Fee reminder task error:", error.message);
  }
}

router.startReminderScheduler = function startReminderScheduler() {
  if (router._feeReminderTimer) return;
  const run = () => sendDueDateReminders().catch((error) => console.error(error));
  const startup = setTimeout(run, 20000);
  if (typeof startup.unref === "function") startup.unref();
  router._feeReminderTimer = setInterval(run, 6 * 60 * 60 * 1000);
  if (typeof router._feeReminderTimer.unref === "function") router._feeReminderTimer.unref();
};

module.exports = router;
