// Creates an admin account (or resets an existing one's password).
// Run with: npm run create-admin   (it asks for the details)
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import pool from '../db.js';

// Reads a line without showing what's typed, for passwords.
function askHidden(prompt) {
  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    let value = '';
    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        } else if (char === '\u0003') {
          // Ctrl+C
          stdout.write('\n');
          process.exit(1);
        } else if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    }
    stdin.on('data', onData);
  });
}

const rl = readline.createInterface({ input: stdin, output: stdout });
const email = (await rl.question('Email: ')).trim().toLowerCase();
const fullName = (await rl.question('Full name: ')).trim();
rl.close();

if (!email || !fullName) {
  console.error('Email and full name are required.');
  process.exit(1);
}

const password = await askHidden('Password (at least 8 characters, hidden as you type): ');
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
if ((await askHidden('Type it again: ')) !== password) {
  console.error('Passwords did not match. Nothing was changed.');
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
  [email, fullName, passwordHash],
);

console.log(`Admin account ready: ${email}`);
await pool.end();
