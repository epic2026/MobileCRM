# Load Testing Kit (Free-Tier Safe)

This folder contains k6 scenarios designed for Supabase + Vercel free plans.

## Why this is safe for free plans

- Default VUs are intentionally low.
- Workload is read-heavy, write-light.
- Tests are staged and short by default.
- You can scale up manually when metrics remain healthy.

## Prerequisites

1. Install k6:
   - macOS: `brew install k6`
2. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Copy the user template and fill real test users:
   - `cp load-testing/data/users.template.json load-testing/data/users.json`
4. Ensure each test user has at least one lead in DB (writes use an existing `lead_id`).

## Scenarios

- `load-testing/scenarios/api-smoke.js`
  - Quick confidence test: login, leads fetch, add activity, add task.

- `load-testing/scenarios/free-ramp.js`
  - Conservative ramp for free tiers.
  - Default peak VUs: 15.

- `load-testing/scenarios/mau-model.js`
  - Simulates up to 10,000 unique monthly users using shared iterations.
  - Does NOT mean 10,000 concurrent users.

## Run commands

### 1) Smoke test

```bash
SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
npm run loadtest:smoke
```

### 2) Free-tier ramp (recommended first)

```bash
SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
npm run loadtest:free
```

### 3) 10,000 MAU behavior model (compressed)

```bash
SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
MAU_TARGET=10000 \
VUS=25 \
ITERATIONS=10000 \
MAX_DURATION=2h \
npm run loadtest:mau
```

## Suggested progression (respect free limits)

1. Run smoke once.
2. Run free ramp 2 to 3 times.
3. Increase only one variable at a time:
   - `STAGE3_TARGET` from 15 to 20
   - then maybe 25
4. Run MAU model after ramp is stable.

## Read this before scaling up

- Free plans can throttle or rate-limit under sustained high RPS.
- If `http_req_failed` rises above 2%, reduce VUs and retry.
- Track Supabase dashboard metrics during runs:
  - database CPU
  - request latency
  - errors by endpoint

## Optional distributed run later

When you move beyond free plans, run k6 distributed (k6 cloud or k8s) for high concurrency tests.
