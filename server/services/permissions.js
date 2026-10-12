// Who may do what to a person's record. The routes enforce these, and the
// person page receives them so it only shows buttons that will work.
//
// The agency's rule: managers look after documents; admins do everything else.
// Supervisors can view their team; employees use their own pages (step 5).
export function permissionsFor(viewer, person) {
  const isAdmin = viewer.role === 'admin';
  const isSelf = viewer.id === person.id;

  return {
    editDetails: isAdmin,
    // Not on yourself, so an admin can't lock themselves out by accident.
    changeRole: isAdmin && !isSelf,
    changeStatus: isAdmin && !isSelf,
    changeSupervisors: isAdmin,
    tickTasks: isAdmin,
    writeNotes: isAdmin,
  };
}

// Can the viewer see this person at all?
//   admin, manager -> anyone in their organization
//   supervisor     -> only people they supervise
export function canView(viewer, person, supervisorIds) {
  if (person.organization_id !== viewer.organizationId) return false;
  if (viewer.role === 'admin' || viewer.role === 'manager') return true;
  if (viewer.role === 'supervisor') return supervisorIds.includes(viewer.id);
  return false;
}
