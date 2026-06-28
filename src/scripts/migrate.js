require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Migration appliquée avec succès.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Échec de la migration :", err.message);
  process.exit(1);
});
