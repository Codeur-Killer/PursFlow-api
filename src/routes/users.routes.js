const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { initialsFromName } = require("../utils/initials");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const ROLES = ["Administrateur", "Superviseur", "Analyste"];

function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    email: row.email,
    role: row.role,
    active: row.active,
    lastSeen: row.last_seen_at,
    analyses: Number(row.analyses_count ?? 0),
  };
}

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT u.*, COUNT(a.id) AS analyses_count
      FROM users u
      LEFT JOIN analyses a ON a.owner_id = u.id
      GROUP BY u.id
      ORDER BY u.name
    `);
    res.json(rows.map(serializeUser));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT u.*, COUNT(a.id) AS analyses_count
       FROM users u
       LEFT JOIN analyses a ON a.owner_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Utilisateur introuvable.");
    res.json(serializeUser(rows[0]));
  })
);

router.post(
  "/",
  requireRole("Administrateur"),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      throw new ApiError(400, "Nom, email et mot de passe sont requis.");
    }
    const finalRole = ROLES.includes(role) ? role : "Analyste";
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, initials, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, initialsFromName(name), email.toLowerCase(), passwordHash, finalRole]
    );
    res.status(201).json(serializeUser(rows[0]));
  })
);

router.patch(
  "/:id",
  requireRole("Administrateur"),
  asyncHandler(async (req, res) => {
    const { name, email, role, active, password } = req.body;
    if (role && !ROLES.includes(role)) throw new ApiError(400, "Rôle invalide.");
    if (password && password.length < 8) throw new ApiError(400, "Le mot de passe doit contenir au moins 8 caractères.");

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const { rows } = await query(
      `UPDATE users SET
         name = COALESCE($1, name),
         initials = CASE WHEN $1 IS NOT NULL THEN $2 ELSE initials END,
         email = COALESCE($3, email),
         role = COALESCE($4, role),
         active = COALESCE($5, active),
         password_hash = COALESCE($6, password_hash)
       WHERE id = $7
       RETURNING *`,
      [
        name ?? null,
        name ? initialsFromName(name) : null,
        email ? email.toLowerCase() : null,
        role ?? null,
        active ?? null,
        passwordHash,
        req.params.id,
      ]
    );
    if (!rows[0]) throw new ApiError(404, "Utilisateur introuvable.");
    res.json(serializeUser(rows[0]));
  })
);

router.delete(
  "/:id",
  requireRole("Administrateur"),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query("DELETE FROM users WHERE id = $1", [req.params.id]);
    if (!rowCount) throw new ApiError(404, "Utilisateur introuvable.");
    res.status(204).end();
  })
);

module.exports = router;
