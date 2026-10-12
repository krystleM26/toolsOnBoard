import pg from 'pg';

// Return DATE columns (start dates, expiry dates) as plain 'YYYY-MM-DD'
// strings. By default they become JavaScript Dates at local midnight, which
// can shift by a day when converted to JSON in another time zone.
const DATE_TYPE_ID = 1082;
pg.types.setTypeParser(DATE_TYPE_ID, (value) => value);

// A pool keeps a few database connections open and reuses them,
// so each request doesn't pay the cost of connecting from scratch.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export default pool;
