-- Onboarding tool schema.
-- Safe to re-run: every table is only created if it doesn't exist yet.

-- Everyone who can log in: admins (HR/managers) and employees being onboarded.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  phone         TEXT,
  start_date    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kinds of documents an employee must keep current (CPR, driver's license, ...).
CREATE TABLE IF NOT EXISTS credential_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

-- One row per employee per document type, with when it expires.
-- When a document is renewed, the row is updated rather than a new one added.
CREATE TABLE IF NOT EXISTS credentials (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_id     INTEGER NOT NULL REFERENCES credential_types(id),
  expires_on  DATE NOT NULL,
  file_path   TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type_id)
);

-- The onboarding checklist every new employee works through.
CREATE TABLE IF NOT EXISTS checklist_tasks (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Which employee has finished which task. No row = not done yet.
CREATE TABLE IF NOT EXISTS task_completions (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      INTEGER NOT NULL REFERENCES checklist_tasks(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);
