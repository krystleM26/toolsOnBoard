// Brings the database up to date. Run with: npm run db:migrate
import pool from '../db.js';
import { runMigrations } from './migrations.js';

await runMigrations(pool, { log: console.log });
console.log('Database is up to date.');
await pool.end();
