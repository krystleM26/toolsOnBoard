// Runs before `npm test`: creates the test database if it doesn't exist yet.
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
const dbName = url.pathname.slice(1);

// Connect to the built-in "postgres" database to create ours.
url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();

const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (rowCount === 0) {
  await client.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Created database ${dbName}`);
}

await client.end();
