import pool from '../db.js';
import { recordAudit } from './audit.js';

export const PAGE_SIZE = 25;
export const ROLES = ['admin', 'manager', 'supervisor', 'employee'];

// Builds the query behind every dashboard view: one row per person the viewer
// is allowed to see, with their checklist progress and document status.
//
// Who the viewer can see:
//   admin, manager -> everyone in their organization
//   supervisor     -> only the people they supervise
// (Employees never reach this; the routes block them.)
function staffStatsQuery(viewer, { status, search } = {}) {
  const params = [viewer.organizationId];
  const where = ['u.organization_id = $1'];

  if (viewer.role === 'supervisor') {
    params.push(viewer.id);
    where.push(`u.id IN (SELECT employee_id FROM user_supervisors WHERE supervisor_id = $${params.length})`);
  }
  if (status) {
    params.push(status);
    where.push(`u.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  // A document counts as:
  //   expired  - its expiry date is before today
  //   expiring - it expires between today and the org's warning window
  //   missing  - the org requires that type and the person has none
  const sql = `
    SELECT
      u.id, u.full_name, u.email, u.role, u.status, u.start_date,
      tasks.total AS tasks_total,
      (SELECT count(*)::int FROM task_completions tc WHERE tc.user_id = u.id) AS tasks_done,
      docs.expired AS docs_expired,
      docs.expiring AS docs_expiring,
      docs.missing AS docs_missing,
      docs.missing_names AS docs_missing_names,
      docs.next_expiry
    FROM users u
    JOIN organizations o ON o.id = u.organization_id
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS total FROM checklist_tasks t WHERE t.organization_id = u.organization_id
    ) tasks
    CROSS JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE c.expires_on < CURRENT_DATE)::int AS expired,
        count(*) FILTER (
          WHERE c.expires_on >= CURRENT_DATE
            AND c.expires_on <= CURRENT_DATE + o.expiry_warning_days
        )::int AS expiring,
        count(*) FILTER (WHERE c.id IS NULL)::int AS missing,
        coalesce(array_agg(ct.name ORDER BY ct.name) FILTER (WHERE c.id IS NULL), '{}') AS missing_names,
        (array_agg(json_build_object('type', ct.name, 'expires_on', c.expires_on) ORDER BY c.expires_on)
          FILTER (WHERE c.id IS NOT NULL))[1] AS next_expiry
      FROM credential_types ct
      LEFT JOIN credentials c ON c.type_id = ct.id AND c.user_id = u.id
      WHERE ct.organization_id = u.organization_id
    ) docs
    WHERE ${where.join(' AND ')}
  `;
  return { sql, params };
}

// The "needs attention" numbers for both tabs. Each number counts people.
export async function getSummary(viewer) {
  const { sql, params } = staffStatsQuery(viewer);
  const { rows } = await pool.query(
    `WITH stats AS (${sql})
     SELECT
       count(*) FILTER (WHERE status = 'onboarding')::int AS onboarding_total,
       count(*) FILTER (
         WHERE status = 'onboarding' AND start_date <= CURRENT_DATE AND tasks_done < tasks_total
       )::int AS onboarding_behind,
       count(*) FILTER (WHERE status = 'onboarding' AND docs_missing > 0)::int AS onboarding_missing_docs,
       count(*) FILTER (WHERE status = 'active')::int AS active_total,
       count(*) FILTER (WHERE status = 'active' AND docs_expired > 0)::int AS active_expired,
       count(*) FILTER (WHERE status = 'active' AND docs_expiring > 0)::int AS active_expiring,
       count(*) FILTER (WHERE status = 'active' AND docs_missing > 0)::int AS active_missing_docs,
       (SELECT expiry_warning_days FROM organizations WHERE id = $1) AS warning_days
     FROM stats`,
    params,
  );
  const s = rows[0];
  return {
    warningDays: s.warning_days,
    onboarding: {
      total: s.onboarding_total,
      behind: s.onboarding_behind,
      missingDocs: s.onboarding_missing_docs,
    },
    active: {
      total: s.active_total,
      expired: s.active_expired,
      expiring: s.active_expiring,
      missingDocs: s.active_missing_docs,
    },
  };
}

// One page of the staff table.
//   Onboarding tab: soonest start date first.
//   Active tab: people with expired, then expiring, documents first.
export async function listStaff(viewer, { status, search, page = 1 }) {
  const { sql, params } = staffStatsQuery(viewer, { status, search });
  const orderBy =
    status === 'onboarding'
      ? 'start_date ASC NULLS LAST, full_name'
      : '(docs_expired > 0) DESC, (docs_expiring > 0) DESC, (docs_missing > 0) DESC, full_name';

  params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const { rows } = await pool.query(
    `WITH stats AS (${sql})
     SELECT *, count(*) OVER ()::int AS total_count
     FROM stats
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    staff: rows.map(({ total_count, ...person }) => person),
    total: rows[0]?.total_count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Adds a person to the creator's organization and records it in the history.
export async function createStaffMember(creator, input) {
  const fullName = input.fullName?.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const startDate = input.startDate || null;
  const role = input.role || 'employee';
  const status = input.alreadyWorking ? 'active' : 'onboarding';

  if (!fullName) throw new ValidationError('Full name is required');
  if (email && !EMAIL_PATTERN.test(email)) throw new ValidationError('That email address doesn’t look right');
  if (startDate && (!DATE_PATTERN.test(startDate) || Number.isNaN(Date.parse(startDate)))) {
    throw new ValidationError('Start date must be a valid date');
  }
  if (!ROLES.includes(role)) throw new ValidationError('Unknown role');
  if (role === 'admin' && creator.role !== 'admin') {
    throw new ValidationError('Only admins can add other admins', 403);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (organization_id, full_name, email, phone, start_date, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, email, phone, start_date, role, status`,
      [creator.organizationId, fullName, email, phone, startDate, role, status],
    );
    const person = rows[0];

    await recordAudit(client, {
      organizationId: creator.organizationId,
      actorId: creator.id,
      action: 'user.created',
      entityType: 'user',
      entityId: person.id,
      changes: Object.fromEntries(
        Object.entries({ full_name: fullName, email, phone, start_date: startDate, role, status })
          .filter(([, value]) => value !== null)
          .map(([field, value]) => [field, { from: null, to: value }]),
      ),
    });

    await client.query('COMMIT');
    return person;
  } catch (err) {
    await client.query('ROLLBACK');
    // 23505 = unique_violation: the email is already used.
    if (err.code === '23505') throw new ValidationError('Someone already uses that email address', 409);
    throw err;
  } finally {
    client.release();
  }
}
