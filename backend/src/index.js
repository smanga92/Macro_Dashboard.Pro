import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60000, max: 200, standardHeaders: true }));

// Health check — register FIRST so it responds immediately even if DB is still starting
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start listening immediately — Railway healthcheck needs this
const server = app.listen(PORT, () => {
  console.log(`🚀 Macro Dashboard API running on port ${PORT}`);
});

// Run migrations and register routes AFTER server is already listening
async function init() {
  try {
    const { runMigrations } = await import('./migrations/run.js');
    runMigrations();
  } catch (err) {
    console.error('Migration failed:', err.message);
    // Don't crash — serve what we can
  }

  try {
    const { default: dashboardRoutes } = await import('./routes/dashboard.js');
    const { default: eventsRoutes }    = await import('./routes/events.js');
    const { default: adminRoutes }     = await import('./routes/admin.js');

    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/events', eventsRoutes);
    app.use('/api/admin', adminRoutes);

    // Serve frontend static files
    const frontendDist = path.join(__dirname, '../../frontend/dist');
    if (fs.existsSync(frontendDist)) {
      app.use(express.static(frontendDist));
      app.get('*', (req, res) => {
        res.sendFile(path.join(frontendDist, 'index.html'));
      });
    }

    console.log('✅ Routes registered');
  } catch (err) {
    console.error('Route registration failed:', err.message);
  }
}

init();

export default app;
