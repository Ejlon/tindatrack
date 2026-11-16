// server.js
// Entry point for the TindaTrack Express API.
//
// What this file does:
//   1. Loads environment variables from .env
//   2. Creates the Express app with global middleware (JSON parser, CORS)
//   3. Mounts every feature router under /api/<resource>
//   4. Adds a global error handler so we never leak stack traces to clients
//   5. Starts listening on the configured PORT

require('dotenv').config();          // must be first so all env vars are available
const express = require('express');
const cors    = require('cors');

// Import the connection pool — this also runs the startup connectivity test.
const db = require('./config/db');   // eslint-disable-line no-unused-vars (imported for side effects)

// ── Routers ────────────────────────────────────────────────────────────────
const authRouter      = require('./routes/auth');
const productsRouter  = require('./routes/products');
const bodegaRouter    = require('./routes/bodega');
const transfersRouter = require('./routes/transfers');
const salesRouter     = require('./routes/sales');
const reportsRouter   = require('./routes/reports');
const branchesRouter  = require('./routes/branches');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Global Middleware ───────────────────────────────────────────────────────

// Allow requests from the React dev server (and any origin you whitelist in .env).
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,                    // needed if you ever send cookies
}));

// Parse incoming JSON bodies (up to 10 kb — plenty for our payloads).
app.use(express.json({ limit: '10kb' }));

// ── Health check ───────────────────────────────────────────────────────────
// GET /api/health  → confirms the server is up without touching the DB.
app.get('/api/health', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'TindaTrack API',
    time:    new Date().toISOString(),
  });
});

// ── Feature Routers ────────────────────────────────────────────────────────
app.use('/api/auth',      authRouter);
app.use('/api/products',  productsRouter);
app.use('/api/bodega',    bodegaRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/sales',     salesRouter);
app.use('/api/reports',   reportsRouter);
app.use('/api/branches',  branchesRouter);

// ── 404 handler ────────────────────────────────────────────────────────────
// Catches any request that didn't match a router above.
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ── Global error handler ───────────────────────────────────────────────────
// Express calls this whenever a route/middleware calls next(err).
// We log the full error on the server but only send a safe message to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.stack || err.message);

  const status  = err.status  || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // In development, include the stack trace so it's easy to debug.
  res.status(status).json({
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  TindaTrack API running on http://localhost:${PORT}`);
  console.log(`    Environment: ${process.env.NODE_ENV || 'development'}`);
});
