const XLSX = require("xlsx");

const normalizeAnswer = (value) => {
  const answer = String(value ?? "").trim().toUpperCase();
  if (/^[A-D]$/.test(answer)) return answer.charCodeAt(0) - 65;
  if (/^[1-4]$/.test(answer)) return Number(answer) - 1;
  return -1;
};

const parseStructuredText = (text) => {
  const normalized = String(text || "").replace(/\r/g, "").replace(/[\u00a0\t]+/g, " ");
  const blocks = normalized
    .split(/(?=^\s*(?:Q(?:UESTION)?\s*\d+\s*[.):\-]|\d+\s*[.)]\s+))/gim)
    .map((part) => part.trim())
    .filter(Boolean);
  const sourceBlocks = blocks.length ? blocks : [normalized.trim()];
  const questions = [];
  const errors = [];

  sourceBlocks.forEach((block, blockIndex) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const questionLines = [];
    const options = ["", "", "", ""];
    let correctAnswer = -1;
    lines.forEach((line) => {
      const optionMatch = line.match(/^\(?([A-D])\)?\s*[).:\-]\s*(.+)$/i);
      const answerMatch = line.match(/^(?:correct\s*)?answer\s*[:\-]\s*([A-D1-4])\b/i)
        || line.match(/^ans\s*[:\-]\s*([A-D1-4])\b/i);
      if (optionMatch) options[optionMatch[1].toUpperCase().charCodeAt(0) - 65] = optionMatch[2].trim();
      else if (answerMatch) correctAnswer = normalizeAnswer(answerMatch[1]);
      else questionLines.push(line.replace(/^\s*(?:Q(?:UESTION)?\s*\d+\s*[.):\-]|\d+\s*[.)])\s*/i, ""));
    });
    const questionText = questionLines.join(" ").trim();
    if (!questionText && !options.some(Boolean)) return;
    if (questionText.length < 3 || options.some((option) => !option) || correctAnswer < 0) {
      errors.push(`Question ${blockIndex + 1}: expected a question, four A-D options, and an Answer line.`);
      return;
    }
    questions.push({ questionText, options, correctAnswer });
  });
  return { questions, errors };
};

const parseSheet = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The spreadsheet does not contain a readable worksheet.");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  if (!rows.length) throw new Error("The spreadsheet is empty.");
  const first = rows[0].map((value) => String(value).trim().toLowerCase());
  const hasHeader = first.some((value) => value.includes("question")) || first.some((value) => value.includes("option a"));
  const dataRows = rows.slice(hasHeader ? 1 : 0);
  const questions = [];
  const errors = [];
  dataRows.forEach((row, index) => {
    const cells = row.map((value) => String(value ?? "").trim());
    if (!cells.some(Boolean)) return;
    const questionText = cells[0] || "";
    const options = cells.slice(1, 5);
    const correctAnswer = normalizeAnswer(cells[5]);
    if (questionText.length < 3 || options.length !== 4 || options.some((value) => !value) || correctAnswer < 0) {
      errors.push(`Row ${index + (hasHeader ? 2 : 1)}: expected question, four options, and correct answer (A-D or 1-4).`);
      return;
    }
    questions.push({ questionText, options, correctAnswer });
  });
  return { questions, errors };
};

module.exports = { parseStructuredText, parseSheet };
