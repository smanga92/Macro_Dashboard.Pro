/**
 * Source Health Check Cron
 * Calls the web service API to trigger a health check on all sources.
 */
import 'dotenv/config';

const API_BASE = process.env.API_BASE_URL
  ? `https://${process.env.API_BASE_URL}`
  : process.env.API_URL || 'http://localhost:3001';

const CRON_SECRET = process.env.CRON_SECRET;

async function main() {
  console.log(`[${new Date().toISOString()}] Health check cron starting`);

  const res = await fetch(`${API_BASE}/api/admin/health-check-all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET || '',
    },
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Health check failed:', data);
    process.exit(1);
  }

  console.log('Health check complete:', data);
  process.exit(0);
}

main().catch(err => {
  console.error('Health check cron error:', err.message);
  process.exit(1);
});
