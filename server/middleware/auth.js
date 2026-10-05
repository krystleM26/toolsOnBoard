import jwt from 'jsonwebtoken';

export const TOKEN_COOKIE = 'token';

// Lets the request through only if it carries a valid login token.
// On success, req.user is { id, role } for the logged-in user.
export function requireAuth(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const { sub, role } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: sub, role };
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// Use after requireAuth on routes only admins may call.
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}
