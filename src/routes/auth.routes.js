const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { query } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { initialsFromName } = require("../utils/initials");
const { requireAuth } = require("../middleware/auth");
const { authLimiter, accountLimiter } = require("../middleware/rateLimits");
const { sendPasswordResetEmail } = require("../mailer");

const router = express.Router();

const ROLES = ["Administrateur", "Superviseur", "Analyste"];
const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

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
  accountLimiter,
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
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

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
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new ApiError(400, "Email et mot de passe sont requis.");

    const { rows } = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const row = rows[0];
    if (!row) throw new ApiError(401, "Identifiants invalides.");

    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      throw new ApiError(423, "Compte temporairement verrouillé suite à plusieurs échecs. Réessayez dans quelques minutes.");
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      const attempts = row.failed_login_attempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await query(
          "UPDATE users SET failed_login_attempts = 0, locked_until = $1 WHERE id = $2",
          [new Date(Date.now() + LOCK_DURATION_MS), row.id]
        );
        throw new ApiError(423, "Compte temporairement verrouillé suite à plusieurs échecs. Réessayez dans quelques minutes.");
      }
      await query("UPDATE users SET failed_login_attempts = $1 WHERE id = $2", [attempts, row.id]);
      throw new ApiError(401, "Identifiants invalides.");
    }

    await query(
      "UPDATE users SET last_seen_at = now(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1",
      [row.id]
    );

    const user = serializeUser(row);
    res.json({ token: signToken(user), user });
  })
);

router.post(
  "/forgot-password",
  accountLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "Email requis.");

    const { rows } = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const row = rows[0];

    // Toujours la même réponse, que le compte existe ou non : on ne révèle jamais
    // si un email est enregistré (protection contre l'énumération de comptes).
    if (row) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      await query(
        "UPDATE users SET reset_token_hash = $1, reset_token_expires = $2 WHERE id = $3",
        [hashToken(rawToken), new Date(Date.now() + RESET_TOKEN_TTL_MS), row.id]
      );

      const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reinitialiser?token=${rawToken}`;
      try {
        await sendPasswordResetEmail({ to: row.email, name: row.name, resetUrl });
      } catch (err) {
        console.error("Échec d'envoi de l'email de réinitialisation :", err.message);
      }
    }

    res.json({ message: "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé." });
  })
);

router.post(
  "/reset-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) throw new ApiError(400, "Jeton et nouveau mot de passe requis.");
    if (password.length < 8) throw new ApiError(400, "Le mot de passe doit contenir au moins 8 caractères.");

    const { rows } = await query(
      "SELECT * FROM users WHERE reset_token_hash = $1 AND reset_token_expires > now()",
      [hashToken(token)]
    );
    const row = rows[0];
    if (!row) throw new ApiError(400, "Lien de réinitialisation invalide ou expiré.");

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await query(
      `UPDATE users SET
         password_hash = $1,
         reset_token_hash = NULL,
         reset_token_expires = NULL,
         failed_login_attempts = 0,
         locked_until = NULL
       WHERE id = $2`,
      [passwordHash, row.id]
    );

    res.json({ message: "Mot de passe réinitialisé avec succès." });
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
