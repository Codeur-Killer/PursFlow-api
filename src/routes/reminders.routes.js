const express = require("express");
const { query } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { sendReminderEmail } = require("../mailer");

const router = express.Router();
router.use(requireAuth);

const LEVELS = ["amber", "blue", "red"];

function serialize(row) {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    analysis: row.analysis_title,
    stepId: row.step_id,
    step: row.step_name,
    type: row.type,
    message: row.message,
    channel: row.channel,
    level: row.level,
    resolved: row.resolved,
    sentAt: row.sent_at,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    ownerId: row.owner_id,
    supervisorId: row.supervisor_id,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { level, analysisId, resolved } = req.query;
    const conditions = [];
    const params = [];

    if (level) {
      params.push(level);
      conditions.push(`r.level = $${params.length}`);
    }
    if (analysisId) {
      params.push(analysisId);
      conditions.push(`r.analysis_id = $${params.length}`);
    }
    if (resolved !== undefined) {
      params.push(resolved === "true");
      conditions.push(`r.resolved = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await query(
      `SELECT r.*, a.title AS analysis_title, st.name AS step_name,
              a.owner_id, a.supervisor_id
       FROM reminders r
       JOIN analyses a ON a.id = r.analysis_id
       LEFT JOIN steps st ON st.id = r.step_id
       ${where}
       ORDER BY r.created_at DESC`,
      params
    );
    res.json(rows.map(serialize));
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { analysisId, stepId, type, message = "", channel = "Interne", level = "blue", scheduledAt } = req.body;
    if (!analysisId || !type) throw new ApiError(400, "L'analyse et le type de rappel sont requis.");
    if (!LEVELS.includes(level)) throw new ApiError(400, "Niveau invalide.");

    const { rows } = await query(
      `INSERT INTO reminders (analysis_id, step_id, type, message, channel, level, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [analysisId, stepId || null, type, message, channel, level, scheduledAt || null]
    );
    res.status(201).json(serialize(rows[0]));
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { resolved } = req.body;
    const { rows } = await query(
      "UPDATE reminders SET resolved = COALESCE($1, resolved) WHERE id = $2 RETURNING *",
      [resolved ?? null, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Rappel introuvable.");

    if (resolved) {
      await query(
        `INSERT INTO logs (user_id, analysis_id, action, target, kind)
         VALUES ($1, $2, 'a traité le rappel', $3, 'reminder')`,
        [req.user.id, rows[0].analysis_id, rows[0].type]
      );
    }

    res.json(serialize(rows[0]));
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await query("DELETE FROM reminders WHERE id = $1", [req.params.id]);
    if (!rowCount) throw new ApiError(404, "Rappel introuvable.");
    res.status(204).end();
  })
);

router.post(
  "/:id/send",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT r.*, a.id AS analysis_id, a.title AS analysis_title,
              st.name AS step_name, o.email AS owner_email, sup.email AS supervisor_email
       FROM reminders r
       JOIN analyses a ON a.id = r.analysis_id
       JOIN users o ON o.id = a.owner_id
       LEFT JOIN users sup ON sup.id = a.supervisor_id
       LEFT JOIN steps st ON st.id = r.step_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    const row = rows[0];
    if (!row) throw new ApiError(404, "Rappel introuvable.");

    const to = row.type === "Validation" ? row.supervisor_email || row.owner_email : row.owner_email;
    if (!to) throw new ApiError(409, "Aucun destinataire disponible pour ce rappel.");

    await sendReminderEmail({
      reminder: { type: row.type, level: row.level, message: row.message },
      analysis: { id: row.analysis_id, title: row.analysis_title },
      step: row.step_name ? { name: row.step_name } : null,
      to,
    });
    const { rows: updated } = await query(
      "UPDATE reminders SET sent_at = now() WHERE id = $1 RETURNING *",
      [req.params.id]
    );

    res.json({ ...serialize(updated[0]), sentTo: to });
  })
);

module.exports = router;
