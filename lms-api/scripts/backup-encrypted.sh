#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "BACKUP_PASSPHRASE is required" >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"

stamp=$(date -u +"%Y%m%dT%H%M%SZ")
file="$backup_dir/lms-backup-$stamp.sql.gpg"

echo "[backup] writing encrypted backup to $file"
pg_dump "$DATABASE_URL" | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$file"

sha256sum "$file" > "$file.sha256"

echo "[backup] done"
