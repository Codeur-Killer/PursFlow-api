const express = require("express");
const { query } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function serialize(row) {
  return {
    id: row.id,
    user: row.user_id ? { id: row.user_id, name: row.user_name, initials: row.user_initials } : null,
    action: row.action,
    target: row.target,
    analysis: row.analysis_id,
    kind: row.kind,
    time: row.created_at,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { analysisId, limit = 50 } = req.query;
    const conditions = [];
    const params = [];

    if (analysisId) {
      params.push(analysisId);
      conditions.push(`l.analysis_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(Math.min(Number(limit) || 50, 200));
    const { rows } = await query(
      `SELECT l.*, u.name AS user_name, u.initials AS user_initials
       FROM logs l
       LEFT JOIN users u ON u.id = l.user_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json(rows.map(serialize));
  })
);

module.exports = router;
