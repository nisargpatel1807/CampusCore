const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.7-flash";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error) => {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("503") ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("504")
  );
};

const generateWithRetry = async (requestBuilder) => {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(
          `Gemini request: model=${model}, attempt=${attempt}`
        );

        return await requestBuilder(model);
      } catch (error) {
        lastError = error;

        console.error(
          `Gemini error: model=${model}, attempt=${attempt}`,
          error?.message || error
        );

        if (!isRetryableError(error)) {
          throw error;
        }

        if (attempt < 3) {
          const delay = 1500 * Math.pow(2, attempt - 1);

          console.log(`Retrying Gemini in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }
  }

  throw lastError;
};

const analyzeExamTimetable = async (filePath, mimeType) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Exam timetable file not found.");
  }

  const fileData = fs.readFileSync(filePath).toString("base64");

  const prompt = `
You are an exam timetable extraction assistant for a college management system.

Analyze the uploaded exam timetable carefully.

Extract ONLY actual exam entries.

For every exam, return:
- subject
- examDate

Rules:
1. Do not invent subjects.
2. Do not invent dates.
3. Ignore holidays, breaks and non-exam events.
4. Preserve the subject name as written in the timetable.
5. Convert dates into YYYY-MM-DD format whenever possible.
6. If the date cannot be confidently identified, do not include that entry.
`;

  const response = await generateWithRetry((model) =>
    ai.models.generateContent({
      model,
      contents: [
        { inlineData: { mimeType, data: fileData } },
        { text: prompt },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            exams: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  subject: { type: "string" },
                  examDate: { type: "string" },
                },
                required: ["subject", "examDate"],
              },
            },
          },
          required: ["exams"],
        },
      },
    })
  );

  try {
    const result = JSON.parse(response.text);
    return Array.isArray(result.exams) ? result.exams : [];
  } catch {
    throw new Error("Gemini returned an invalid timetable response.");
  }
};

const buildStudyPlanPrompt = ({
  mode,
  startDate,
  planDays,
  planDates,
  dailyStudyMinutes,
  targetMarks,
  subjects,
  pendingAssignments,
  examSchedule,
}) => `
You are an intelligent college study planner.

Create a realistic study plan for a student.

PLAN START DATE:
${startDate}

PLAN DURATION:
${planDays} day(s)

PLAN DATES:
${JSON.stringify(planDates, null, 2)}

STUDY MODE:
${mode}

DAILY AVAILABLE STUDY TIME:
${dailyStudyMinutes} minutes

TARGET MARKS:
${targetMarks}%

SUBJECTS:
${JSON.stringify(subjects, null, 2)}

PENDING ASSIGNMENTS:
${JSON.stringify(pendingAssignments || [], null, 2)}

EXAM SCHEDULE:
${JSON.stringify(examSchedule || [], null, 2)}

GENERAL RULES:
1. Return exactly ${planDays} plan days, no more and no fewer.
2. Use the provided plan dates in order.
3. Never exceed the student's daily available study time.
4. Give more attention to subjects with lower syllabus progress.
5. Consider pending assignments and due dates.
6. Use retrieval practice, active recall, practice questions and revision where appropriate.
7. Do not create impossible workloads.
8. Use only the provided subjects.
9. Do not invent exam dates or assignments.
10. Every task must have a realistic duration.
11. Each day's totalMinutes must equal the sum of its task minutes.
12. Each day's totalMinutes must be equal to or below the available daily time.
13. Do not schedule work for dates outside the provided plan dates.
14. Prefer several focused tasks over one unrealistic long task.
15. If available time is low, prioritize high-value work instead of pretending all syllabus can be completed.

IF STUDY MODE IS "regular":
- Create a balanced and sustainable routine.
- Focus on consistent syllabus coverage.
- Balance study time across selected subjects.
- Give somewhat more time to lower-progress subjects.
- Do not let exam dates dominate the schedule.
- Include learning, practice and revision.
- Avoid exam cramming.

IF STUDY MODE IS "exam":
- Upcoming exam dates are a major priority.
- Earlier exams receive higher priority.
- Give additional time to subjects with low progress and near exams.
- Within 7 days of an exam, strongly prioritize that subject.
- Within 3 days of an exam, emphasize revision, recall and practice.
- Consider assignment deadlines together with exam urgency.
- Never prioritize an exam that has already passed.
- Avoid spending most of the plan on a much later exam unless progress is very low.

For each day, the "day" field should use the corresponding calendar date in a readable form.
`;

const planSchema = (minItems, maxItems) => ({
  type: "object",
  properties: {
    plan: {
      type: "array",
      minItems,
      maxItems,
      items: {
        type: "object",
        properties: {
          day: { type: "string" },
          totalMinutes: { type: "integer", minimum: 0 },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                subject: { type: "string" },
                topic: { type: "string" },
                minutes: { type: "integer", minimum: 1 },
                type: { type: "string" },
              },
              required: ["subject", "topic", "minutes", "type"],
            },
          },
        },
        required: ["day", "totalMinutes", "tasks"],
      },
    },
  },
  required: ["plan"],
});

const generateStudyPlan = async ({
  mode,
  startDate,
  planDays,
  planDates,
  dailyStudyMinutes,
  targetMarks,
  subjects,
  pendingAssignments,
  examSchedule,
}) => {
  const prompt = buildStudyPlanPrompt({
    mode,
    startDate,
    planDays,
    planDates,
    dailyStudyMinutes,
    targetMarks,
    subjects,
    pendingAssignments,
    examSchedule,
  });

  const response = await generateWithRetry((model) =>
    ai.models.generateContent({
      model,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: planSchema(planDays, planDays),
      },
    })
  );

  try {
    const result = JSON.parse(response.text);

    if (
      !result ||
      !Array.isArray(result.plan) ||
      result.plan.length !== Number(planDays)
    ) {
      throw new Error("invalid plan length");
    }

    return result;
  } catch {
    throw new Error("Gemini returned an invalid study plan response.");
  }
};

const generateAdaptiveStudyPlan = async ({
  mode,
  startDate,
  planDays,
  planDates,
  dailyStudyMinutes,
  originalDailyStudyMinutes,
  targetMarks,
  subjects,
  pendingAssignments,
  examSchedule,
  currentPlan,
  missedTasks,
  missedDate,
}) => {
  const prompt = `
You are an intelligent adaptive college study planner.

A student already had a study plan but could not complete some planned work.
Create a revised plan ONLY for the remaining planning window.

REPLAN START DATE:
${startDate}

REMAINING PLAN DAYS:
${planDays}

REMAINING PLAN DATES:
${JSON.stringify(planDates, null, 2)}

MISSED DATE:
${missedDate}

STUDY MODE:
${mode}

CURRENT DAILY AVAILABLE STUDY TIME:
${dailyStudyMinutes} minutes

ORIGINAL DAILY STUDY TIME:
${originalDailyStudyMinutes} minutes

TARGET MARKS:
${targetMarks}%

SUBJECTS:
${JSON.stringify(subjects, null, 2)}

PENDING ASSIGNMENTS:
${JSON.stringify(pendingAssignments || [], null, 2)}

EXAM SCHEDULE:
${JSON.stringify(examSchedule || [], null, 2)}

UNFINISHED MISSED TASKS:
${JSON.stringify(missedTasks || [], null, 2)}

CURRENT FUTURE PLAN:
${JSON.stringify(currentPlan || [], null, 2)}

ADAPTIVE RULES:
1. Return exactly ${planDays} days.
2. Use the provided remaining plan dates in order.
3. Treat missed tasks as unfinished work.
4. Do not repeat work that is explicitly listed as completed or already finished.
5. Redistribute important missed work across the remaining days.
6. Never exceed the current daily available study time of ${dailyStudyMinutes} minutes.
7. If the backlog cannot fit, prioritize the highest-value work and defer lower-priority work rather than creating impossible days.
8. Consider syllabus progress, assignment deadlines and exam urgency.
9. In exam mode, prioritize nearer exams.
10. In regular mode, keep the schedule sustainable and balanced.
11. Include retrieval/practice and revision where appropriate.
12. Do not invent subjects, exams or assignments.
13. Do not simply copy the old plan. Make a meaningful adjustment.
14. Each day's totalMinutes must equal the sum of task minutes.
15. Each day's totalMinutes must be equal to or below the available daily study time.
16. Use only the remaining dates supplied above.
17. If the remaining capacity is insufficient, clearly prioritize important work through the schedule instead of cramming everything into fewer days.

Return only the revised plan.
`;

  const response = await generateWithRetry((model) =>
    ai.models.generateContent({
      model,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: planSchema(planDays, planDays),
      },
    })
  );

  try {
    const result = JSON.parse(response.text);

    if (
      !result ||
      !Array.isArray(result.plan) ||
      result.plan.length !== Number(planDays)
    ) {
      throw new Error("invalid adaptive plan length");
    }

    return result;
  } catch {
    throw new Error(
      "Gemini returned an invalid adaptive study plan response."
    );
  }
};

module.exports = {
  analyzeExamTimetable,
  generateStudyPlan,
  generateAdaptiveStudyPlan,
};
