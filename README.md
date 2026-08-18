# Macro Dashboard

A Railway-hosted macro interpretation engine for daily regime signals and event-driven updates across:

**USD · EUR · GBP · JPY · CHF · CAD · AUD · NZD · Gold · US30 · US100 · BTC · GER40**

---

## Architecture

```
Railway Web Service  (Express API + React frontend)
    └── Persistent Volume: /var/data/macro.db  (SQLite)

Railway Cron: macro-morning-brief    → calls POST /api/dashboard/run
Railway Cron: macro-post-event       → calls GET /api/events/pending, then run-event
Railway Cron: macro-health-check     → calls POST /api/admin/health-check-all

Cron workers never touch the DB directly.
They authenticate to the web service with CRON_SECRET.
```

---

## Deploy to Railway

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourname/macro-dashboard.git
git push -u origin main
```

### 2. Create the web service

1. Go to [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo**
2. Select your repo
3. Railway auto-detects Node.js via `railway.toml`
4. Click **Deploy**

### 3. Add a persistent volume

1. Click on the web service → **Volumes** tab
2. **Add Volume** → Mount path: `/var/data` → Size: 1GB
3. Railway redeploys automatically

### 4. Set environment variables on the web service

Go to the service → **Variables** tab and add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DB_PATH` | `/var/data/macro.db` |
| `ENCRYPTION_KEY` | generate with `openssl rand -hex 32` |
| `CRON_SECRET` | generate with `openssl rand -hex 24` |
| `FRONTEND_URL` | your Railway domain (add after first deploy) |

### 5. Create the cron services

Create **3 separate services** in the same Railway project, each from the same GitHub repo:

#### Morning brief
- **Service name**: `macro-morning-brief`
- In service Settings → **Config File Path**: `/cron/railway-morning.toml`
- Variables to add:
  - `CRON_SECRET` — same value as the web service
  - `API_URL` — your web service's Railway domain, e.g. `https://macro-dashboard.up.railway.app`

#### Post-event refresh
- **Service name**: `macro-post-event`
- **Config File Path**: `/cron/railway-post-event.toml`
- Same variables: `CRON_SECRET` + `API_URL`

#### Health check
- **Service name**: `macro-health-check`
- **Config File Path**: `/cron/railway-health-check.toml`
- Same variables: `CRON_SECRET` + `API_URL`

> Cron services do **not** need a volume — they talk to the web service API which owns the DB.

### 6. First login

Visit your Railway URL → click **Admin** → **Login**.

First username/password you enter creates the admin account.

### 7. Add an AI provider

Admin → **AI Providers** → fill in:

| Field | Value |
|---|---|
| Name | `GPT-4o` |
| Provider Type | `openai` |
| API Key | your key |
| Model | `gpt-4o` |
| Priority | `1` |

**Save → Test → Enable**

### 8. Run first analysis

Click **↻ Run Now** on the dashboard, or wait for the morning cron.

---

## Local development

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Set up env
cp .env.example backend/.env
# Edit backend/.env — set ENCRYPTION_KEY and CRON_SECRET

# Create DB
mkdir -p data
cd backend && node src/migrations/run.js

# Run backend (port 3001)
npm run dev

# In another terminal — run frontend (port 5173, proxies /api to 3001)
cd frontend && npm run dev
```

---

## Cron schedules

| Service | Config file | Schedule | Purpose |
|---|---|---|---|
| `macro-morning-brief` | `cron/railway-morning.toml` | `0 7 * * 1-5` | Morning run 07:00 UTC Mon–Fri |
| `macro-post-event` | `cron/railway-post-event.toml` | `* * * * *` | Checks for post-event jobs every minute |
| `macro-health-check` | `cron/railway-health-check.toml` | `*/30 * * * *` | Source health ping every 30 min |

Adjust `cronSchedule` in the relevant `.toml` file to change timing.

---

## AI providers supported

| Provider | Type key |
|---|---|
| OpenAI | `openai` |
| Anthropic | `anthropic` |
| Google Gemini | `google` |
| OpenAI-compatible | `openai_compatible` |

Providers fall back in priority order. If all fail, the last cached dashboard is served with a `stale` flag.

---

## Signal states

| State | Meaning |
|---|---|
| `bullish` | Drivers aligned upward, confirmed |
| `bearish` | Drivers aligned downward, confirmed |
| `neutral` | Mixed or unclear |
| `watch` | Early change, not yet confirmed |
| `unconfirmed` | Move occurred, macro regime does not yet support it |
