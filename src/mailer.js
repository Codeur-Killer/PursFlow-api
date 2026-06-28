require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html,
  });
}

const LEVEL_LABEL = { amber: "Avant échéance", blue: "Information", red: "Retard" };

const LEVEL_COLORS = {
  amber: { bg: "#FFFBEB", border: "#F59E0B", badge: "#92400E", badgeBg: "#FEF3C7", dot: "#F59E0B" },
  blue:  { bg: "#EFF6FF", border: "#3B82F6", badge: "#1E40AF", badgeBg: "#DBEAFE", dot: "#3B82F6" },
  red:   { bg: "#FFF1F2", border: "#F43F5E", badge: "#9F1239", badgeBg: "#FFE4E6", dot: "#F43F5E" },
};

function reminderEmailHtml({ reminder, analysis, step }) {
  const urgency = LEVEL_LABEL[reminder.level] || "Rappel";
  const colors = LEVEL_COLORS[reminder.level] || LEVEL_COLORS.blue;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${reminder.type}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F0;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#0F0F0E;">
                      Purs<span style="color:#1E7A42;">Flow</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="
                      display:inline-block;
                      padding:4px 12px;
                      background-color:${colors.badgeBg};
                      color:${colors.badge};
                      font-size:11px;
                      font-weight:700;
                      letter-spacing:0.1em;
                      text-transform:uppercase;
                      border-radius:20px;
                    ">${urgency}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="
              background-color:#FFFFFF;
              border-radius:12px;
              border-top:4px solid ${colors.border};
              box-shadow:0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
              overflow:hidden;
            ">

              <!-- Card body -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:36px 40px 32px;">

                    <!-- Type de rappel -->
                    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9E9E96;">
                      Notification
                    </p>
                    <h1 style="margin:0 0 28px;font-size:22px;font-weight:700;color:#0F0F0E;line-height:1.3;">
                      ${reminder.type}
                    </h1>

                    <!-- Divider -->
                    <div style="height:1px;background-color:#EBEBEA;margin-bottom:28px;"></div>

                    <!-- Analyse info -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="
                      background-color:${colors.bg};
                      border-radius:8px;
                      border-left:3px solid ${colors.border};
                      margin-bottom:24px;
                    ">
                      <tr>
                        <td style="padding:16px 20px;">
                          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9E9E96;">Analyse concernée</p>
                          <p style="margin:0;font-size:15px;font-weight:600;color:#0F0F0E;">${analysis.title}</p>
                          <p style="margin:4px 0 0;font-size:12px;color:#6B6B65;font-family:'Courier New',monospace;">ID : ${analysis.id}</p>
                        </td>
                      </tr>
                    </table>

                    ${step ? `
                    <!-- Étape -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="padding:0;">
                          <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9E9E96;">Étape concernée</p>
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="
                                padding:8px 14px;
                                background-color:#F7F7F5;
                                border-radius:6px;
                                font-size:14px;
                                color:#0F0F0E;
                                font-weight:500;
                              ">
                                <span style="display:inline-block;width:6px;height:6px;background:${colors.dot};border-radius:50%;margin-right:8px;vertical-align:middle;"></span>${step.name}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    ` : ""}

                    ${reminder.message ? `
                    <!-- Message -->
                    <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9E9E96;">Message</p>
                    <p style="margin:0;font-size:14px;color:#3A3A36;line-height:1.65;padding:14px 18px;background:#F7F7F5;border-radius:8px;">
                      ${reminder.message}
                    </p>
                    ` : ""}

                  </td>
                </tr>

                <!-- Footer card -->
                <tr>
                  <td style="
                    padding:18px 40px;
                    background-color:#F7F7F5;
                    border-top:1px solid #EBEBEA;
                    border-radius:0 0 12px 12px;
                  ">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <p style="margin:0;font-size:12px;color:#9E9E96;line-height:1.5;">
                            Ce message est une notification automatique générée par <strong style="color:#6B6B65;">PursFlow</strong>.<br/>
                            Merci de ne pas répondre directement à cet email.
                          </p>
                        </td>
                        <td align="right" style="white-space:nowrap;padding-left:16px;">
                          <span style="
                            display:inline-block;
                            width:28px;
                            height:28px;
                            background-color:#1E7A42;
                            border-radius:6px;
                            line-height:28px;
                            text-align:center;
                            font-size:13px;
                            font-weight:800;
                            color:#fff;
                          ">P</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Bottom note -->
          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#BCBCB4;">
                © ${year} PursFlow · Notifications automatiques
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

async function sendReminderEmail({ reminder, analysis, step, to }) {
  return sendMail({
    to,
    subject: `[PursFlow] ${reminder.type} — ${analysis.title}`,
    html: reminderEmailHtml({ reminder, analysis, step }),
  });
}

module.exports = { transporter, sendMail, sendReminderEmail };