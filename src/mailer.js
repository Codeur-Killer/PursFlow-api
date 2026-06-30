require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Render (et d'autres PaaS) n'ont pas toujours de sortie IPv6 fonctionnelle ;
  // smtp.gmail.com résout aussi en AAAA, ce qui provoque ENETUNREACH/ETIMEDOUT
  // si on laisse Node choisir. On force l'IPv4.
  family: 4,
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

const LEVEL_ACCENT = {
  amber: "#C8900A",
  blue:  "#2C5FA8",
  red:   "#B53030",
};

function reminderEmailHtml({ reminder, analysis, step }) {
  const urgency = LEVEL_LABEL[reminder.level] || "Rappel";
  const accent  = LEVEL_ACCENT[reminder.level] || "#1A1A18";
  const year    = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${reminder.type}</title>
</head>
<body style="margin:0;padding:0;background-color:#E8E8E4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#E8E8E4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #D4D4CE;">

          <!-- Barre de niveau -->
          <tr>
            <td style="height:3px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:28px 40px 24px;border-bottom:1px solid #E8E8E4;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:14px;font-weight:700;letter-spacing:0.08em;color:#1A1A18;text-transform:uppercase;">PursFlow</span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${accent};">${urgency}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td style="padding:36px 40px 32px;">

              <!-- Titre -->
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#888882;">Rappel</p>
              <h1 style="margin:0 0 28px;font-size:20px;font-weight:600;color:#1A1A18;line-height:1.35;">${reminder.type}</h1>

              <!-- Dossier + Étape -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #E8E8E4;border-bottom:1px solid #E8E8E4;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 0 14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888882;">Dossier</p>
                    <p style="margin:0;font-size:14px;font-weight:500;color:#1A1A18;">${analysis.title}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#888882;font-family:'Courier New',monospace;">Réf. ${analysis.id}</p>
                  </td>
                  ${step ? `
                  <td style="padding:16px 0 14px;vertical-align:top;text-align:right;width:42%;">
                    <p style="margin:0 0 3px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888882;">Étape</p>
                    <p style="margin:0;font-size:14px;font-weight:500;color:#1A1A18;">${step.name}</p>
                  </td>
                  ` : ""}
                </tr>
              </table>

              <!-- Message -->
              ${reminder.message ? `
              <p style="margin:0;font-size:14px;color:#3A3A36;line-height:1.7;">${reminder.message}</p>
              ` : ""}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 40px;border-top:1px solid #E8E8E4;">
              <p style="margin:0;font-size:11px;color:#AAAAAA;line-height:1.6;">
                Notification automatique &nbsp;·&nbsp; PursFlow &nbsp;·&nbsp; Ne pas répondre à cet email. &nbsp;·&nbsp; © ${year}
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