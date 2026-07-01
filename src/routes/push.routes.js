const express = require("express");
const { query } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
});

router.use(requireAuth);

router.post(
  "/subscribe",
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new ApiError(400, "Abonnement push invalide.");
    }

    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    res.status(201).json({ ok: true });
  })
);

router.delete(
  "/subscribe",
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) throw new ApiError(400, "Endpoint requis.");
    await query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [endpoint, req.user.id]);
    res.status(204).end();
  })
);

module.exports = router;
