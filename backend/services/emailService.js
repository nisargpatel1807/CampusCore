const htmlEscape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const sendHelpdeskAssignmentEmail = async ({ staff, request }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.HELPDESK_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      "Helpdesk email skipped: set BREVO_API_KEY and HELPDESK_FROM_EMAIL in backend .env"
    );
    return { sent: false, skipped: true };
  }

  if (!staff?.email) {
    console.warn("Helpdesk email skipped: selected staff has no email.");
    return { sent: false, skipped: true };
  }

  const ticketId = String(request._id);
  const studentName = request.student?.name || "Student";
  const studentId = request.student?.id_no || "—";
  const subject = `CampusCore Helpdesk – New Request ${ticketId}`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:680px;margin:0 auto;">
      <h2 style="color:#1d4ed8;">CampusCore Helpdesk</h2>

      <p>Hello <strong>${htmlEscape(staff.name)}</strong>,</p>

      <p>A new helpdesk request has been assigned to you.</p>

      <div style="background:#f3f4f6;padding:16px;border-radius:12px;">
        <p><strong>Ticket ID:</strong> ${htmlEscape(ticketId)}</p>
        <p><strong>Student:</strong> ${htmlEscape(studentName)} (${htmlEscape(studentId)})</p>
        <p><strong>Issue:</strong> ${htmlEscape(request.category)}</p>
        <p><strong>Location:</strong> ${htmlEscape(request.location)}</p>
        <p><strong>Description:</strong> ${htmlEscape(request.description)}</p>
      </div>

      <p>Please check the CampusCore Helpdesk and update the request after taking action.</p>
    </div>
  `;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: "CampusCore Helpdesk",
        email: from,
      },
      to: [
        {
          email: staff.email,
          name: staff.name || "",
        },
      ],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Brevo rejected the message: ${text.slice(0, 500)}`
    );
  }

  const result = await response.json();

  return {
    sent: true,
    skipped: false,
    messageId: result.messageId || null,
  };
};

module.exports = { sendHelpdeskAssignmentEmail };