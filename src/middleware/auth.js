const jwt = require("jsonwebtoken");
const { ApiError } = require("../utils/ApiError");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, "Authentification requise."));

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new ApiError(401, "Jeton invalide ou expiré."));
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, "Accès refusé pour ce rôle."));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
