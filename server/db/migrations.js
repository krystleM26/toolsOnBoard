// Applies the numbered .sql files in db/migrations/ in order, each exactly once.
//
// To change the database, never edit a migration that has already run.
// Add a new file with the next number instead, e.g. 002_add_notes.sql.
import { readdir, readFile } from 'node:fs/promises';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

export async function runMigrations(pool, { log = () => {} } = {}) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
    const client = await pool.connect();
    try {
      // All or nothing: if any statement fails, none of the file is applied.
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`Applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
}
