import pg from 'pg';

// A pool keeps a few database connections open and reuses them,
// so each request doesn't pay the cost of connecting from scratch.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export default pool;
