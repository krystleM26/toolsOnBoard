import app from './app.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Add it to server/.env (see .env.example).');
  process.exit(1);
}

const port = 3001;

app.listen(port, (err) => {
  if (err) {
    // Usually EADDRINUSE: another copy of the server is already running.
    console.error(`Could not start server on port ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Server listening on http://localhost:${port}`);
});
