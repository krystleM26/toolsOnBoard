import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { requireAuth, TOKEN_COOKIE } from '../middleware/auth.js';

const router = Router();

const SESSION_DAYS = 7;

// The logged-in user as the browser sees it: never includes password_hash.
async function findPublicUser(id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, u.phone, u.start_date,
            o.id AS organization_id, o.name AS organization_name
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [id],
  );
  return rows[0];
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { rows } = await pool.query(
    'SELECT id, password_hash, status FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  const user = rows[0];

  // Same message whether the email or the password is wrong, so the
  // login form can't be used to discover which emails have accounts.
  // Users without a password (e.g. from Clock Earnings) can't log in here.
  if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (user.status === 'archived') {
    return res.status(401).json({ error: 'This account is no longer active' });
  }

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: `${SESSION_DAYS}d`,
  });

  // httpOnly: page JavaScript can't read the cookie, which protects it from
  // malicious scripts. sameSite: the browser won't send it from other sites.
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });

  res.json({ user: await findPublicUser(user.id) });
});

router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE);
  res.json({ ok: true });
});

// Who is logged in? The frontend calls this on page load.
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await findPublicUser(req.user.id) });
});

export default router;
