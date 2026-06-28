# PursFlow API

API REST (Express + PostgreSQL) pour PursFlow.

## Installation

```bash
cd api
npm install
cp .env.example .env   # puis renseigner DATABASE_URL et JWT_SECRET
npm run migrate         # crée les tables
npm run dev               # démarre sur http://localhost:4000
```

Aucune donnée de démo n'est créée automatiquement. Le premier compte créé via
`POST /api/auth/register` (ou le formulaire d'inscription du frontend) devient
automatiquement Administrateur. Les comptes suivants sont des Analystes par
défaut.

Un script de seed optionnel (`npm run seed`) reste disponible dans
`src/scripts/seed.js` si tu veux repartir avec des données de démonstration —
il efface toutes les données existantes.

## Variables d'environnement (`.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (Neon) |
| `JWT_SECRET` | Secret de signature des jetons |
| `JWT_EXPIRES_IN` | Durée de validité du jeton (ex. `7d`) |
| `PORT` | Port d'écoute de l'API |
| `CORS_ORIGIN` | Origine autorisée pour le frontend |
| `EMAIL_USER` / `EMAIL_PASS` | Compte Gmail + mot de passe d'application utilisés pour l'envoi des alertes |
| `EMAIL_FROM` | Adresse affichée comme expéditeur |
| `REMINDER_SWEEP_INTERVAL_MS` | Fréquence du balayage des rappels à envoyer par email (def. 60000) |

## Alertes par email

Un scheduler interne (`src/scheduler.js`) vérifie périodiquement les rappels
dont le canal contient « Email », non résolus et non encore envoyés
(`sent_at IS NULL`), et dont la date programmée est passée ou absente. Il
envoie alors un email via Gmail (SMTP, `nodemailer`) au responsable de
l'analyse (ou au superviseur pour les rappels de type « Validation »).

- `POST /api/reminders/:id/send` envoie immédiatement un rappel donné
  (utile pour tester ou relancer manuellement).

## Authentification

Toutes les routes sauf `/api/health`, `/api/auth/register` et `/api/auth/login`
exigent un en-tête `Authorization: Bearer <token>` obtenu via login.

- `POST /api/auth/register` `{ name, email, password, role? }`
- `POST /api/auth/login` `{ email, password }`
- `GET /api/auth/me`

## Utilisateurs

- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users` (Administrateur)
- `PATCH /api/users/:id` (Administrateur)
- `DELETE /api/users/:id` (Administrateur)

## Analyses

- `GET /api/analyses?search=&status=Toutes|En cours|Terminées|En retard&priority=Toutes|Faible|Moyen|Élevé`
- `GET /api/analyses/:id` (détail avec étapes et rappels)
- `POST /api/analyses` `{ title, description, priority, ownerId, supervisorId?, startDate?, steps:[{name,duration}], reminders:{triggers:[],channels:[]} }`
- `PATCH /api/analyses/:id`
- `DELETE /api/analyses/:id` (Administrateur, Superviseur)
- `POST /api/analyses/:id/steps` `{ name, description?, duration?, startDate?, endDate? }`
- `PATCH /api/analyses/:id/steps/:stepId` `{ name?, description?, duration?, startDate?, endDate?, status? }`
- `POST /api/analyses/:id/steps/:stepId/validate` (Administrateur, Superviseur)
- `DELETE /api/analyses/:id/steps/:stepId`

Les étapes non terminées dont la date de fin est dépassée basculent
automatiquement au statut « En retard » à chaque lecture des analyses.

## Rappels

- `GET /api/reminders?level=amber|blue|red&analysisId=&resolved=true|false`
- `POST /api/reminders`
- `PATCH /api/reminders/:id` `{ resolved }`
- `DELETE /api/reminders/:id`

## Historique

- `GET /api/logs?analysisId=&limit=`

## Statistiques

- `GET /api/stats/overview` → `{ active, onTime, late, avgTime }`
- `GET /api/stats/weekly-completion` → 7 derniers jours `{ day, terminees, retards }`
