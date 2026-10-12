import { formatDate, ROLE_LABELS, STATUS_LABELS } from '../format.js'

const FIELD_LABELS = {
  full_name: 'name',
  email: 'email',
  phone: 'phone',
  start_date: 'start date',
  role: 'role',
  status: 'status',
}

// Shows a stored value the way people read it ('2030-01-15' -> 'Jan 15, 2030').
function showValue(field, value) {
  if (value === null || value === '') return 'blank'
  if (field === 'start_date') return formatDate(value)
  if (field === 'role') return ROLE_LABELS[value] ?? value
  if (field === 'status') return STATUS_LABELS[value] ?? value
  return value
}

function describeFieldChanges(changes) {
  return Object.entries(changes)
    .map(([field, { from, to }]) => `${FIELD_LABELS[field] ?? field} from ${showValue(field, from)} to ${showValue(field, to)}`)
    .join('; ')
}

// Turns a history entry into a sentence (without who did it), e.g.
// 'changed phone from blank to 555-0100'.
export function describeHistory({ action, changes }) {
  switch (action) {
    case 'user.created':
      return 'added this person'
    case 'user.updated':
      return `changed ${describeFieldChanges(changes)}`
    case 'user.status_changed': {
      const { from, to } = changes.status
      if (to === 'archived') return 'archived this person'
      if (from === 'archived') return `restored this person (${STATUS_LABELS[to]})`
      if (from === 'onboarding' && to === 'active') return 'marked onboarding complete'
      return `changed ${describeFieldChanges(changes)}`
    }
    case 'user.supervisors_changed': {
      const { to } = changes.supervisors
      return to.length ? `set supervisors to ${to.join(', ')}` : 'removed all supervisors'
    }
    case 'user.password_reset':
      return 'reset the password'
    case 'task.completed':
      return `ticked “${changes.task.to}”`
    case 'task.reopened':
      return `unticked “${changes.task.to}”`
    case 'note.added':
      return 'added a note'
    default:
      return action
  }
}
