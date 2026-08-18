/**
 * Morning Dashboard Cron Worker
 * Calls the web service API — does NOT touch the database directly.
 * Railway volume is mounted only to the web service.
 */
import 'dotenv/config';

const API_BASE = process.env.API_BASE_URL
  ? `https://${process.env.API_BASE_URL}`
  : process.env.API_URL || 'http://localhost:3001';

const CRON_SECRET = process.env.CRON_SECRET;

async function main() {
  console.log(`[${new Date().toISOString()}] Morning cron starting`);
  console.log(`Calling: ${API_BASE}/api/dashboard/run`);

  const res = await fetch(`${API_BASE}/api/dashboard/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET || '',
    },
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Dashboard run failed:', data);
    process.exit(1);
  }

  console.log('Morning dashboard complete:', data);
  process.exit(0);
}

main().catch(err => {
  console.error('Morning cron error:', err.message);
  process.exit(1);
});
