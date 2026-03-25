# PITR Strategy And Restore Verification

## PITR Baseline

- Enable WAL archiving on production Postgres.
- Retain WAL archives aligned to recovery objective requirements.
- Keep encrypted logical backups as a secondary recovery path.

## Recovery Objectives

- Target RPO: <= 15 minutes.
- Target RTO: <= 60 minutes for critical API recovery.

## Backup Controls

- Encrypted backup generation script: `lms-api/scripts/backup-encrypted.sh`.
- Backup integrity hash: `.sha256` artifact alongside backup file.
- Access controls: backup passphrase stored in secure secret manager.
- Query diagnostics: enable `pg_stat_statements` where possible to support post-restore performance verification.

## Restore Procedure

1. Provision isolated restore target.
2. Restore latest base backup.
3. Replay WAL to target timestamp.
4. Run schema migration checks and readiness checks.
5. Execute restore verification script.

## Automated Verification

- Script: `npm run restore:verify --prefix lms-api`.
- Checks: DB connectivity, migration table readability, critical table presence.

## Drill Evidence Requirements

- Drill timestamp, operator, and environment.
- Target recovery timestamp used.
- Verification output artifact.
- Pass/fail outcome and remediation notes.
