// Checks shared by adding and editing a person.

export const ROLES = ['admin', 'manager', 'supervisor', 'employee'];
export const STATUSES = ['onboarding', 'active', 'archived'];

// Thrown for anything the user can fix; routes turn it into a 4xx response.
export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Turns form input into clean column values, checking each one.
// Only fields present in `input` are returned, so this works for both
// "add" (all fields) and "edit" (just what changed).
export function cleanDetails(input) {
  const clean = {};

  if ('fullName' in input) {
    clean.full_name = input.fullName?.trim();
    if (!clean.full_name) throw new ValidationError('Full name is required');
  }
  if ('email' in input) {
    clean.email = input.email?.trim().toLowerCase() || null;
    if (clean.email && !EMAIL_PATTERN.test(clean.email)) {
      throw new ValidationError('That email address doesn’t look right');
    }
  }
  if ('phone' in input) {
    clean.phone = input.phone?.trim() || null;
  }
  if ('startDate' in input) {
    clean.start_date = input.startDate || null;
    if (clean.start_date && (!DATE_PATTERN.test(clean.start_date) || Number.isNaN(Date.parse(clean.start_date)))) {
      throw new ValidationError('Start date must be a valid date');
    }
  }
  if ('role' in input) {
    clean.role = input.role;
    if (!ROLES.includes(clean.role)) throw new ValidationError('Unknown role');
  }
  if ('status' in input) {
    clean.status = input.status;
    if (!STATUSES.includes(clean.status)) throw new ValidationError('Unknown status');
  }
  return clean;
}

// 23505 = Postgres "unique_violation"; on users that means the email is taken.
export function friendlyDbError(err) {
  if (err.code === '23505') return new ValidationError('Someone already uses that email address', 409);
  return err;
}
