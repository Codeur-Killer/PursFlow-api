const express = require("express");
const { query } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const WEEKDAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const { rows: activeRows } = await query(`
      SELECT COUNT(*) AS active FROM (
        SELECT a.id
        FROM analyses a
        LEFT JOIN steps st ON st.analysis_id = a.id
        GROUP BY a.id
        HAVING COUNT(st.id) = 0 OR COUNT(st.id) FILTER (WHERE st.status = 'Terminée') < COUNT(st.id)
      ) sub
    `);

    const { rows: stepRows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Terminée') AS done,
        COUNT(*) FILTER (WHERE status = 'En retard') AS late
      FROM steps
    `);

    const { rows: durationRows } = await query(`
      SELECT AVG(total) AS avg_duration FROM (
        SELECT analysis_id, SUM(duration_days) AS total FROM steps GROUP BY analysis_id
      ) sub
    `);

    const done = Number(stepRows[0].done);
    const late = Number(stepRows[0].late);
    const onTime = done + late === 0 ? 100 : Math.round((100 * done) / (done + late));
    const avgDuration = Number(durationRows[0].avg_duration) || 0;

    res.json({
      active: Number(activeRows[0].active),
      onTime,
      late,
      avgTime: `${avgDuration.toFixed(1).replace(".", ",")} j`,
    });
  })
);

router.get(
  "/weekly-completion",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT date_trunc('day', created_at) AS day, kind, COUNT(*) AS count
      FROM logs
      WHERE created_at >= now() - interval '7 days' AND kind IN ('done', 'late')
      GROUP BY 1, 2
    `);

    const byDate = new Map();
    for (const row of rows) {
      const key = row.day.toISOString().slice(0, 10);
      const entry = byDate.get(key) || { terminees: 0, retards: 0 };
      if (row.kind === "done") entry.terminees = Number(row.count);
      if (row.kind === "late") entry.retards = Number(row.count);
      byDate.set(key, entry);
    }

    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = byDate.get(key) || { terminees: 0, retards: 0 };
      result.push({ day: WEEKDAYS_FR[d.getDay()], ...entry });
    }

    res.json(result);
  })
);

module.exports = router;
