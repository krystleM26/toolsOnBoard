// Creates an admin account (or resets an existing one's password).
// Run with: npm run create-admin -- you@example.com "Your Name" yourPassword
import bcrypt from 'bcryptjs';
import pool from '../db.js';

const [email, fullName, password] = process.argv.slice(2);

if (!email || !fullName || !password) {
  console.error('Usage: npm run create-admin -- <email> "<full name>" <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

await pool.query(
  `INSERT INTO users (email, full_name, password_hash, role)
   VALUES ($1, $2, $3, 'admin')
   ON CONFLICT (email) DO UPDATE
     SET full_name = EXCLUDED.full_name,
         password_hash = EXCLUDED.password_hash,
         role = 'admin'`,
  [email.trim().toLowerCase(), fullName, passwordHash],
);

console.log(`Admin account ready: ${email}`);
await pool.end();
