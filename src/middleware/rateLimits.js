const rateLimit = require("express-rate-limit");

// Brute-force sur /login et /reset-password : peu de tentatives tolérées par IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans quelques minutes." },
});

// /register et /forgot-password : un peu plus permissif mais toujours borné.
const accountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez plus tard." },
});

// Garde-fou global anti-abus / DoS applicatif sur toute l'API.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes. Réessayez plus tard." },
});

module.exports = { authLimiter, accountLimiter, apiLimiter };
