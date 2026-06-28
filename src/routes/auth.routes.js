const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { initialsFromName } = require("../utils/initials");
const { requireAuth } = require("../middleware/auth");

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
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      throw new ApiError(400, "Nom, email et mot de passe sont requis.");
    }
    if (password.length < 8) {
      throw new ApiError(400, "Le mot de passe doit contenir au moins 8 caractères.");
    }
    const { rows: countRows } = await query("SELECT COUNT(*) AS count FROM users");
    const isFirstUser = Number(countRows[0].count) === 0;
    const finalRole = isFirstUser ? "Administrateur" : ROLES.includes(role) ? role : "Analyste";
    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await query(
      `INSERT INTO users (name, initials, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, initialsFromName(name), email.toLowerCase(), passwordHash, finalRole]
    );

    const user = serializeUser(rows[0]);
    res.status(201).json({ token: signToken(user), user });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new ApiError(400, "Email et mot de passe sont requis.");

    const { rows } = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const row = rows[0];
    if (!row) throw new ApiError(401, "Identifiants invalides.");

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new ApiError(401, "Identifiants invalides.");

    await query("UPDATE users SET last_seen_at = now() WHERE id = $1", [row.id]);

    const user = serializeUser(row);
    res.json({ token: signToken(user), user });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (!rows[0]) throw new ApiError(404, "Utilisateur introuvable.");
    res.json(serializeUser(rows[0]));
  })
);

module.exports = router;
