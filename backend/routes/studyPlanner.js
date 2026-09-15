const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/user");
const StudyPlan = require("../models/StudyPlan");

const {
  analyzeExamTimetable,
  generateStudyPlan,
  generateAdaptiveStudyPlan,
} = require("../services/geminiService");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads/exam-timetables");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),

  filename: (req, file, cb) => {
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 150);

    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only PDF, JPG, PNG and WEBP files are allowed.")
      );
    }

    cb(null, true);
  },
});

const startOfDay = (dateLike) => {
  const date = new Date(`${dateLike}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDateInput = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

const buildDateList = (startDate, days) =>
  Array.from({ length: days }, (_, index) =>
    formatDateInput(addDays(startDate, index))
  );

const isValidPlanTaskKey = (key, plan) => {
  if (typeof key !== "string" || !/^\d+-\d+$/.test(key)) {
    return false;
  }

  const [dayIndex, taskIndex] = key.split("-").map(Number);

  return Boolean(
    Array.isArray(plan) &&
      plan[dayIndex] &&
      Array.isArray(plan[dayIndex].tasks) &&
      plan[dayIndex].tasks[taskIndex]
  );
};

const taskMatchesPlan = (missedTask, planStartDate, currentPlan) => {
  const plannedDate = String(missedTask.plannedDate || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) {
    return false;
  }

  const dayIndex = currentPlan.findIndex((day, index) => {
    const expectedDate = formatDateInput(
      addDays(planStartDate, index)
    );

    return expectedDate === plannedDate;
  });

  if (dayIndex < 0) return false;

  const candidateTasks = Array.isArray(currentPlan[dayIndex].tasks)
    ? currentPlan[dayIndex].tasks
    : [];

  return candidateTasks.some(
    (task) =>
      String(task.subject || "").trim() === missedTask.subject &&
      String(task.topic || "").trim() === missedTask.topic &&
      Number(task.minutes || 0) === missedTask.minutes &&
      String(task.type || "").trim() === missedTask.type
  );
};

// =====================================================
// 1. UPLOAD EXAM TIMETABLE
// =====================================================

router.post(
  "/upload-exam-timetable",
  authMiddleware,
  upload.single("examTimetable"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      if (user.role !== "student") {
        return res.status(403).json({
          message: "Only students can upload exam timetables.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Please upload an exam timetable.",
        });
      }

      const existingPlan = await StudyPlan.findOne({
        student: user._id,
        mode: "exam",
        status: "draft",
      }).sort({ createdAt: -1 });

      if (
        existingPlan?.examTimetableFile?.filePath &&
        fs.existsSync(existingPlan.examTimetableFile.filePath)
      ) {
        fs.unlinkSync(existingPlan.examTimetableFile.filePath);
      }

      let studyPlan;

      if (existingPlan) {
        existingPlan.examTimetableFile = {
          fileName: req.file.filename,
          filePath: req.file.path,
          fileType: req.file.mimetype,
          uploadedAt: new Date(),
        };

        existingPlan.examSchedule = [];

        await existingPlan.save();

        studyPlan = existingPlan;
      } else {
        studyPlan = await StudyPlan.create({
          student: user._id,
          mode: "exam",

          examTimetableFile: {
            fileName: req.file.filename,
            filePath: req.file.path,
            fileType: req.file.mimetype,
            uploadedAt: new Date(),
          },

          targetMarks: 1,
          dailyStudyMinutes: 30,
          subjects: [],
          pendingAssignments: [],
          examSchedule: [],
          status: "draft",
        });
      }

      return res.status(200).json({
        message: "Exam timetable uploaded successfully.",
        studyPlanId: studyPlan._id,
        fileName: req.file.filename,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
      });
    } catch (error) {
      console.error("Exam Timetable Upload Error:", error);

      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({
        message:
          error.message || "Failed to upload exam timetable.",
      });
    }
  }
);

// =====================================================
// 2. GET CURRENT SAVED PLAN
// =====================================================

router.get("/current", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Student not found.",
      });
    }

    if (user.role !== "student") {
      return res.status(403).json({
        message: "Only students can load study plans.",
      });
    }

    const studyPlan = await StudyPlan.findOne({
      student: user._id,
      status: "generated",
    }).sort({ updatedAt: -1 });

    if (!studyPlan) {
      return res.status(404).json({
        message: "No saved study plan found.",
      });
    }

    return res.status(200).json({
      data: {
        studyPlanId: studyPlan._id,
        mode: studyPlan.mode,
        planStartDate: studyPlan.planStartDate,
        planDays: studyPlan.planDays,
        planEndDate: studyPlan.planEndDate,
        dailyStudyMinutes: studyPlan.dailyStudyMinutes,
        targetMarks: studyPlan.targetMarks,
        subjects: studyPlan.subjects,
        pendingAssignments: studyPlan.pendingAssignments,
        examSchedule: studyPlan.examSchedule,
        completedTasks: studyPlan.completedTasks || [],
        adaptiveReplan: studyPlan.adaptiveReplan || {},
        plan: Array.isArray(studyPlan.plan)
          ? studyPlan.plan
          : [],
      },
    });
  } catch (error) {
    console.error("Load Current Study Plan Error:", error);

    return res.status(500).json({
      message:
        error.message || "Failed to load current study plan.",
    });
  }
});

// =====================================================
// 3. SAVE TASK COMPLETION
// =====================================================

router.put("/progress", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Student not found.",
      });
    }

    if (user.role !== "student") {
      return res.status(403).json({
        message: "Only students can update study progress.",
      });
    }

    const { completedTasks } = req.body;

    if (!Array.isArray(completedTasks)) {
      return res.status(400).json({
        message: "Completed tasks must be an array.",
      });
    }

    const studyPlan = await StudyPlan.findOne({
      student: user._id,
      status: "generated",
    }).sort({ updatedAt: -1 });

    if (!studyPlan) {
      return res.status(404).json({
        message: "No generated study plan found.",
      });
    }

    const cleanKeys = [
      ...new Set(
        completedTasks
          .filter((key) => typeof key === "string")
          .map((key) => key.trim())
          .filter((key) =>
            isValidPlanTaskKey(
              key,
              Array.isArray(studyPlan.plan)
                ? studyPlan.plan
                : []
            )
          )
      ),
    ];

    studyPlan.completedTasks = cleanKeys;

    await studyPlan.save();

    return res.status(200).json({
      message: "Study progress saved.",
      completedTasks: cleanKeys,
    });
  } catch (error) {
    console.error("Study Progress Save Error:", error);

    return res.status(500).json({
      message:
        error.message || "Failed to save study progress.",
    });
  }
});

// =====================================================
// 4. GENERATE SMART STUDY PLAN
// =====================================================

router.post("/generate", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Student not found.",
      });
    }

    if (user.role !== "student") {
      return res.status(403).json({
        message: "Only students can generate study plans.",
      });
    }

    const {
      mode,
      startDate,
      planDays,
      dailyStudyMinutes,
      targetMarks,
      subjects,
      examSchedule,
    } = req.body;

    if (!["exam", "regular"].includes(mode)) {
      return res.status(400).json({
        message: "Invalid study mode.",
      });
    }

    const selectedPlanDays = Number(planDays);

    if (
      !Number.isInteger(selectedPlanDays) ||
      selectedPlanDays < 1 ||
      selectedPlanDays > 7
    ) {
      return res.status(400).json({
        message:
          "Study plan duration must be between 1 and 7 days.",
      });
    }

    if (!startDate) {
      return res.status(400).json({
        message: "Study plan start date is required.",
      });
    }

    const parsedStartDate = startOfDay(startDate);
    const today = startOfDay(formatDateInput(new Date()));

    if (
      Number.isNaN(parsedStartDate.getTime()) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))
    ) {
      return res.status(400).json({
        message: "Invalid study plan start date.",
      });
    }

    if (parsedStartDate < today) {
      return res.status(400).json({
        message:
          "Study plan start date cannot be in the past.",
      });
    }

    const parsedEndDate = addDays(
      parsedStartDate,
      selectedPlanDays - 1
    );

    const planDates = buildDateList(
      parsedStartDate,
      selectedPlanDays
    );

    const dailyMinutes = Number(dailyStudyMinutes);
    const marks = Number(targetMarks);

    if (
      !Number.isInteger(dailyMinutes) ||
      dailyMinutes < 30 ||
      dailyMinutes > 1440
    ) {
      return res.status(400).json({
        message:
          "Daily study time must be between 30 and 1440 minutes.",
      });
    }

    if (
      !Number.isInteger(marks) ||
      marks < 1 ||
      marks > 100
    ) {
      return res.status(400).json({
        message: "Target marks must be between 1 and 100.",
      });
    }

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({
        message: "At least one subject is required.",
      });
    }

    const cleanedSubjects = subjects
      .filter(
        (subject) =>
          subject &&
          subject.selected !== false
      )
      .map((subject) => ({
        name: String(subject.name || "").trim(),
        progress: Number(subject.progress),
        selected: true,
      }));

    if (cleanedSubjects.length === 0) {
      return res.status(400).json({
        message:
          "Please select at least one subject.",
      });
    }

    for (let i = 0; i < cleanedSubjects.length; i++) {
      const subject = cleanedSubjects[i];

      if (
        subject.name.length < 2 ||
        subject.name.length > 100
      ) {
        return res.status(400).json({
          message:
            `Subject ${i + 1} name is invalid.`,
        });
      }

      if (
        !Number.isInteger(subject.progress) ||
        subject.progress < 0 ||
        subject.progress > 100
      ) {
        return res.status(400).json({
          message:
            `Subject ${i + 1} progress must be between 0 and 100.`,
        });
      }
    }

    const names = cleanedSubjects.map(
      (subject) => subject.name.toLowerCase()
    );

    if (new Set(names).size !== names.length) {
      return res.status(400).json({
        message: "Duplicate subjects are not allowed.",
      });
    }

    // CampusCore assignments are the source of truth.
    const Subject = require("../models/Subject");
    const Assignment = require("../models/Assignment");
    const Submission = require("../models/Submission");

    const mySubjects = await Subject.find({
      semester: user.semester || 1,
    })
      .populate(
        "course",
        "courseName courseCode"
      )
      .lean();

    const matchedSubjects = mySubjects.filter(
      (subject) => {
        const courseName = (
          subject.course?.courseName || ""
        ).toLowerCase();

        const courseCode = (
          subject.course?.courseCode || ""
        ).toLowerCase();

        const studentCourse = (
          user.course || ""
        ).toLowerCase();

        const studentDepartment = (
          user.department || ""
        ).toLowerCase();

        return (
          courseName === studentCourse ||
          courseCode === studentCourse ||
          courseName === studentDepartment ||
          courseCode === studentDepartment
        );
      }
    );

    const subjectIds = matchedSubjects.map(
      (subject) => subject._id
    );

    const assignments = await Assignment.find({
      subject: {
        $in: subjectIds,
      },
    })
      .populate(
        "subject",
        "subjectName subjectCode"
      )
      .sort({ dueDate: 1 })
      .lean();

    const submissions = await Submission.find({
      student: user._id,
    }).lean();

    const submittedIds = new Set(
      submissions.map((item) =>
        String(item.assignment)
      )
    );

    const finalPendingAssignments = assignments
      .filter(
        (assignment) =>
          !submittedIds.has(
            String(assignment._id)
          )
      )
      .map((assignment) => ({
        title: assignment.title,
        subject:
          assignment.subject?.subjectName || "",
        dueDate: assignment.dueDate || null,
      }));

    let finalExamSchedule = Array.isArray(
      examSchedule
    )
      ? examSchedule
          .map((exam) => ({
            subject: String(
              exam?.subject || ""
            ).trim(),
            examDate: String(
              exam?.examDate || ""
            ).trim(),
          }))
          .filter(
            (exam) =>
              exam.subject.length >= 2 &&
              exam.subject.length <= 100 &&
              /^\d{4}-\d{2}-\d{2}$/.test(
                exam.examDate
              )
          )
      : [];

    if (
      mode === "exam" &&
      finalExamSchedule.length === 0
    ) {
      const latestExamPlan =
        await StudyPlan.findOne({
          student: user._id,
          mode: "exam",
          status: "draft",
        }).sort({ createdAt: -1 });

      if (
        latestExamPlan?.examSchedule?.length
      ) {
        finalExamSchedule =
          latestExamPlan.examSchedule.map(
            (exam) => ({
              subject: exam.subject,
              examDate: formatDateInput(
                new Date(exam.examDate)
              ),
            })
          );
      }
    }

    const studyPlan = await StudyPlan.findOne({
      student: user._id,
      mode,
      status: {
        $in: ["draft", "generated"],
      },
    }).sort({ updatedAt: -1 });

    const generatedPlan =
      await generateStudyPlan({
        mode,
        startDate:
          formatDateInput(parsedStartDate),
        planDays: selectedPlanDays,
        planDates,
        dailyStudyMinutes: dailyMinutes,
        targetMarks: marks,
        subjects: cleanedSubjects,
        pendingAssignments:
          finalPendingAssignments,
        examSchedule:
          finalExamSchedule,
      });

    if (
      !generatedPlan ||
      !Array.isArray(generatedPlan.plan) ||
      generatedPlan.plan.length !==
        selectedPlanDays
    ) {
      return res.status(422).json({
        message:
          "AI could not generate the requested study plan.",
      });
    }

    const planData = {
      student: user._id,
      mode,
      planStartDate: parsedStartDate,
      planDays: selectedPlanDays,
      planEndDate: parsedEndDate,
      targetMarks: marks,
      dailyStudyMinutes: dailyMinutes,
      subjects: cleanedSubjects,
      pendingAssignments:
        finalPendingAssignments,
      examSchedule:
        finalExamSchedule,
      plan: generatedPlan.plan,
      completedTasks: [],
      adaptiveReplan:
        studyPlan?.adaptiveReplan || {},
      status: "generated",
    };

    let savedPlan;

    if (studyPlan) {
      Object.assign(studyPlan, planData);

      await studyPlan.save();
      savedPlan = studyPlan;
    } else {
      savedPlan =
        await StudyPlan.create(planData);
    }

    return res.status(200).json({
      message:
        "Smart study plan generated successfully. 🤖",
      studyPlanId: savedPlan._id,

      data: {
        mode,
        planStartDate:
          savedPlan.planStartDate,
        planDays: savedPlan.planDays,
        planEndDate:
          savedPlan.planEndDate,
        dailyStudyMinutes:
          dailyMinutes,
        targetMarks: marks,
        subjects: cleanedSubjects,
        pendingAssignments:
          finalPendingAssignments,
        examSchedule:
          finalExamSchedule,
        completedTasks: [],
        adaptiveReplan:
          savedPlan.adaptiveReplan || {},
        plan: generatedPlan.plan,
      },
    });
  } catch (error) {
    console.error(
      "Study Plan Generate Error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to generate study plan.",
    });
  }
});

// =====================================================
// 5. ADAPTIVE STUDY PLAN REPLAN
// =====================================================

router.post(
  "/replan",
  authMiddleware,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      if (user.role !== "student") {
        return res.status(403).json({
          message:
            "Only students can replan study plans.",
        });
      }

      const {
        missedDate,
        missedTasks,
        recoveryDecision = null,
        approvedDailyMinutes = null,
      } = req.body;

      if (!missedDate) {
        return res.status(400).json({
          message:
            "Missed date is required.",
        });
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          String(missedDate)
        )
      ) {
        return res.status(400).json({
          message: "Invalid missed date.",
        });
      }

      const parsedMissedDate =
        startOfDay(missedDate);

      if (
        Number.isNaN(
          parsedMissedDate.getTime()
        )
      ) {
        return res.status(400).json({
          message: "Invalid missed date.",
        });
      }

      const studyPlan =
        await StudyPlan.findOne({
          student: user._id,
          status: "generated",
        }).sort({ updatedAt: -1 });

      if (!studyPlan) {
        return res.status(404).json({
          message:
            "No generated study plan was found. Please generate a study plan first.",
        });
      }

      if (
        !studyPlan.planStartDate ||
        !studyPlan.planEndDate ||
        !studyPlan.planDays
      ) {
        return res.status(422).json({
          message:
            "This study plan does not have a valid planning window. Please generate a new plan.",
        });
      }

      const planStart =
        startOfDay(
          formatDateInput(
            new Date(
              studyPlan.planStartDate
            )
          )
        );

      const planEnd =
        startOfDay(
          formatDateInput(
            new Date(
              studyPlan.planEndDate
            )
          )
        );

      if (
        parsedMissedDate < planStart ||
        parsedMissedDate > planEnd
      ) {
        return res.status(400).json({
          message:
            "Today's date is outside the current study plan window. Please generate a new plan.",
        });
      }

      const dayIndex = Math.floor(
        (
          parsedMissedDate.getTime() -
          planStart.getTime()
        ) / 86400000
      );

      const remainingDays =
        studyPlan.planDays -
        dayIndex -
        1;

      if (remainingDays < 1) {
        return res.status(409).json({
          message:
            "There are no remaining days in this plan after today. Please create a new plan for the next study window.",
        });
      }

      const currentPlan =
        Array.isArray(studyPlan.plan)
          ? studyPlan.plan
          : [];

      const rawMissedTasks =
        Array.isArray(missedTasks)
          ? missedTasks
          : [];

      const cleanMissedTasks =
        rawMissedTasks
          .filter(
            (task) =>
              task &&
              typeof task === "object"
          )
          .map((task) => ({
            plannedDate: String(
              task.plannedDate || ""
            ).trim(),
            subject: String(
              task.subject || ""
            ).trim(),
            topic: String(
              task.topic || ""
            ).trim(),
            minutes: Number(
              task.minutes
            ),
            type: String(
              task.type || ""
            ).trim(),
          }))
          .filter(
            (task) =>
              task.plannedDate &&
              task.subject &&
              task.topic &&
              Number.isInteger(
                task.minutes
              ) &&
              task.minutes > 0 &&
              task.minutes <= 1440 &&
              task.type
          )
          .filter((task) =>
            taskMatchesPlan(
              task,
              planStart,
              currentPlan
            )
          );

      if (
        cleanMissedTasks.length === 0
      ) {
        return res.status(400).json({
          message:
            "No valid unfinished study tasks were found to replan.",
        });
      }

      const missedMinutes =
        cleanMissedTasks.reduce(
          (sum, task) =>
            sum +
            Number(task.minutes || 0),
          0
        );

      const futurePlan =
        currentPlan.slice(
          dayIndex + 1
        );

      const futurePlannedMinutes =
        futurePlan.reduce(
          (sum, day) => {
            if (
              Array.isArray(day.tasks)
            ) {
              return (
                sum +
                day.tasks.reduce(
                  (daySum, task) =>
                    daySum +
                    Number(
                      task.minutes || 0
                    ),
                  0
                )
              );
            }

            return (
              sum +
              Number(
                day.totalMinutes || 0
              )
            );
          },
          0
        );

      const currentDailyMinutes =
        Number(
          studyPlan.dailyStudyMinutes
        );

      const totalAvailableCapacity =
        remainingDays *
        currentDailyMinutes;

      const totalDemand =
        futurePlannedMinutes +
        missedMinutes;

      const shortfall = Math.max(
        0,
        totalDemand -
          totalAvailableCapacity
      );

      const suggestedBase =
        Math.ceil(
          (totalDemand /
            remainingDays) /
            15
        ) * 15;

      const recommendedDailyMinutes =
        Math.min(
          1440,
          Math.max(
            currentDailyMinutes,
            Math.min(
              currentDailyMinutes + 30,
              suggestedBase
            )
          )
        );

      if (
        shortfall > 0 &&
        !recoveryDecision
      ) {
        return res.status(200).json({
          needsRecoveryDecision: true,
          message:
            "Your remaining study capacity is not enough to fit all unfinished work.",
          data: {
            missedMinutes,
            shortfall,
            currentDailyMinutes,
            recommendedDailyMinutes,
            remainingDays,
          },
        });
      }

      let finalDailyMinutes =
        currentDailyMinutes;

      if (
        recoveryDecision === "increase"
      ) {
        const approved = Number(
          approvedDailyMinutes
        );

        if (
          !Number.isInteger(
            approved
          ) ||
          approved <
            currentDailyMinutes ||
          approved > 1440
        ) {
          return res.status(400).json({
            message:
              "Invalid approved recovery study time.",
          });
        }

        finalDailyMinutes =
          approved;
      } else if (
        recoveryDecision !== null &&
        recoveryDecision !== "keep" &&
        recoveryDecision !==
          "increase"
      ) {
        return res.status(400).json({
          message:
            "Invalid recovery decision.",
        });
      }

      const remainingStartDate =
        addDays(
          parsedMissedDate,
          1
        );

      const remainingEndDate =
        addDays(
          remainingStartDate,
          remainingDays - 1
        );

      const remainingPlanDates =
        buildDateList(
          remainingStartDate,
          remainingDays
        );

      const revisedPlan =
        await generateAdaptiveStudyPlan({
          mode: studyPlan.mode,
          startDate:
            formatDateInput(
              remainingStartDate
            ),
          planDays: remainingDays,
          planDates:
            remainingPlanDates,
          dailyStudyMinutes:
            finalDailyMinutes,
          originalDailyStudyMinutes:
            currentDailyMinutes,
          targetMarks:
            studyPlan.targetMarks,
          subjects:
            studyPlan.subjects,
          pendingAssignments:
            studyPlan.pendingAssignments,
          examSchedule:
            studyPlan.examSchedule.map(
              (exam) => ({
                subject:
                  exam.subject,
                examDate:
                  formatDateInput(
                    new Date(
                      exam.examDate
                    )
                  ),
              })
            ),
          currentPlan: futurePlan,
          missedTasks:
            cleanMissedTasks,
          missedDate:
            formatDateInput(
              parsedMissedDate
            ),
        });

      if (
        !revisedPlan ||
        !Array.isArray(
          revisedPlan.plan
        ) ||
        revisedPlan.plan.length !==
          remainingDays
      ) {
        return res.status(422).json({
          message:
            "AI could not generate a valid adaptive study plan.",
        });
      }

      studyPlan.plan =
        revisedPlan.plan;

      studyPlan.planStartDate =
        remainingStartDate;

      studyPlan.planDays =
        remainingDays;

      studyPlan.planEndDate =
        remainingEndDate;

      studyPlan.dailyStudyMinutes =
        finalDailyMinutes;

      studyPlan.completedTasks = [];

      studyPlan.adaptiveReplan =
        studyPlan.adaptiveReplan ||
        {};

      studyPlan.adaptiveReplan
        .lastReplannedAt =
        new Date();

      studyPlan.adaptiveReplan
        .missedDays =
        (
          studyPlan
            .adaptiveReplan
            .missedDays || 0
        ) + 1;

      studyPlan.adaptiveReplan
        .replanHistory =
        studyPlan
          .adaptiveReplan
          .replanHistory || [];

      studyPlan.adaptiveReplan
        .replanHistory.push({
          replannedAt:
            new Date(),
          missedDate:
            formatDateInput(
              parsedMissedDate
            ),
          reason:
            "Student could not study today",
          missedMinutes,
          approvedDailyMinutes:
            finalDailyMinutes,
        });

      await studyPlan.save();

      return res.status(200).json({
        message:
          "Your study plan has been adaptively replanned. 🔄🤖",
        studyPlanId:
          studyPlan._id,
        data: {
          mode:
            studyPlan.mode,
          planStartDate:
            studyPlan.planStartDate,
          planDays:
            studyPlan.planDays,
          planEndDate:
            studyPlan.planEndDate,
          dailyStudyMinutes:
            studyPlan.dailyStudyMinutes,
          targetMarks:
            studyPlan.targetMarks,
          subjects:
            studyPlan.subjects,
          pendingAssignments:
            studyPlan.pendingAssignments,
          examSchedule:
            studyPlan.examSchedule,
          completedTasks: [],
          recovery: {
            missedMinutes,
            shortfall,
            recommendedDailyMinutes,
            appliedDailyMinutes:
              finalDailyMinutes,
            remainingDays,
          },
          adaptiveReplan:
            studyPlan.adaptiveReplan,
          plan:
            revisedPlan.plan,
        },
      });
    } catch (error) {
      console.error(
        "Adaptive Study Plan Error:",
        error
      );

      return res.status(500).json({
        message:
          error.message ||
          "Failed to replan study plan.",
      });
    }
  }
);

// =====================================================
// 6. ANALYZE EXAM TIMETABLE WITH GEMINI
// =====================================================

router.post(
  "/analyze-exam-timetable",
  authMiddleware,
  async (req, res) => {
    try {
      const user = await User.findById(
        req.user.id
      );

      if (!user) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      if (user.role !== "student") {
        return res.status(403).json({
          message:
            "Only students can analyze exam timetables.",
        });
      }

      const studyPlan =
        await StudyPlan.findOne({
          student: user._id,
          mode: "exam",
          status: "draft",
        }).sort({ createdAt: -1 });

      if (!studyPlan) {
        return res.status(404).json({
          message:
            "Please upload an exam timetable first.",
        });
      }

      const timetableFile =
        studyPlan.examTimetableFile;

      if (
        !timetableFile ||
        !timetableFile.filePath ||
        !timetableFile.fileType
      ) {
        return res.status(400).json({
          message:
            "No valid exam timetable is available.",
        });
      }

      const examSchedule =
        await analyzeExamTimetable(
          timetableFile.filePath,
          timetableFile.fileType
        );

      if (
        !Array.isArray(examSchedule)
      ) {
        return res.status(500).json({
          message:
            "Failed to analyze exam timetable.",
        });
      }

      const cleanedSchedule =
        examSchedule
          .map((exam) => ({
            subject: String(
              exam.subject || ""
            ).trim(),
            examDate: String(
              exam.examDate || ""
            ).trim(),
          }))
          .filter(
            (exam) =>
              exam.subject.length >= 2 &&
              exam.subject.length <= 100 &&
              /^\d{4}-\d{2}-\d{2}$/.test(
                exam.examDate
              )
          );

      if (
        cleanedSchedule.length === 0
      ) {
        return res.status(422).json({
          message:
            "AI could not find valid exam entries.",
        });
      }

      studyPlan.examSchedule =
        cleanedSchedule.map(
          (exam) => ({
            subject:
              exam.subject,
            examDate:
              new Date(
                `${exam.examDate}T00:00:00`
              ),
          })
        );

      await studyPlan.save();

      return res.status(200).json({
        message:
          "Exam timetable analyzed successfully. 🤖",
        examSchedule:
          cleanedSchedule,
      });
    } catch (error) {
      console.error(
        "Exam Timetable AI Analysis Error:",
        error
      );

      return res.status(500).json({
        message:
          error.message ||
          "Failed to analyze exam timetable.",
      });
    }
  }
);

module.exports = router;
