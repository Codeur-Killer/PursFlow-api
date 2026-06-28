const express = require("express");
const { query, pool } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const PRIORITIES = ["Faible", "Moyen", "Élevé"];
const REMINDER_LEVEL_BY_TRIGGER = {
  "Avant échéance": "amber",
  "À la date limite": "blue",
  "Retard": "red",
  "Validation": "blue",
};

function userBrief(id, name, initials) {
  return id ? { id, name, initials } : null;
}

function serializeListRow(row) {
  const total = Number(row.steps_total);
  const done = Number(row.steps_done);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    owner: userBrief(row.owner_id, row.owner_name, row.owner_initials),
    supervisor: userBrief(row.supervisor_id, row.supervisor_name, row.supervisor_initials),
    createdAt: row.created_at,
    startDate: row.start_date,
    progress: total === 0 ? 0 : Math.round((100 * done) / total),
    stepsTotal: total,
    stepsDone: done,
    late: Number(row.steps_late) > 0,
  };
}

function serializeStep(row) {
  return {
    id: row.id,
    order: row.order_index,
    name: row.name,
    description: row.description,
    duration: row.duration_days,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
  };
}

// Les étapes non terminées dont la date de fin est dépassée basculent en retard.
async function promoteOverdueSteps() {
  await query(
    `UPDATE steps SET status = 'En retard'
     WHERE status IN ('À faire', 'En cours') AND end_date < CURRENT_DATE`
  );
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    await promoteOverdueSteps();
    const { search = "", status = "Toutes", priority = "Toutes" } = req.query;

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.title ILIKE $${params.length} OR a.id ILIKE $${params.length})`);
    }
    if (priority !== "Toutes" && PRIORITIES.includes(priority)) {
      params.push(priority);
      conditions.push(`a.priority = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await query(
      `SELECT a.*,
              o.name AS owner_name, o.initials AS owner_initials,
              s.name AS supervisor_name, s.initials AS supervisor_initials,
              COUNT(st.id) AS steps_total,
              COUNT(st.id) FILTER (WHERE st.status = 'Terminée') AS steps_done,
              COUNT(st.id) FILTER (WHERE st.status = 'En retard') AS steps_late
       FROM analyses a
       JOIN users o ON o.id = a.owner_id
       LEFT JOIN users s ON s.id = a.supervisor_id
       LEFT JOIN steps st ON st.analysis_id = a.id
       ${where}
       GROUP BY a.id, o.id, s.id
       ORDER BY a.created_at DESC`,
      params
    );

    let list = rows.map(serializeListRow);

    if (status === "Terminées") list = list.filter((a) => a.progress === 100);
    else if (status === "En retard") list = list.filter((a) => a.late);
    else if (status === "En cours") list = list.filter((a) => a.progress < 100 && !a.late);

    res.json(list);
  })
);

// Route statique déclarée avant "/:id" pour éviter d'être capturée comme un identifiant d'analyse.
router.get(
  "/pending-steps",
  asyncHandler(async (req, res) => {
    await promoteOverdueSteps();
    const { rows } = await query(`
      SELECT st.*, a.id AS analysis_id, a.title AS analysis_title
      FROM steps st
      JOIN analyses a ON a.id = st.analysis_id
      WHERE st.status IN ('En cours', 'En retard')
      ORDER BY (st.status = 'En retard') DESC, st.end_date ASC
    `);
    res.json(
      rows.map((row) => ({
        analysisId: row.analysis_id,
        analysisTitle: row.analysis_title,
        step: serializeStep(row),
      }))
    );
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await promoteOverdueSteps();
    const { rows } = await query(
      `SELECT a.*,
              o.name AS owner_name, o.initials AS owner_initials,
              s.name AS supervisor_name, s.initials AS supervisor_initials
       FROM analyses a
       JOIN users o ON o.id = a.owner_id
       LEFT JOIN users s ON s.id = a.supervisor_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Analyse introuvable.");
    const row = rows[0];

    const { rows: stepRows } = await query(
      "SELECT * FROM steps WHERE analysis_id = $1 ORDER BY order_index",
      [req.params.id]
    );
    const { rows: reminderRows } = await query(
      "SELECT * FROM reminders WHERE analysis_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );

    const total = stepRows.length;
    const done = stepRows.filter((s) => s.status === "Terminée").length;

    res.json({
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      owner: userBrief(row.owner_id, row.owner_name, row.owner_initials),
      supervisor: userBrief(row.supervisor_id, row.supervisor_name, row.supervisor_initials),
      createdAt: row.created_at,
      startDate: row.start_date,
      progress: total === 0 ? 0 : Math.round((100 * done) / total),
      steps: stepRows.map(serializeStep),
      reminders: reminderRows.map((r) => ({
        id: r.id,
        stepId: r.step_id,
        type: r.type,
        message: r.message,
        channel: r.channel,
        level: r.level,
        resolved: r.resolved,
        scheduledAt: r.scheduled_at,
      })),
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      title,
      description = "",
      priority = "Moyen",
      ownerId,
      supervisorId,
      startDate,
      steps = [],
      reminders = { triggers: [], channels: ["Interne"] },
    } = req.body;

    if (!title || !ownerId) throw new ApiError(400, "Titre et responsable sont requis.");
    if (!PRIORITIES.includes(priority)) throw new ApiError(400, "Priorité invalide.");
    if (steps.length === 0) throw new ApiError(400, "Au moins une étape est requise.");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const start = startDate || new Date().toISOString().slice(0, 10);
      const { rows: analysisRows } = await client.query(
        `INSERT INTO analyses (title, description, priority, owner_id, supervisor_id, start_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [title, description, priority, ownerId, supervisorId || null, start]
      );
      const analysisId = analysisRows[0].id;

      let cursor = new Date(start);
      const insertedSteps = [];
      for (let i = 0; i < steps.length; i++) {
        const duration = Math.max(1, parseInt(steps[i].duration, 10) || 1);
        const stepStart = new Date(cursor);
        const stepEnd = new Date(cursor);
        stepEnd.setDate(stepEnd.getDate() + duration);
        cursor = stepEnd;

        const { rows } = await client.query(
          `INSERT INTO steps (analysis_id, order_index, name, description, duration_days, start_date, end_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            analysisId,
            i + 1,
            steps[i].name || `Étape ${i + 1}`,
            steps[i].description || "",
            duration,
            stepStart.toISOString().slice(0, 10),
            stepEnd.toISOString().slice(0, 10),
          ]
        );
        insertedSteps.push(rows[0]);
      }

      const channelLabel = (reminders.channels || ["Interne"]).join(" + ");
      for (const trigger of reminders.triggers || []) {
        if (!REMINDER_LEVEL_BY_TRIGGER[trigger]) continue;
        const level = REMINDER_LEVEL_BY_TRIGGER[trigger];
        await client.query(
          `INSERT INTO reminders (analysis_id, step_id, type, message, channel, level)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [analysisId, insertedSteps[0]?.id || null, trigger, "", channelLabel, level]
        );
      }

      await client.query(
        `INSERT INTO logs (user_id, analysis_id, action, target, kind)
         VALUES ($1, $2, 'a créé l''analyse', $3, 'create')`,
        [req.user.id, analysisId, title]
      );

      await client.query("COMMIT");
      res.status(201).json({ id: analysisId });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { title, description, priority, supervisorId } = req.body;
    if (priority && !PRIORITIES.includes(priority)) throw new ApiError(400, "Priorité invalide.");

    const { rows } = await query(
      `UPDATE analyses SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         priority = COALESCE($3, priority),
         supervisor_id = COALESCE($4, supervisor_id)
       WHERE id = $5
       RETURNING *`,
      [title ?? null, description ?? null, priority ?? null, supervisorId ?? null, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Analyse introuvable.");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  requireRole("Administrateur", "Superviseur"),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query("DELETE FROM analyses WHERE id = $1", [req.params.id]);
    if (!rowCount) throw new ApiError(404, "Analyse introuvable.");
    res.status(204).end();
  })
);

router.post(
  "/:id/steps",
  asyncHandler(async (req, res) => {
    const { name, description = "", duration = 1, startDate, endDate } = req.body;
    if (!name) throw new ApiError(400, "Le nom de l'étape est requis.");

    const { rows: countRows } = await query(
      "SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM steps WHERE analysis_id = $1",
      [req.params.id]
    );

    const { rows } = await query(
      `INSERT INTO steps (analysis_id, order_index, name, description, duration_days, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, countRows[0].next_order, name, description, duration, startDate || null, endDate || null]
    );
    res.status(201).json(serializeStep(rows[0]));
  })
);

router.patch(
  "/:id/steps/:stepId",
  asyncHandler(async (req, res) => {
    const { name, description, duration, startDate, endDate, status } = req.body;
    const STATUSES = ["À faire", "En cours", "Terminée", "En retard"];
    if (status && !STATUSES.includes(status)) throw new ApiError(400, "Statut invalide.");

    const { rows } = await query(
      `UPDATE steps SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         duration_days = COALESCE($3, duration_days),
         start_date = COALESCE($4, start_date),
         end_date = COALESCE($5, end_date),
         status = COALESCE($6, status)
       WHERE id = $7 AND analysis_id = $8
       RETURNING *`,
      [name ?? null, description ?? null, duration ?? null, startDate ?? null, endDate ?? null, status ?? null, req.params.stepId, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Étape introuvable.");

    if (status === "Terminée") {
      await query(
        `INSERT INTO logs (user_id, analysis_id, action, target, kind)
         VALUES ($1, $2, 'a terminé l''étape', $3, 'done')`,
        [req.user.id, req.params.id, rows[0].name]
      );
    }

    res.json(serializeStep(rows[0]));
  })
);

router.post(
  "/:id/steps/:stepId/validate",
  requireRole("Administrateur", "Superviseur"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE steps SET status = 'Terminée'
       WHERE id = $1 AND analysis_id = $2
       RETURNING *`,
      [req.params.stepId, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Étape introuvable.");

    await query(
      `INSERT INTO logs (user_id, analysis_id, action, target, kind)
       VALUES ($1, $2, 'a validé l''étape', $3, 'validate')`,
      [req.user.id, req.params.id, rows[0].name]
    );

    res.json(serializeStep(rows[0]));
  })
);

router.delete(
  "/:id/steps/:stepId",
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(
      "DELETE FROM steps WHERE id = $1 AND analysis_id = $2",
      [req.params.stepId, req.params.id]
    );
    if (!rowCount) throw new ApiError(404, "Étape introuvable.");
    res.status(204).end();
  })
);

module.exports = router;
