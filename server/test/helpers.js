import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { runMigrations } from '../db/migrations.js';
import { createOrganization } from '../services/organizations.js';

// Guard: resetDb() deletes everything, so never let it near a real database.
if (!process.env.DATABASE_URL?.endsWith('_test')) {
  throw new Error(`Refusing to run tests against ${process.env.DATABASE_URL}; it must end in _test`);
}

// Wipes the test database and rebuilds it from the migrations,
// so every test file starts from the same empty state.
export async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
}

export async function createOrg(name = 'Test Agency') {
  return createOrganization({ name });
}

let userCount = 0;

export async function createUser({
  organizationId,
  email = `user${++userCount}@example.com`,
  password = 'password123',
  fullName = 'Test Employee',
  role = 'employee',
  status = 'active',
} = {}) {
  if (!organizationId) throw new Error('createUser needs an organizationId');

  // Cost 4 instead of 12 keeps tests fast; strength doesn't matter here.
  const passwordHash = password ? await bcrypt.hash(password, 4) : null;
  const { rows } = await pool.query(
    `INSERT INTO users (organization_id, email, full_name, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, organization_id`,
    [organizationId, email, fullName, passwordHash, role, status],
  );
  return { ...rows[0], password };
}

export async function closeDb() {
  await pool.end();
}
