require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { initialsFromName } = require("../utils/initials");

const DEFAULT_PASSWORD = "password123";

const MONTHS_FR = {
  janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
};

function frDateToISO(text) {
  const [day, month] = text.trim().split(" ");
  const mm = String(MONTHS_FR[month.toLowerCase()]).padStart(2, "0");
  return `2026-${mm}-${day.padStart(2, "0")}`;
}

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000);
}

const USERS = [
  { name: "Adjo Mensah", email: "adjo.mensah@pursflow.tg", role: "Administrateur", active: true },
  { name: "Kodjo Amegan", email: "kodjo.amegan@pursflow.tg", role: "Superviseur", active: true },
  { name: "Afi Sodji", email: "afi.sodji@pursflow.tg", role: "Analyste", active: true },
  { name: "Yao Lawson", email: "yao.lawson@pursflow.tg", role: "Analyste", active: false },
  { name: "Esi Kpodzro", email: "esi.kpodzro@pursflow.tg", role: "Superviseur", active: true },
  { name: "Komi Dossou", email: "komi.dossou@pursflow.tg", role: "Analyste", active: true },
];

const ANALYSES = [
  {
    title: "Analyse de conformité - dossier Savanes",
    description: "Vérification réglementaire complète du dossier d'implantation des centres d'état civil dans la région des Savanes.",
    priority: "Élevé",
    ownerIdx: 2,
    supervisorIdx: 1,
    startDate: "2026-06-18",
    steps: [
      { name: "Collecte des pièces", description: "Réunir les documents sources et justificatifs.", duration: 2, start: "18 juin", end: "20 juin", status: "Terminée" },
      { name: "Contrôle réglementaire", description: "Confronter les pièces au cadre légal en vigueur.", duration: 3, start: "20 juin", end: "23 juin", status: "Terminée" },
      { name: "Analyse des écarts", description: "Identifier les non-conformités et les classer.", duration: 2, start: "23 juin", end: "25 juin", status: "En cours" },
      { name: "Rédaction du rapport", description: "Produire le rapport d'analyse structuré.", duration: 2, start: "25 juin", end: "27 juin", status: "À faire" },
      { name: "Validation superviseur", description: "Revue et validation finale.", duration: 1, start: "27 juin", end: "28 juin", status: "À faire" },
    ],
  },
  {
    title: "Audit qualité - laboratoire central",
    description: "Audit des procédures d'analyse en laboratoire avec contrôle des délais de traitement par échantillon.",
    priority: "Élevé",
    ownerIdx: 5,
    supervisorIdx: 4,
    startDate: "2026-06-15",
    steps: [
      { name: "Cadrage de l'audit", description: "Définir le périmètre et les critères.", duration: 1, start: "15 juin", end: "16 juin", status: "Terminée" },
      { name: "Prélèvement des données", description: "Extraire les journaux d'analyse.", duration: 2, start: "16 juin", end: "18 juin", status: "Terminée" },
      { name: "Mesure des délais", description: "Calculer les temps de traitement réels.", duration: 3, start: "18 juin", end: "21 juin", status: "En retard" },
      { name: "Synthèse des constats", description: "Consolider les observations.", duration: 2, start: "21 juin", end: "23 juin", status: "À faire" },
    ],
  },
  {
    title: "Étude de résilience - communautés Kara",
    description: "Analyse multi-étapes de la résilience des communautés ciblées avec indicateurs de suivi terrain.",
    priority: "Moyen",
    ownerIdx: 3,
    supervisorIdx: 1,
    startDate: "2026-06-10",
    steps: [
      { name: "Définition des indicateurs", description: "Établir la grille d'indicateurs.", duration: 2, start: "10 juin", end: "12 juin", status: "Terminée" },
      { name: "Enquête terrain", description: "Collecter les données sur le terrain.", duration: 4, start: "12 juin", end: "16 juin", status: "Terminée" },
      { name: "Traitement statistique", description: "Analyser les données collectées.", duration: 3, start: "16 juin", end: "19 juin", status: "Terminée" },
      { name: "Rapport final", description: "Livrer le rapport validé.", duration: 2, start: "19 juin", end: "21 juin", status: "Terminée" },
    ],
  },
  {
    title: "Vérification des proformas fournisseurs",
    description: "Contrôle croisé des devis fournisseurs avec relances automatiques pour les pièces manquantes.",
    priority: "Faible",
    ownerIdx: 2,
    supervisorIdx: 4,
    startDate: "2026-06-08",
    steps: [
      { name: "Réception des proformas", description: "Centraliser les devis reçus.", duration: 1, start: "08 juin", end: "09 juin", status: "Terminée" },
      { name: "Contrôle des montants", description: "Vérifier la cohérence des prix.", duration: 2, start: "09 juin", end: "11 juin", status: "En cours" },
      { name: "Validation budgétaire", description: "Confronter au budget alloué.", duration: 2, start: "11 juin", end: "13 juin", status: "À faire" },
      { name: "Décision finale", description: "Arbitrer et notifier.", duration: 1, start: "13 juin", end: "14 juin", status: "À faire" },
    ],
  },
  {
    title: "Analyse des risques - déploiement plateforme",
    description: "Identification et hiérarchisation des risques techniques avant la mise en production.",
    priority: "Élevé",
    ownerIdx: 5,
    supervisorIdx: 1,
    startDate: "2026-06-20",
    steps: [
      { name: "Inventaire des risques", description: "Lister les risques potentiels.", duration: 2, start: "20 juin", end: "22 juin", status: "Terminée" },
      { name: "Évaluation d'impact", description: "Coter probabilité et gravité.", duration: 2, start: "22 juin", end: "24 juin", status: "Terminée" },
      { name: "Plan de mitigation", description: "Définir les mesures correctives.", duration: 2, start: "24 juin", end: "26 juin", status: "En cours" },
      { name: "Validation comité", description: "Présenter au comité technique.", duration: 1, start: "26 juin", end: "27 juin", status: "À faire" },
    ],
  },
  {
    title: "Contrôle des temps de saisie - time-sheet",
    description: "Analyse des écarts entre temps déclarés et temps réels sur le système de feuilles de temps.",
    priority: "Moyen",
    ownerIdx: 3,
    supervisorIdx: 4,
    startDate: "2026-06-05",
    steps: [
      { name: "Extraction des feuilles", description: "Récupérer les saisies du mois.", duration: 1, start: "05 juin", end: "06 juin", status: "Terminée" },
      { name: "Détection des anomalies", description: "Repérer les écarts suspects.", duration: 3, start: "06 juin", end: "09 juin", status: "Terminée" },
      { name: "Entretiens de clarification", description: "Recueillir les justifications.", duration: 2, start: "09 juin", end: "11 juin", status: "En retard" },
      { name: "Rapport de synthèse", description: "Documenter les conclusions.", duration: 2, start: "11 juin", end: "13 juin", status: "À faire" },
    ],
  },
];

const REMINDERS = [
  { analysisIdx: 0, stepName: "Analyse des écarts", type: "Avant échéance", channel: "Email", level: "amber", scheduledAt: hoursAgo(-12) },
  { analysisIdx: 1, stepName: "Mesure des délais", type: "Retard", channel: "Email + SMS", level: "red", scheduledAt: hoursAgo(48) },
  { analysisIdx: 4, stepName: "Plan de mitigation", type: "Avant échéance", channel: "Push", level: "amber", scheduledAt: hoursAgo(-1) },
  { analysisIdx: 5, stepName: "Entretiens de clarification", type: "Retard", channel: "Interne", level: "red", scheduledAt: hoursAgo(24) },
  { analysisIdx: 3, stepName: "Contrôle des montants", type: "Validation", channel: "Interne", level: "blue", scheduledAt: null },
  { analysisIdx: 0, stepName: "Validation superviseur", type: "À la date limite", channel: "Email", level: "blue", scheduledAt: hoursAgo(-21) },
];

const LOGS = [
  { analysisIdx: 0, userIdx: 2, action: "a terminé l'étape", target: "Contrôle réglementaire", kind: "done", at: hoursAgo(0.3) },
  { analysisIdx: 2, userIdx: 1, action: "a validé l'analyse", target: "Étude de résilience", kind: "validate", at: hoursAgo(0.7) },
  { analysisIdx: 1, userIdx: null, action: "Rappel automatique envoyé", target: "Mesure des délais", kind: "reminder", at: hoursAgo(1) },
  { analysisIdx: 4, userIdx: 5, action: "a démarré l'étape", target: "Plan de mitigation", kind: "start", at: hoursAgo(2) },
  { analysisIdx: 5, userIdx: 3, action: "a créé l'analyse", target: "Contrôle des temps de saisie", kind: "create", at: hoursAgo(3) },
  { analysisIdx: 5, userIdx: null, action: "Étape passée en retard", target: "Entretiens de clarification", kind: "late", at: hoursAgo(5) },
  { analysisIdx: 4, userIdx: 5, action: "a modifié les délais", target: "Évaluation d'impact", kind: "edit", at: hoursAgo(6) },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("TRUNCATE logs, reminders, steps, analyses, users CASCADE");
    await client.query("ALTER SEQUENCE analysis_code_seq RESTART WITH 2001");

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const userIds = [];
    for (const u of USERS) {
      const { rows } = await client.query(
        `INSERT INTO users (name, initials, email, password_hash, role, active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [u.name, initialsFromName(u.name), u.email, passwordHash, u.role, u.active]
      );
      userIds.push(rows[0].id);
    }

    const analysisIds = [];
    const stepIdsByAnalysis = [];
    for (const a of ANALYSES) {
      const { rows } = await client.query(
        `INSERT INTO analyses (title, description, priority, owner_id, supervisor_id, start_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [a.title, a.description, a.priority, userIds[a.ownerIdx], userIds[a.supervisorIdx], a.startDate]
      );
      const analysisId = rows[0].id;
      analysisIds.push(analysisId);

      const stepIds = {};
      for (let i = 0; i < a.steps.length; i++) {
        const s = a.steps[i];
        const { rows: stepRows } = await client.query(
          `INSERT INTO steps (analysis_id, order_index, name, description, duration_days, start_date, end_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [analysisId, i + 1, s.name, s.description, s.duration, frDateToISO(s.start), frDateToISO(s.end), s.status]
        );
        stepIds[s.name] = stepRows[0].id;
      }
      stepIdsByAnalysis.push(stepIds);
    }

    for (const r of REMINDERS) {
      const analysisId = analysisIds[r.analysisIdx];
      const stepId = stepIdsByAnalysis[r.analysisIdx][r.stepName] || null;
      await client.query(
        `INSERT INTO reminders (analysis_id, step_id, type, channel, level, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [analysisId, stepId, r.type, r.channel, r.level, r.scheduledAt]
      );
    }

    for (const l of LOGS) {
      const analysisId = analysisIds[l.analysisIdx];
      const userId = l.userIdx === null ? null : userIds[l.userIdx];
      await client.query(
        `INSERT INTO logs (user_id, analysis_id, action, target, kind, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, analysisId, l.action, l.target, l.kind, l.at]
      );
    }

    await client.query("COMMIT");
    console.log(`Seed terminé : ${USERS.length} utilisateurs, ${ANALYSES.length} analyses.`);
    console.log(`Mot de passe par défaut pour tous les comptes : ${DEFAULT_PASSWORD}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Échec du seed :", err.message);
  process.exit(1);
});
