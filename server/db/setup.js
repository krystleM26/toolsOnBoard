// Creates the tables and loads starting data. Run with: npm run db:setup
import { readFile } from 'node:fs/promises';
import pool from '../db.js';

for (const file of ['schema.sql', 'seed.sql']) {
  const sql = await readFile(new URL(file, import.meta.url), 'utf8');
  await pool.query(sql);
  console.log(`Ran ${file}`);
}

await pool.end();
