# Arcade Capacity Test Plan

## Goal
Simulate peak concurrency during exam periods and term starts for arcade gameplay, ad telemetry, and score validation.

## Assumptions
- Peak concurrent sessions: 500
- Session duration: 3-8 minutes
- Score submissions: 1 per session
- Ad impressions: 2-4 per session

## Run Locally
1) Start API and static server.
2) Export API base URL:
   export API_BASE_URL=http://localhost:3001
3) Run the script:
   node scripts/capacity-arcade.mjs

## Parameters
- CAPACITY_CONCURRENCY (default 50)
- CAPACITY_SESSIONS (default 200)
- CAPACITY_AD_EVENTS (default 3)
- CAPACITY_GAME_ID (default quickmath)

## Output
- Total requests, failures, and latency stats.
- Recommended limits and bottlenecks logged to stdout.
