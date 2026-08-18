/**
 * Post-Event Refresh Cron Worker
 * Calls the web service API to check and run pending post-event jobs.
 */
import 'dotenv/config';

const API_BASE = process.env.API_BASE_URL
  ? `https://${process.env.API_BASE_URL}`
  : process.env.API_URL || 'http://localhost:3001';

const CRON_SECRET = process.env.CRON_SECRET;

const headers = {
  'Content-Type': 'application/json',
  'x-cron-secret': CRON_SECRET || '',
};

async function main() {
  console.log(`[${new Date().toISOString()}] Post-event cron starting`);

  // Get pending events from the API
  const res = await fetch(`${API_BASE}/api/events/pending`, { headers });
  if (!res.ok) {
    console.error('Failed to fetch pending events:', await res.text());
    process.exit(1);
  }

  const { events } = await res.json();
  console.log(`Found ${events.length} pending post-event jobs`);

  if (events.length === 0) {
    process.exit(0);
  }

  for (const event of events) {
    // Determine which refresh is needed
    const eventTime = new Date(event.event_time).getTime();
    const now = Date.now();
    const minsAgo = (now - eventTime) / 60000;

    if (!event.refresh_1min_done && minsAgo >= 1 && minsAgo < 5) {
      await triggerEventRefresh(event.id, '1min');
    }
    if (!event.refresh_30min_done && minsAgo >= 29 && minsAgo < 35) {
      await triggerEventRefresh(event.id, '30min');
    }
  }

  process.exit(0);
}

async function triggerEventRefresh(eventId, delay) {
  console.log(`Triggering ${delay} refresh for event ${eventId}`);
  const res = await fetch(`${API_BASE}/api/dashboard/run-event/${eventId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ delay }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Event refresh failed (${delay}):`, data);
  } else {
    console.log(`Event refresh complete (${delay}):`, data);
  }
}

main().catch(err => {
  console.error('Post-event cron error:', err.message);
  process.exit(1);
});
