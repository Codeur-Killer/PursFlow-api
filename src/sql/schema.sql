-- AnalyseFlow - schema PostgreSQL

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('Administrateur', 'Superviseur', 'Analyste');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE priority_level AS ENUM ('Faible', 'Moyen', 'Élevé');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE step_status AS ENUM ('À faire', 'En cours', 'Terminée', 'En retard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_type AS ENUM ('Avant échéance', 'À la date limite', 'Retard', 'Validation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_level AS ENUM ('amber', 'blue', 'red');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE log_kind AS ENUM ('done', 'validate', 'reminder', 'start', 'create', 'late', 'edit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'Analyste',
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS analysis_code_seq START 2001;

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY DEFAULT ('AF-' || nextval('analysis_code_seq')::text),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority priority_level NOT NULL DEFAULT 'Moyen',
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_days INT NOT NULL DEFAULT 1,
  start_date DATE,
  end_date DATE,
  status step_status NOT NULL DEFAULT 'À faire',
  UNIQUE (analysis_id, order_index)
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  step_id UUID REFERENCES steps(id) ON DELETE CASCADE,
  type reminder_type NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  scheduled_at TIMESTAMPTZ,
  channel TEXT NOT NULL DEFAULT 'Interne',
  level reminder_level NOT NULL DEFAULT 'blue',
  resolved BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reminders ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;

-- Sécurité du compte : verrouillage anti brute-force + réinitialisation de mot de passe.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  analysis_id TEXT REFERENCES analyses(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  kind log_kind NOT NULL DEFAULT 'edit',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steps_analysis ON steps (analysis_id);
CREATE INDEX IF NOT EXISTS idx_reminders_analysis ON reminders (analysis_id);
CREATE INDEX IF NOT EXISTS idx_reminders_level ON reminders (level);
CREATE INDEX IF NOT EXISTS idx_logs_analysis ON logs (analysis_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_owner ON analyses (owner_id);
CREATE INDEX IF NOT EXISTS idx_analyses_supervisor ON analyses (supervisor_id);
