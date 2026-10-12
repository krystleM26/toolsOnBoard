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
