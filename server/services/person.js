import pool from '../db.js';
import { diff, recordAudit } from './audit.js';
import { canView, permissionsFor } from './permissions.js';
import { cleanDetails, friendlyDbError, ValidationError } from './validation.js';

const HISTORY_LIMIT = 200;
const EDITABLE_FIELDS = ['full_name', 'email', 'phone', 'start_date', 'role', 'status'];

export class NotFoundError extends Error {}

// Runs `work(client)` in a transaction: all of it is saved, or none of it.
async function inTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Loads a person the viewer is allowed to see, or throws NotFoundError.
// "Not allowed" and "doesn't exist" look the same from outside, so nobody can
// discover who exists at another agency (or outside a supervisor's team).
async function loadVisiblePerson(db, viewer, personId, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT u.id, u.organization_id, u.full_name, u.email, u.phone, u.start_date,
            u.role, u.status, u.created_at,
            ARRAY(SELECT supervisor_id FROM user_supervisors WHERE employee_id = u.id) AS supervisor_ids
     FROM users u
     WHERE u.id = $1
     ${lock ? 'FOR UPDATE' : ''}`,
    [personId],
  );
  const person = rows[0];
  if (!person || !canView(viewer, person, person.supervisor_ids)) throw new NotFoundError();
  return person;
}

function requirePermission(allowed, message) {
  if (!allowed) throw new ValidationError(message, 403);
}

// Everything the person page shows, in one response.
export async function getPersonPage(viewer, personId) {
  const person = await loadVisiblePerson(pool, viewer, personId);
  const can = permissionsFor(viewer, person);
  const orgId = person.organization_id;

  const [supervisors, checklist, documents, notes, history, org] = await Promise.all([
    pool.query(
      `SELECT u.id, u.full_name, u.role FROM user_supervisors s JOIN users u ON u.id = s.supervisor_id
       WHERE s.employee_id = $1 ORDER BY u.full_name`,
      [person.id],
    ),
    pool.query(
      `SELECT t.id, t.title, t.description, tc.completed_at, cb.full_name AS completed_by_name
       FROM checklist_tasks t
       LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = $2
       LEFT JOIN users cb ON cb.id = tc.completed_by
       WHERE t.organization_id = $1
       ORDER BY t.sort_order, t.id`,
      [orgId, person.id],
    ),
    pool.query(
      `SELECT ct.id AS type_id, ct.name AS type, ct.valid_for_months,
              c.id AS credential_id, c.issued_on, c.expires_on, c.uploaded_at,
              CASE
                WHEN c.id IS NULL THEN 'missing'
                WHEN c.expires_on < CURRENT_DATE THEN 'expired'
                WHEN c.expires_on <= CURRENT_DATE + o.expiry_warning_days THEN 'expiring'
                ELSE 'current'
              END AS state
       FROM credential_types ct
       JOIN organizations o ON o.id = ct.organization_id
       LEFT JOIN credentials c ON c.type_id = ct.id AND c.user_id = $2
       WHERE ct.organization_id = $1
       ORDER BY ct.name`,
      [orgId, person.id],
    ),
    pool.query(
      `SELECT n.id, n.body, n.created_at, a.full_name AS author_name
       FROM notes n LEFT JOIN users a ON a.id = n.author_id
       WHERE n.user_id = $1 ORDER BY n.created_at DESC, n.id DESC`,
      [person.id],
    ),
    pool.query(
      `SELECT l.id, l.action, l.changes, l.created_at, a.full_name AS actor_name
       FROM audit_log l LEFT JOIN users a ON a.id = l.actor_id
       WHERE l.organization_id = $1 AND l.entity_type = 'user' AND l.entity_id = $2
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ${HISTORY_LIMIT}`,
      [orgId, person.id],
    ),
    pool.query('SELECT expiry_warning_days FROM organizations WHERE id = $1', [orgId]),
  ]);

  // People who could be chosen as this person's supervisor.
  const supervisorOptions = can.changeSupervisors
    ? (
        await pool.query(
          `SELECT id, full_name, role FROM users
           WHERE organization_id = $1 AND role IN ('admin', 'manager', 'supervisor')
             AND status <> 'archived' AND id <> $2
           ORDER BY full_name`,
          [orgId, person.id],
        )
      ).rows
    : [];

  const { supervisor_ids, organization_id, ...details } = person;
  return {
    person: details,
    supervisors: supervisors.rows,
    checklist: checklist.rows.map(({ completed_at, completed_by_name, ...task }) => ({
      ...task,
      done: completed_at !== null,
      completed_at,
      completed_by_name,
    })),
    documents: documents.rows,
    notes: notes.rows,
    history: history.rows,
    warningDays: org.rows[0].expiry_warning_days,
    can,
    supervisorOptions,
  };
}

// Edits details, role and/or status. Each kind of change needs its own permission.
export async function updatePerson(viewer, personId, input) {
  const changes = cleanDetails(input);
  if (Object.keys(changes).length === 0) throw new ValidationError('Nothing to change');

  return inTransaction(async (client) => {
    const before = await loadVisiblePerson(client, viewer, personId, { lock: true });
    const can = permissionsFor(viewer, before);

    const detailFields = ['full_name', 'email', 'phone', 'start_date'];
    if (detailFields.some((f) => f in changes)) {
      requirePermission(can.editDetails, 'Only admins can edit details');
    }
    if ('role' in changes) {
      requirePermission(can.changeRole, viewer.id === before.id ? "You can't change your own role" : 'Only admins can change roles');
    }
    if ('status' in changes) {
      requirePermission(
        can.changeStatus,
        viewer.id === before.id ? "You can't change your own status" : 'Only admins can change status',
      );
    }

    const fields = Object.keys(changes);
    let after;
    try {
      const { rows } = await client.query(
        `UPDATE users SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = now()
         WHERE id = $1
         RETURNING id, full_name, email, phone, start_date, role, status, created_at`,
        [before.id, ...fields.map((f) => changes[f])],
      );
      after = rows[0];
    } catch (err) {
      throw friendlyDbError(err);
    }

    const changed = diff(before, after, EDITABLE_FIELDS);
    if (changed) {
      await recordAudit(client, {
        organizationId: before.organization_id,
        actorId: viewer.id,
        action: 'status' in changed && Object.keys(changed).length === 1 ? 'user.status_changed' : 'user.updated',
        entityType: 'user',
        entityId: before.id,
        changes: changed,
      });
    }
    return after;
  });
}

// Replaces the list of people who supervise this person.
export async function setSupervisors(viewer, personId, supervisorIds) {
  if (!Array.isArray(supervisorIds) || !supervisorIds.every(Number.isInteger)) {
    throw new ValidationError('supervisorIds must be a list of ids');
  }
  const wanted = [...new Set(supervisorIds)];

  return inTransaction(async (client) => {
    const person = await loadVisiblePerson(client, viewer, personId, { lock: true });
    requirePermission(permissionsFor(viewer, person).changeSupervisors, 'Only admins can change supervisors');

    const { rows: valid } = await client.query(
      `SELECT id, full_name FROM users
       WHERE id = ANY($1) AND organization_id = $2 AND id <> $3
         AND role IN ('admin', 'manager', 'supervisor') AND status <> 'archived'`,
      [wanted, person.organization_id, person.id],
    );
    if (valid.length !== wanted.length) {
      throw new ValidationError('Supervisors must be current admins, managers or supervisors at your agency');
    }

    const { rows: current } = await client.query(
      `SELECT u.id, u.full_name FROM user_supervisors s JOIN users u ON u.id = s.supervisor_id
       WHERE s.employee_id = $1 ORDER BY u.full_name`,
      [person.id],
    );

    await client.query('DELETE FROM user_supervisors WHERE employee_id = $1', [person.id]);
    for (const { id } of valid) {
      await client.query(
        'INSERT INTO user_supervisors (organization_id, employee_id, supervisor_id) VALUES ($1, $2, $3)',
        [person.organization_id, person.id, id],
      );
    }

    const names = (list) => list.map((u) => u.full_name).sort();
    const from = names(current);
    const to = names(valid);
    if (from.join('|') !== to.join('|')) {
      await recordAudit(client, {
        organizationId: person.organization_id,
        actorId: viewer.id,
        action: 'user.supervisors_changed',
        entityType: 'user',
        entityId: person.id,
        changes: { supervisors: { from, to } },
      });
    }
  });
}

// Ticks or unticks one checklist task for a person.
export async function setTaskDone(viewer, personId, taskId, done) {
  if (typeof done !== 'boolean') throw new ValidationError('done must be true or false');

  return inTransaction(async (client) => {
    const person = await loadVisiblePerson(client, viewer, personId, { lock: true });
    requirePermission(permissionsFor(viewer, person).tickTasks, 'Only admins can tick tasks for someone');

    const { rows: tasks } = await client.query(
      'SELECT id, title FROM checklist_tasks WHERE id = $1 AND organization_id = $2',
      [taskId, person.organization_id],
    );
    if (!tasks[0]) throw new NotFoundError();

    const result = done
      ? await client.query(
          `INSERT INTO task_completions (organization_id, user_id, task_id, completed_by)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [person.organization_id, person.id, taskId, viewer.id],
        )
      : await client.query('DELETE FROM task_completions WHERE user_id = $1 AND task_id = $2', [person.id, taskId]);

    // Only record it if something actually changed (e.g. not a double-click).
    if (result.rowCount > 0) {
      await recordAudit(client, {
        organizationId: person.organization_id,
        actorId: viewer.id,
        action: done ? 'task.completed' : 'task.reopened',
        entityType: 'user',
        entityId: person.id,
        changes: { task: { from: null, to: tasks[0].title } },
      });
    }
  });
}

export async function addNote(viewer, personId, body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) throw new ValidationError('A note can’t be empty');

  return inTransaction(async (client) => {
    const person = await loadVisiblePerson(client, viewer, personId);
    requirePermission(permissionsFor(viewer, person).writeNotes, 'Only admins can write notes');

    const { rows } = await client.query(
      `INSERT INTO notes (organization_id, user_id, author_id, body)
       VALUES ($1, $2, $3, $4) RETURNING id, body, created_at`,
      [person.organization_id, person.id, viewer.id, text],
    );
    await recordAudit(client, {
      organizationId: person.organization_id,
      actorId: viewer.id,
      action: 'note.added',
      entityType: 'user',
      entityId: person.id,
      changes: null,
    });
    return rows[0];
  });
}
