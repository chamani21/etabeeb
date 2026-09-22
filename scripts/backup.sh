#!/bin/bash
# eTabeeb PostgreSQL Backup Script
# Run daily via cron: 0 2 * * * /path/to/backup.sh

set -euo pipefail

# Configuration
DB_CONTAINER="etabeeb-db"
DB_USER="etabeeb"
DB_NAME="etabeeb"
BACKUP_DIR="/backups"
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/etabeeb_${DATE}.sql.gz"

echo "[$(date)] Starting backup..."

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Dump and compress
docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_FILE}"

# Verify backup
if [ -s "${BACKUP_FILE}" ]; then
    SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "[$(date)] Backup complete: ${BACKUP_FILE} (${SIZE})"
else
    echo "[$(date)] ERROR: Backup file is empty!"
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Remove old backups
find "${BACKUP_DIR}" -name "etabeeb_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned backups older than ${RETENTION_DAYS} days"

# Count remaining backups
COUNT=$(find "${BACKUP_DIR}" -name "etabeeb_*.sql.gz" | wc -l)
echo "[$(date)] Total backups on disk: ${COUNT}"
