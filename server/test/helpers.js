import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import pool from '../db.js';

// Guard: resetDb() deletes everything, so never let it near a real database.
if (!process.env.DATABASE_URL?.endsWith('_test')) {
  throw new Error(`Refusing to run tests against ${process.env.DATABASE_URL}; it must end in _test`);
}

// Creates the tables if needed, empties them, and reloads the seed data,
// so every test file starts from the same known state.
export async function resetDb() {
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const seed = await readFile(new URL('../db/seed.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  await pool.query(`
    TRUNCATE users, credential_types, credentials, checklist_tasks, task_completions
    RESTART IDENTITY CASCADE
  `);
  await pool.query(seed);
}

export async function createUser({
  email = 'employee@example.com',
  password = 'password123',
  fullName = 'Test Employee',
  role = 'employee',
} = {}) {
  // Cost 4 instead of 12 keeps tests fast; strength doesn't matter here.
  const passwordHash = await bcrypt.hash(password, 4);
  const { rows } = await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role)
     VALUES ($1, $2, $3, $4) RETURNING id, email, role`,
    [email, fullName, passwordHash, role],
  );
  return { ...rows[0], password };
}

export async function closeDb() {
  await pool.end();
}
