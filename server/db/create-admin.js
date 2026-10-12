// Creates an admin account (or resets an existing one's password).
// Run with: npm run create-admin   (it asks for the details, including which
// organization the admin belongs to, and can create a new organization)
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { recordAudit } from '../services/audit.js';
import { createOrganization } from '../services/organizations.js';

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
if (!email) {
  console.error('Email is required.');
  process.exit(1);
}

const { rows: existingUsers } = await pool.query(
  'SELECT id, full_name, organization_id FROM users WHERE email = $1',
  [email],
);
const existing = existingUsers[0];

let fullName;
let organizationId;

if (existing) {
  // Same email as an existing account: just make them an admin with a new password.
  console.log(`Found ${existing.full_name}. Their password will be reset.`);
  fullName = existing.full_name;
  organizationId = existing.organization_id;
} else {
  fullName = (await rl.question('Full name: ')).trim();
  if (!fullName) {
    console.error('Full name is required.');
    process.exit(1);
  }
  organizationId = await chooseOrganization();
}
rl.close();

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

const { rows } = await pool.query(
  `INSERT INTO users (organization_id, email, full_name, password_hash, role, status)
   VALUES ($1, $2, $3, $4, 'admin', 'active')
   ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         role = 'admin',
         updated_at = now()
   RETURNING id`,
  [organizationId, email, fullName, passwordHash],
);

await recordAudit(pool, {
  organizationId,
  actorId: null,
  action: existing ? 'user.password_reset' : 'user.created',
  entityType: 'user',
  entityId: rows[0].id,
  changes: existing ? null : { email: { from: null, to: email }, role: { from: null, to: 'admin' } },
});

console.log(`Admin account ready: ${email}`);
await pool.end();

// Lists existing organizations to pick from, or creates a new one.
async function chooseOrganization() {
  const { rows: orgs } = await pool.query('SELECT id, name FROM organizations ORDER BY name');

  if (orgs.length) {
    console.log('Which organization is this admin for?');
    orgs.forEach((org, i) => console.log(`  ${i + 1}) ${org.name}`));
    console.log(`  ${orgs.length + 1}) A new organization`);
    const choice = Number(await rl.question('Number: '));
    if (choice >= 1 && choice <= orgs.length) {
      return orgs[choice - 1].id;
    }
    if (choice !== orgs.length + 1) {
      console.error('Not a valid choice. Nothing was changed.');
      process.exit(1);
    }
  }

  const name = (await rl.question('New organization name: ')).trim();
  if (!name) {
    console.error('Organization name is required.');
    process.exit(1);
  }
  const org = await createOrganization({ name });
  console.log(`Created organization "${name}" with the default documents and checklist.`);
  return org.id;
}
