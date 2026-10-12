import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../db.js';
import { runMigrations } from '../db/migrations.js';
import { DEFAULT_CHECKLIST, DEFAULT_CREDENTIAL_TYPES } from '../services/organizations.js';
import { resetDb, createOrg, createUser, closeDb } from './helpers.js';

describe('database', () => {
  before(resetDb);
  after(closeDb);

  describe('migrations', () => {
    it('can run again without changing anything', async () => {
      const { rows: before } = await pool.query('SELECT name FROM schema_migrations');
      await runMigrations(pool);
      const { rows: after } = await pool.query('SELECT name FROM schema_migrations');
      assert.deepEqual(after, before);
    });
  });

  describe('createOrganization', () => {
    let org;
    before(async () => {
      org = await createOrg('Hilltop Home Care');
    });

    it('gives the organization the default document types', async () => {
      const { rows } = await pool.query(
        'SELECT name, valid_for_months FROM credential_types WHERE organization_id = $1 ORDER BY id',
        [org.id],
      );
      assert.deepEqual(rows.map((r) => r.name), DEFAULT_CREDENTIAL_TYPES.map((t) => t.name));
      assert.equal(rows.find((r) => r.name === 'TB Test').valid_for_months, 24);
    });

    it('gives the organization the default checklist, in order', async () => {
      const { rows } = await pool.query(
        'SELECT title FROM checklist_tasks WHERE organization_id = $1 ORDER BY sort_order',
        [org.id],
      );
      assert.deepEqual(rows.map((r) => r.title), DEFAULT_CHECKLIST.map((t) => t.title));
    });

    it('records the creation in the change history', async () => {
      const { rows } = await pool.query(
        "SELECT action, changes FROM audit_log WHERE organization_id = $1 AND entity_type = 'organization'",
        [org.id],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].action, 'organization.created');
      assert.deepEqual(rows[0].changes, { name: { from: null, to: 'Hilltop Home Care' } });
    });
  });

  // The database itself must refuse to mix two agencies' data,
  // even if a bug in the app code tried to.
  describe('keeping organizations apart', () => {
    let orgA;
    let orgB;
    let employeeA;
    let supervisorB;

    before(async () => {
      orgA = await createOrg('Agency A');
      orgB = await createOrg('Agency B');
      employeeA = await createUser({ organizationId: orgA.id });
      supervisorB = await createUser({ organizationId: orgB.id, role: 'supervisor' });
    });

    async function firstId(table, orgId) {
      const { rows } = await pool.query(
        `SELECT id FROM ${table} WHERE organization_id = $1 ORDER BY id LIMIT 1`,
        [orgId],
      );
      return rows[0].id;
    }

    it("won't attach another agency's document type to an employee", async () => {
      const typeFromB = await firstId('credential_types', orgB.id);
      await assert.rejects(
        pool.query(
          `INSERT INTO credentials (organization_id, user_id, type_id, expires_on)
           VALUES ($1, $2, $3, '2030-01-01')`,
          [orgA.id, employeeA.id, typeFromB],
        ),
        /violates foreign key constraint/,
      );
    });

    it("won't tick another agency's checklist task", async () => {
      const taskFromB = await firstId('checklist_tasks', orgB.id);
      await assert.rejects(
        pool.query(
          'INSERT INTO task_completions (organization_id, user_id, task_id) VALUES ($1, $2, $3)',
          [orgA.id, employeeA.id, taskFromB],
        ),
        /violates foreign key constraint/,
      );
    });

    it("won't make someone a supervisor in another agency", async () => {
      await assert.rejects(
        pool.query(
          'INSERT INTO user_supervisors (organization_id, employee_id, supervisor_id) VALUES ($1, $2, $3)',
          [orgA.id, employeeA.id, supervisorB.id],
        ),
        /violates foreign key constraint/,
      );
    });

    it('allows the same links within one agency', async () => {
      const typeFromA = await firstId('credential_types', orgA.id);
      await pool.query(
        `INSERT INTO credentials (organization_id, user_id, type_id, expires_on)
         VALUES ($1, $2, $3, '2030-01-01')`,
        [orgA.id, employeeA.id, typeFromA],
      );
    });
  });

  describe('rules on users', () => {
    let org;
    before(async () => {
      org = await createOrg();
    });

    it('only allows the four roles', async () => {
      await assert.rejects(
        createUser({ organizationId: org.id, role: 'superadmin' }),
        /violates check constraint/,
      );
    });

    it('allows several users with no email (e.g. from Clock Earnings)', async () => {
      await createUser({ organizationId: org.id, email: null });
      await createUser({ organizationId: org.id, email: null });
    });

    it("won't let someone supervise themselves", async () => {
      const user = await createUser({ organizationId: org.id });
      await assert.rejects(
        pool.query(
          'INSERT INTO user_supervisors (organization_id, employee_id, supervisor_id) VALUES ($1, $2, $2)',
          [org.id, user.id],
        ),
        /violates check constraint/,
      );
    });
  });
});
