// Turns '2026-10-02' into 'Oct 2, 2026'.
// The date is built from its parts on purpose: new Date('2026-10-02') reads it
// as midnight UTC, which shows as the day before in US time zones.
export function formatDate(isoDate) {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  supervisor: 'Supervisor',
  employee: 'Employee',
}

// A one-line summary of someone's documents for the staff table, worst first.
// Returns { tone: 'bad' | 'warn' | 'ok', text, extra }.
export function documentStatus(person) {
  const { docs_expired, docs_expiring, docs_missing, docs_missing_names, next_expiry } = person
  const missingText =
    docs_missing === 1 ? `${docs_missing_names[0]} missing` : `${docs_missing} documents missing`

  if (docs_expired > 0) {
    const more = docs_expired > 1 ? ` (+${docs_expired - 1} more)` : ''
    return {
      tone: 'bad',
      text: `${next_expiry.type} expired ${formatDate(next_expiry.expires_on)}${more}`,
      extra: docs_missing > 0 ? missingText : null,
    }
  }
  if (docs_expiring > 0) {
    return {
      tone: 'warn',
      text: `${next_expiry.type} expires ${formatDate(next_expiry.expires_on)}`,
      extra: docs_missing > 0 ? missingText : null,
    }
  }
  if (docs_missing > 0) {
    return { tone: 'bad', text: missingText, extra: null }
  }
  return { tone: 'ok', text: 'All current', extra: null }
}
