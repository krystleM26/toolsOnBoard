import pool from '../db.js';
import { recordAudit } from './audit.js';

// Every new organization starts with these; each agency can change them later.
export const DEFAULT_CREDENTIAL_TYPES = [
  { name: 'CPR Certification', description: 'Current CPR card', validForMonths: null },
  { name: "Driver's License", description: "Valid state driver's license", validForMonths: null },
  { name: 'TB Test', description: 'Tuberculosis test results', validForMonths: 24 },
  { name: 'Car Insurance', description: 'Proof of current auto insurance', validForMonths: null },
];

export const DEFAULT_CHECKLIST = [
  { title: 'Complete your profile', description: 'Add your phone number and start date.' },
  { title: 'Upload required documents', description: "CPR, driver's license, TB test and car insurance." },
  { title: 'Sign employee handbook', description: 'Read and acknowledge the employee handbook.' },
  { title: 'Submit tax forms', description: 'Fill out your W-4 and state withholding forms.' },
  { title: 'Set up direct deposit', description: 'Provide your bank details to payroll.' },
];

// Creates an organization with the default document types and checklist.
// Runs in a transaction so a half-created organization can never exist.
export async function createOrganization({ name, actorId = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING *',
      [name],
    );
    const org = rows[0];

    for (const type of DEFAULT_CREDENTIAL_TYPES) {
      await client.query(
        `INSERT INTO credential_types (organization_id, name, description, valid_for_months)
         VALUES ($1, $2, $3, $4)`,
        [org.id, type.name, type.description, type.validForMonths],
      );
    }

    for (const [index, task] of DEFAULT_CHECKLIST.entries()) {
      await client.query(
        `INSERT INTO checklist_tasks (organization_id, title, description, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [org.id, task.title, task.description, index + 1],
      );
    }

    await recordAudit(client, {
      organizationId: org.id,
      actorId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
      changes: { name: { from: null, to: name } },
    });

    await client.query('COMMIT');
    return org;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
