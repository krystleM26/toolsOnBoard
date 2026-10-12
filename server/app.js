// The Express app itself, without starting it on a port.
// server.js starts it for real; tests import it directly.
import express from 'express';
import cookieParser from 'cookie-parser';
import pool from './db.js';
import authRoutes from './routes/auth.js';
import staffRoutes from './routes/staff.js';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);

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

export default app;
