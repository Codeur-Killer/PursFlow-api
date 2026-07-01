require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const analysesRoutes = require("./routes/analyses.routes");
const remindersRoutes = require("./routes/reminders.routes");
const logsRoutes = require("./routes/logs.routes");
const statsRoutes = require("./routes/stats.routes");
const pushRoutes = require("./routes/push.routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { startReminderScheduler } = require("./scheduler");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

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
