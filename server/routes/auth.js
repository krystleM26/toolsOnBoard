import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { requireAuth, TOKEN_COOKIE } from '../middleware/auth.js';

const router = Router();

const SESSION_DAYS = 7;

// Columns that are safe to send to the browser (never password_hash).
const PUBLIC_COLUMNS = 'id, email, full_name, role, phone, start_date';

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  const user = rows[0];

  // Same message whether the email or the password is wrong, so the
  // login form can't be used to discover which emails have accounts.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
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

  const { password_hash, created_at, ...publicUser } = user;
  res.json({ user: publicUser });
});

router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE);
  res.json({ ok: true });
});

// Who is logged in? The frontend calls this on page load.
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
    [req.user.id],
  );
  if (!rows[0]) {
    return res.status(401).json({ error: 'Account no longer exists' });
  }
  res.json({ user: rows[0] });
});

export default router;
