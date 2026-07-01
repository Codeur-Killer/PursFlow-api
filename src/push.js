const webpush = require("web-push");
const { query } = require("./db");

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:notifications@pursflow.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPushToUser(userId, payload) {
  if (!userId) return;
  const { rows } = await query("SELECT * FROM push_subscriptions WHERE user_id = $1", [userId]);

  await Promise.all(
    rows.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
        } else {
          console.error(`Échec d'envoi push pour l'utilisateur ${userId} :`, err.message);
        }
      }
    })
  );
}

module.exports = { sendPushToUser };
