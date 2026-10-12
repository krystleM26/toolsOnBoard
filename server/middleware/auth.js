import jwt from 'jsonwebtoken';
import pool from '../db.js';

export const TOKEN_COOKIE = 'token';

// Lets the request through only if it carries a valid login token for a
// current (not archived) user. On success, req.user is
// { id, role, organizationId } for the logged-in user.
//
// The user is looked up on every request rather than trusting what's in the
// token, so archiving someone or changing their role takes effect immediately.
export async function requireAuth(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  let userId;
  try {
    userId = jwt.verify(token, process.env.JWT_SECRET).sub;
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }

  const { rows } = await pool.query(
    'SELECT id, role, organization_id, status FROM users WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user || user.status === 'archived') {
    return res.status(401).json({ error: 'This account is no longer active' });
  }

  req.user = { id: user.id, role: user.role, organizationId: user.organization_id };
  next();
}

// Use after requireAuth. Only lets the listed roles through, e.g.
//   router.get('/employees', requireAuth, requireRole('admin', 'manager'), ...)
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do that" });
    }
    next();
  };
}
