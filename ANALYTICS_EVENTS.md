# Arcade Analytics Event Schema (v1)

This schema defines the revenue-grade analytics events for Project Odysseus Arcade.

## Event Types
- ad_impression
- ad_click
- reward_completed
- game_session_start
- game_session_end
- score_submitted
- score_validated

## Required Fields
- event_id: UUID
- event_type: string
- occurred_at: ISO 8601 timestamp
- session_id: UUID (nullable)
- user_id: UUID (nullable)
- anon_id: string (nullable)
- source: string
- dedupe_key: string (idempotent key)

At least one of user_id or anon_id must be present.

## Dedupe Strategy
- dedupe_key = event_id
- Clients MUST reuse the same event_id on retries.

## Ad Event Extensions
- placement
- provider
- creative_id
- variant_id
- payload (creative metadata, CLS guard signals, etc)

## Gameplay Event Extensions
- payload (run_seed, duration_ms, event_count, etc)

## Ingestion Rules
- Events are idempotent by dedupe_key.
- Gameplay and ad telemetry are stored in separate tables.
- Correlation is allowed only via session_id.
