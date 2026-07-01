require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const analysesRoutes = require("./routes/analyses.routes");
const remindersRoutes = require("./routes/reminders.routes");
const logsRoutes = require("./routes/logs.routes");
const statsRoutes = require("./routes/stats.routes");
const pushRoutes = require("./routes/push.routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimits");
const { startReminderScheduler } = require("./scheduler");

const app = express();

// Render (et la plupart des PaaS) placent l'app derrière un reverse proxy : sans
// ça, req.ip vaudrait toujours l'IP du proxy et le rate limiting toucherait tout
// le monde d'un coup au lieu de cibler l'IP réelle de l'appelant.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "100kb" }));
app.use("/api", apiLimiter);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/analyses", analysesRoutes);
app.use("/api/reminders", remindersRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/push", pushRoutes);

app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API PursFlow à l'écoute sur le port ${port}`);
  startReminderScheduler();
});
