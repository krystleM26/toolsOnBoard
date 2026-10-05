import express from 'express';
import cookieParser from 'cookie-parser';
import pool from './db.js';
import authRoutes from './routes/auth.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Add it to server/.env (see .env.example).');
  process.exit(1);
}

const app = express();
const port = 3001;

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: err.message });
  }
});

// Anything that throws in a route ends up here instead of crashing the server.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

app.listen(port, (err) => {
  if (err) {
    // Usually EADDRINUSE: another copy of the server is already running.
    console.error(`Could not start server on port ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Server listening on http://localhost:${port}`);
});
