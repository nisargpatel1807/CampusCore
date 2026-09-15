const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config({
  path: path.join(__dirname, ".env"),
});
const connectDB = require("./db");

const app = express();
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
connectDB();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/uploads", express.static(uploadDir, { fallthrough: true, maxAge: "1d" }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/teacher", require("./routes/teacher"));
app.use("/api/student", require("./routes/student"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/study-planner", require("./routes/studyPlanner"));
app.use("/api/campus-notices", require("./routes/campusNotices"));

app.get("/", (req, res) => res.json({ message: "CampusCore Backend API Running 🚀" }));
app.use((req, res) => res.status(404).json({ message: "API route not found" }));
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err);
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "Uploaded file is larger than the allowed size." });
  if (err.name === "MulterError") return res.status(400).json({ message: err.message || "File upload failed." });
  return res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => console.log(`CampusCore Server running on port ${PORT}`));
