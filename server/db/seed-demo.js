// Adds demo people for trying the app locally. Run with: npm run db:demo
// Safe to run again: existing demo people, documents and tasks are left as
// they are. Every demo account uses the password below.
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { createOrganization } from '../services/organizations.js';

export const DEMO_PASSWORD = 'demo-pass-123';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to add demo accounts to a production database.');
  process.exit(1);
}

const CPR = 'CPR Certification';
const LICENSE = "Driver's License";
const TB = 'TB Test';
const INSURANCE = 'Car Insurance';

// docs: document type -> days until it expires (negative = already expired).
// A type left out is missing. start: days from today (negative = already started).
const ALL_CURRENT = { [CPR]: 400, [LICENSE]: 900, [TB]: 300, [INSURANCE]: 180 };

const WORLD_OF_HOPE_PEOPLE = [
  // People who can sign in (they have an email and password).
  { email: 'manager@demo.test', name: 'Morgan Manager', role: 'manager', status: 'active', tasks: 5, docs: ALL_CURRENT },
  { email: 'supervisor@demo.test', name: 'Sky Supervisor', role: 'supervisor', status: 'active', tasks: 5, docs: ALL_CURRENT },
  { email: 'new-hire@demo.test', name: 'Nia Newhire', role: 'employee', status: 'onboarding', start: -3, tasks: 2, docs: { [LICENSE]: 700 } },
  { email: 'caregiver@demo.test', name: 'Cam Caregiver', role: 'employee', status: 'active', tasks: 5, docs: { ...ALL_CURRENT, [CPR]: -12 } },
  { email: 'former@demo.test', name: 'Fay Former', role: 'employee', status: 'archived', tasks: 5, docs: ALL_CURRENT },

  // Onboarding
  { name: 'Omar Ortiz', status: 'onboarding', start: 7, tasks: 1, docs: { [CPR]: 500, [LICENSE]: 1000 }, team: true },
  { name: 'Priya Patel', status: 'onboarding', start: 14, tasks: 4, docs: ALL_CURRENT },
  { name: 'Leo Brooks', status: 'onboarding', start: -10, tasks: 3, docs: { [CPR]: 300, [LICENSE]: 600, [INSURANCE]: 90 }, team: true },
  { name: 'Grace Kim', status: 'onboarding', tasks: 0, docs: {} },

  // Active staff
  { name: 'Dana Reyes', status: 'active', start: -400, tasks: 5, docs: { ...ALL_CURRENT, [TB]: 9 }, team: true },
  { name: 'Eli Turner', status: 'active', start: -800, tasks: 5, docs: { ...ALL_CURRENT, [INSURANCE]: -3, [LICENSE]: 20 } },
  { name: 'Fatima Noor', status: 'active', start: -200, tasks: 5, docs: { ...ALL_CURRENT, [INSURANCE]: 25 } },
  { name: 'Ben Carter', status: 'active', start: -150, tasks: 5, docs: { [CPR]: 300, [LICENSE]: 500, [INSURANCE]: 200 }, team: true },
  { name: 'Hana Ito', status: 'active', start: -1000, tasks: 5, docs: ALL_CURRENT, team: true },
  { name: 'Ivan Petrov', status: 'active', start: -60, tasks: 5, docs: ALL_CURRENT },
  { name: 'Julia Santos', status: 'active', start: -365, tasks: 5, docs: { ...ALL_CURRENT, [CPR]: -40, [TB]: -5 } },
];

async function findOrCreateOrg(name) {
  const { rows } = await pool.query('SELECT id FROM organizations WHERE name = $1', [name]);
  return rows[0]?.id ?? (await createOrganization({ name })).id;
}

const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

// Finds the person (by email, or by name for people without one) or adds them,
// then fills in any of their demo documents and tasks that aren't there yet.
async function addPerson(organizationId, p) {
  const existing = p.email
    ? await pool.query('SELECT id FROM users WHERE email = $1', [p.email])
    : await pool.query('SELECT id FROM users WHERE organization_id = $1 AND full_name = $2', [organizationId, p.name]);
  const id = existing.rows[0]?.id ?? (await insertPerson(organizationId, p));
  if (existing.rows[0]) {
    console.log(`  ${p.name} already exists`);
    await pool.query(
      'UPDATE users SET start_date = CURRENT_DATE + $2::int WHERE id = $1 AND start_date IS NULL AND $2::int IS NOT NULL',
      [id, p.start ?? null],
    );
  }

  for (const [typeName, days] of Object.entries(p.docs ?? {})) {
    await pool.query(
      `INSERT INTO credentials (organization_id, user_id, type_id, expires_on)
       SELECT $1, $2, id, CURRENT_DATE + $4::int FROM credential_types
       WHERE organization_id = $1 AND name = $3
       ON CONFLICT (user_id, type_id) DO NOTHING`,
      [organizationId, id, typeName, days],
    );
  }

  await pool.query(
    `INSERT INTO task_completions (organization_id, user_id, task_id)
     SELECT $1, $2, id FROM checklist_tasks WHERE organization_id = $1 ORDER BY sort_order LIMIT $3
     ON CONFLICT DO NOTHING`,
    [organizationId, id, p.tasks ?? 0],
  );
  return id;
}

async function insertPerson(organizationId, p) {
  const { rows } = await pool.query(
    `INSERT INTO users (organization_id, email, full_name, password_hash, role, status, start_date)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE + $7::int)
     RETURNING id`,
    [
      organizationId,
      p.email ?? null,
      p.name,
      p.email ? passwordHash : null,
      p.role ?? 'employee',
      p.status,
      p.start ?? null,
    ],
  );
  console.log(`  added ${p.name} (${p.role ?? 'employee'}, ${p.status})${p.email ? ` - sign in as ${p.email}` : ''}`);
  return rows[0].id;
}

const worldOfHope = await findOrCreateOrg('World of Hope');
console.log('World of Hope:');
const ids = {};
for (const p of WORLD_OF_HOPE_PEOPLE) {
  ids[p.name] = await addPerson(worldOfHope, p);
}

// Sky Supervisor's team, plus the caregiver who can sign in.
for (const p of WORLD_OF_HOPE_PEOPLE.filter((p) => p.team || p.email === 'caregiver@demo.test')) {
  await pool.query(
    `INSERT INTO user_supervisors (organization_id, employee_id, supervisor_id)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [worldOfHope, ids[p.name], ids['Sky Supervisor']],
  );
}

// A second agency, to check that agencies only ever see their own people.
const otherAgency = await findOrCreateOrg('Sunrise Home Care');
console.log('Sunrise Home Care:');
await addPerson(otherAgency, { email: 'admin@sunrise.test', name: 'Sam Sunrise', role: 'admin', status: 'active', tasks: 5, docs: ALL_CURRENT });
await addPerson(otherAgency, { name: 'Rita Sunrise', status: 'active', tasks: 5, docs: { ...ALL_CURRENT, [TB]: -1 } });

console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}`);
await pool.end();
