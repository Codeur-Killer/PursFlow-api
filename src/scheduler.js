const { query } = require("./db");
const { sendReminderEmail } = require("./mailer");
const { sendPushToUser } = require("./push");

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

// Alerte push : dès qu'un rappel passe en retard (niveau rouge), l'analyste ET le
// superviseur doivent être notifiés, même hors de l'application. Indépendant du
// canal "Email" configuré sur le rappel — un retard doit toujours alerter.
async function sweepPushAlerts() {
  const { rows } = await query(`
    SELECT r.*, a.id AS analysis_id, a.title AS analysis_title,
           st.name AS step_name,
           a.owner_id, a.supervisor_id
    FROM reminders r
    JOIN analyses a ON a.id = r.analysis_id
    LEFT JOIN steps st ON st.id = r.step_id
    WHERE r.pushed_at IS NULL
      AND r.resolved = false
      AND r.level = 'red'
      AND (r.scheduled_at IS NULL OR r.scheduled_at <= now())
  `);

  for (const row of rows) {
    const recipients = new Set([row.owner_id, row.supervisor_id].filter(Boolean));
    const payload = {
      title: `Retard — ${row.analysis_title}`,
      body: row.step_name ? `${row.type} : ${row.step_name}` : row.type,
      url: `/app/analyses/${row.analysis_id}`,
      tag: `reminder-${row.id}`,
    };

    try {
      await Promise.all([...recipients].map((userId) => sendPushToUser(userId, payload)));
      await query("UPDATE reminders SET pushed_at = now() WHERE id = $1", [row.id]);
      console.log(`Push envoyé pour le rappel ${row.id} (${row.type}) à ${recipients.size} destinataire(s)`);
    } catch (err) {
      console.error(`Échec d'envoi push pour le rappel ${row.id} :`, err.message);
    }
  }

  return rows.length;
}

function startReminderScheduler() {
  const intervalMs = Number(process.env.REMINDER_SWEEP_INTERVAL_MS) || 60000;
  const runAll = () => {
    sweepDueReminders().catch((err) => console.error("Erreur de balayage des rappels :", err.message));
    sweepPushAlerts().catch((err) => console.error("Erreur de balayage des alertes push :", err.message));
  };
  runAll();
  return setInterval(runAll, intervalMs);
}

module.exports = { sweepDueReminders, sweepPushAlerts, startReminderScheduler };
