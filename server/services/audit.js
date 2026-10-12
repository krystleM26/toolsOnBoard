// Adds one entry to the change history.
//
// `db` is either the pool or a transaction client, so the history entry is
// saved (or rolled back) together with the change it describes.
//
//   await recordAudit(client, {
//     organizationId: 1,
//     actorId: req.user.id,          // null for system changes
//     action: 'user.updated',
//     entityType: 'user',
//     entityId: 42,
//     changes: { phone: { from: null, to: '555-0100' } },
//   });
export async function recordAudit(db, { organizationId, actorId, action, entityType, entityId, changes }) {
  await db.query(
    `INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [organizationId, actorId ?? null, action, entityType, entityId ?? null, changes ?? null],
  );
}

// Compares two versions of a record and returns only the fields that changed,
// as { field: { from, to } }. Returns null if nothing changed.
export function diff(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (from !== to) changes[field] = { from, to };
  }
  return Object.keys(changes).length ? changes : null;
}
