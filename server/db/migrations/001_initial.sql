-- Initial schema. Every table belongs to an organization (agency), and
-- references between tables include organization_id so the database itself
-- refuses to link one agency's data to another's.

CREATE TABLE organizations (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  -- The matching organization in Clock Earnings, once connected.
  clock_earnings_org_id TEXT UNIQUE,
  -- Warn about documents this many days before they expire.
  expiry_warning_days   INTEGER NOT NULL DEFAULT 30 CHECK (expiry_warning_days > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                     SERIAL PRIMARY KEY,
  organization_id        INTEGER NOT NULL REFERENCES organizations(id),
  -- Email and password are optional: people who come from Clock Earnings
  -- may have neither and sign in through a signed link instead.
  -- (UNIQUE still allows many NULLs.)
  email                  TEXT UNIQUE,
  password_hash          TEXT,
  full_name              TEXT NOT NULL,
  role                   TEXT NOT NULL DEFAULT 'employee'
                         CHECK (role IN ('admin', 'manager', 'supervisor', 'employee')),
  -- onboarding = still finishing paperwork, active = working, archived = left.
  status                 TEXT NOT NULL DEFAULT 'onboarding'
                         CHECK (status IN ('onboarding', 'active', 'archived')),
  phone                  TEXT,
  start_date             DATE,
  clock_earnings_user_id TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, clock_earnings_user_id),
  -- Lets other tables point at (user, organization) together.
  UNIQUE (id, organization_id)
);

CREATE INDEX users_org_status_idx ON users (organization_id, status);

-- Who supervises whom. A person can have more than one supervisor.
CREATE TABLE user_supervisors (
  organization_id INTEGER NOT NULL,
  employee_id     INTEGER NOT NULL,
  supervisor_id   INTEGER NOT NULL,
  PRIMARY KEY (employee_id, supervisor_id),
  CHECK (employee_id <> supervisor_id),
  FOREIGN KEY (employee_id, organization_id) REFERENCES users (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (supervisor_id, organization_id) REFERENCES users (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX user_supervisors_supervisor_idx ON user_supervisors (supervisor_id);

-- Kinds of documents an agency requires (CPR, driver's license, TB, ...).
CREATE TABLE credential_types (
  id               SERIAL PRIMARY KEY,
  organization_id  INTEGER NOT NULL REFERENCES organizations(id),
  name             TEXT NOT NULL,
  description      TEXT,
  -- If set, expiry = issue date + this many months (e.g. a TB test valid
  -- 24 months at one agency, 48 at another). If NULL, the expiry date
  -- printed on the document is entered directly (e.g. a driver's license).
  valid_for_months INTEGER CHECK (valid_for_months > 0),
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id)
);

-- One row per employee per document type.
CREATE TABLE credentials (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  type_id         INTEGER NOT NULL,
  issued_on       DATE,
  expires_on      DATE NOT NULL,
  file_path       TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type_id),
  FOREIGN KEY (user_id, organization_id) REFERENCES users (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (type_id, organization_id) REFERENCES credential_types (id, organization_id)
);

-- Finds expiring documents across an agency quickly.
CREATE INDEX credentials_org_expires_idx ON credentials (organization_id, expires_on);

-- The onboarding checklist for an agency.
CREATE TABLE checklist_tasks (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  title           TEXT NOT NULL,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (id, organization_id)
);

-- Which employee has finished which task. No row = not done yet.
CREATE TABLE task_completions (
  organization_id INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  task_id         INTEGER NOT NULL,
  -- Who ticked it: the employee, or an admin on their behalf.
  completed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id),
  FOREIGN KEY (user_id, organization_id) REFERENCES users (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id, organization_id) REFERENCES checklist_tasks (id, organization_id) ON DELETE CASCADE
);

-- Change history: who did what, when, with before/after values.
-- Rows are only ever added, never edited.
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  -- NULL when the change came from the system (e.g. a Clock Earnings sync).
  actor_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,          -- e.g. 'user.created', 'credential.updated'
  entity_type     TEXT NOT NULL,          -- e.g. 'user', 'credential'
  entity_id       INTEGER,
  changes         JSONB,                  -- e.g. {"status": {"from": "onboarding", "to": "active"}}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_entity_idx ON audit_log (organization_id, entity_type, entity_id, created_at DESC);
