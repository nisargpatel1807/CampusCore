const mongoose = require("../db");

// USERS
const Admin = mongoose.model("Admin", { id_no: String, password: String });

const Student = mongoose.model("Student", {
  name: String,
  id_no: String,
  course: String,
  year: Number,
  password: String,
  status: { type: Boolean, default: true }
});

const Teacher = mongoose.model("Teacher", {
  name: String,
  id_no: String,
  subject: String,
  password: String,
  status: { type: Boolean, default: true }
});

// SUBJECT
const Subject = mongoose.model("Subject", {
  subject_code: String,
  subject_name: String,
  course: String,
  year: Number
});

// MATERIAL
const Material = mongoose.model("Material", {
  title: String,
  subject_code: String,
  file_url: String
});

// ASSIGNMENT
const Assignment = mongoose.model("Assignment", {
  title: String,
  subject_code: String,
  due_date: Date
});

// SUBMISSION
const Submission = mongoose.model("Submission", {
  assignment_id: String,
  student_id: String,
  file_url: String
});

// QUIZ
const Quiz = mongoose.model("Quiz", {
  title: String,
  subject_code: String,
  questions: [
    {
      question: String,
      options: [String],
      answer: String
    }
  ]
});

// ATTENDANCE
const Attendance = mongoose.model("Attendance", {
  student_id: String,
  subject_code: String,
  date: Date,
  status: String
});

// REWARD
const Reward = mongoose.model("Reward", {
  student_id: String,
  points: Number,
  badge: String
});

module.exports = {
  Admin, Student, Teacher,
  Subject, Material,
  Assignment, Submission,
  Quiz, Attendance, Reward
};
