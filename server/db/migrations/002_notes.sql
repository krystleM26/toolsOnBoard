-- Notes that staff write about a person ("Called about TB test, booked Friday").
CREATE TABLE notes (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  -- The person the note is about.
  user_id         INTEGER NOT NULL,
  author_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body            TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, organization_id) REFERENCES users (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX notes_user_idx ON notes (user_id, created_at DESC);
