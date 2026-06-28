const { ApiError } = require("../utils/ApiError");

function notFound(req, res) {
  res.status(404).json({ error: "Route introuvable." });
}

function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.code === "23505") {
    return res.status(409).json({ error: "Cette ressource existe déjà." });
  }
  if (err.code === "23503") {
    return res.status(409).json({ error: "Référence invalide (clé étrangère)." });
  }
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur." });
}

module.exports = { notFound, errorHandler };
