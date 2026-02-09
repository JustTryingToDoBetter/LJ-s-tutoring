# Data Retention and Deletion

This document describes how the platform handles data retention and privacy requests. It reflects the current production behavior and the scheduled cleanup job.

## Retention Policy (Configurable)

Retention is controlled by environment variables in the API service:

- `RETENTION_SESSIONS_YEARS` (default 7)
- `RETENTION_SESSION_HISTORY_YEARS` (default 7)
- `RETENTION_INVOICES_YEARS` (default 7)
- `RETENTION_AUDIT_YEARS` (default 5)
- `RETENTION_MAGIC_LINK_DAYS` (default 30)
- `RETENTION_PRIVACY_REQUESTS_YEARS` (default 3)

Cutoffs are calculated from the current time. The admin Retention page shows current values and eligible counts.

## What Gets Cleaned Up

Scheduled cleanup removes or anonymizes data that falls outside the retention windows.

### Deleted
- Magic link tokens with `expires_at` before the cutoff.
- Audit log entries older than the audit retention window.
- Session history entries older than the session history retention window.
- Invoice lines and invoices with `period_end` before the invoice cutoff.
- Adjustments older than the invoice cutoff, if no remaining invoice line references exist.
- Pay periods older than the invoice cutoff with no remaining adjustments.
- Sessions older than the session retention cutoff, only when they are not referenced by invoice lines.
- Privacy requests older than the privacy request retention window.

### Anonymized
- Tutor and student profiles are anonymized if their latest sessions and invoices are older than retention cutoffs.
- Anonymization removes names and contact data and scrubs session notes/locations.
- Invoice line descriptions tied to anonymized sessions are replaced with a neutral label.

## Privacy Request Workflow

Admin requests are tracked in the `privacy_requests` table.

### Request Types
- **ACCESS**: export data in JSON for the requested subject.
- **CORRECTION**: update tutor or student data using an admin-supplied correction payload.
- **DELETION**: delete data when allowed; otherwise anonymize due to retention constraints.

### Access Requests
Exports include tutor/student data and linked sessions, assignments, invoices, and history where applicable. Export output is delivered as JSON via the admin endpoint.

### Deletion Requests
If any in-scope financial records must be retained, the subject is anonymized instead of deleted. If no in-scope records remain, related data is removed.

## Operational Process

1. Create a privacy request in the admin UI.
2. Export data (for access requests).
3. Apply corrections (for correction requests).
4. Close the request with an outcome (fulfilled, corrected, deleted, anonymized, or rejected).
5. Audit logs are written for each request action.

## Running Cleanup

The cleanup script is designed for cron or scheduled GitHub Actions:

```bash
npm run retention:cleanup --prefix lms-api
```

Ensure `DATABASE_URL` and retention env vars are set in the runtime environment.

## Backup Encryption and Retention

Backups must be encrypted at rest. The API repository includes an encrypted backup helper:

```bash
BACKUP_PASSPHRASE=change_me DATABASE_URL=... \
	./lms-api/scripts/backup-encrypted.sh
```

Store encrypted backups in a restricted location with access limited to admins.

Suggested schedule:

- Nightly encrypted backup with 30-day retention.
- Monthly encrypted backup with 12-month retention.

## Retention Verification Evidence

Each cleanup run writes an evidence record to the `retention_events` table. The admin Retention page surfaces the latest event and deletion counts for audit readiness.
