#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --file "$BACKUP_DIR/carpooling-$STAMP.dump" "$DATABASE_URL"
find "$BACKUP_DIR" -type f -name 'carpooling-*.dump' -mtime "+$RETENTION_DAYS" -delete
echo "Created $BACKUP_DIR/carpooling-$STAMP.dump"
