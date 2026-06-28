const { query } = require("./db");
const { sendReminderEmail } = require("./mailer");

async function sweepDueReminders() {
  const { rows } = await query(`
    SELECT r.*, a.id AS analysis_id, a.title AS analysis_title,
           st.name AS step_name,
           o.email AS owner_email, sup.email AS supervisor_email
    FROM reminders r
    JOIN analyses a ON a.id = r.analysis_id
    JOIN users o ON o.id = a.owner_id
    LEFT JOIN users sup ON sup.id = a.supervisor_id
    LEFT JOIN steps st ON st.id = r.step_id
    WHERE r.sent_at IS NULL
      AND r.resolved = false
      AND r.channel ILIKE '%Email%'
      AND (r.scheduled_at IS NULL OR r.scheduled_at <= now())
  `);

  for (const row of rows) {
    const to = row.type === "Validation" ? row.supervisor_email || row.owner_email : row.owner_email;
    if (!to) continue;

    try {
      await sendReminderEmail({
        reminder: { type: row.type, level: row.level, message: row.message },
        analysis: { id: row.analysis_id, title: row.analysis_title },
        step: row.step_name ? { name: row.step_name } : null,
        to,
      });
      await query("UPDATE reminders SET sent_at = now() WHERE id = $1", [row.id]);
      await query(
        `INSERT INTO logs (analysis_id, action, target, kind)
         VALUES ($1, 'Rappel automatique envoyé', $2, 'reminder')`,
        [row.analysis_id, row.step_name || row.type]
      );
      console.log(`Email envoyé pour le rappel ${row.id} (${row.type}) à ${to}`);
    } catch (err) {
      console.error(`Échec d'envoi pour le rappel ${row.id} :`, err.message);
    }
  }

  return rows.length;
}

function startReminderScheduler() {
  const intervalMs = Number(process.env.REMINDER_SWEEP_INTERVAL_MS) || 60000;
  sweepDueReminders().catch((err) => console.error("Erreur de balayage des rappels :", err.message));
  return setInterval(() => {
    sweepDueReminders().catch((err) => console.error("Erreur de balayage des rappels :", err.message));
  }, intervalMs);
}

module.exports = { sweepDueReminders, startReminderScheduler };
