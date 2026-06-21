#!/usr/bin/env bash

set -Eeuo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/opt/veerapps/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
OUTFIT_CONTAINER="${OUTFIT_CONTAINER:-outfit-mirror-ai-api-1}"
CRM_DB_CONTAINER="${CRM_DB_CONTAINER:-mini-crm-postgres-1}"
CRM_DB_USER="${CRM_DB_USER:-mini_crm}"
CRM_DB_NAME="${CRM_DB_NAME:-mini_crm}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_ROOT/outfit" "$BACKUP_ROOT/crm" "$BACKUP_ROOT/logs"
exec 9>"$BACKUP_ROOT/.backup.lock"
flock -n 9 || {
  echo "[$(date -u --iso-8601=seconds)] Backup already running; skipping."
  exit 0
}

log() {
  echo "[$(date -u --iso-8601=seconds)] $*"
}

require_running_container() {
  local container="$1"
  if [[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)" != "true" ]]; then
    log "ERROR: required container is not running: $container"
    return 1
  fi
}

backup_outfit() {
  local remote_file="/data/.outfits-${STAMP}.sqlite"
  local local_file="$BACKUP_ROOT/outfit/outfits-${STAMP}.sqlite"

  log "Creating Outfit SQLite backup."
  docker exec -e BACKUP_FILE="$remote_file" "$OUTFIT_CONTAINER" node --input-type=module -e '
    import { backup, DatabaseSync } from "node:sqlite";
    const source = new DatabaseSync("/data/outfits.db");
    await backup(source, process.env.BACKUP_FILE);
    source.close();
    const copy = new DatabaseSync(process.env.BACKUP_FILE, { readOnly: true });
    const result = copy.prepare("PRAGMA integrity_check").get();
    copy.close();
    if (result.integrity_check !== "ok") throw new Error("SQLite integrity check failed");
  '
  docker cp "$OUTFIT_CONTAINER:$remote_file" "$local_file"
  docker exec "$OUTFIT_CONTAINER" rm -f "$remote_file"
  gzip "$local_file"
  sha256sum "${local_file}.gz" > "${local_file}.gz.sha256"
  log "Outfit backup verified: ${local_file}.gz"
}

backup_crm() {
  local local_file="$BACKUP_ROOT/crm/mini-crm-${STAMP}.dump"
  local remote_file="/tmp/mini-crm-${STAMP}.dump"

  log "Creating CRM PostgreSQL backup."
  docker exec "$CRM_DB_CONTAINER" pg_dump \
    --username="$CRM_DB_USER" \
    --dbname="$CRM_DB_NAME" \
    --format=custom \
    --no-owner \
    --no-acl > "$local_file"
  docker cp "$local_file" "$CRM_DB_CONTAINER:$remote_file"
  docker exec "$CRM_DB_CONTAINER" pg_restore --list "$remote_file" >/dev/null
  docker exec "$CRM_DB_CONTAINER" rm -f "$remote_file"
  sha256sum "$local_file" > "${local_file}.sha256"
  log "CRM backup verified: $local_file"
}

remove_expired_backups() {
  find "$BACKUP_ROOT/outfit" "$BACKUP_ROOT/crm" \
    -type f -mtime "+$RETENTION_DAYS" -delete
  log "Expired backups removed (retention: ${RETENTION_DAYS} days)."
}

require_running_container "$OUTFIT_CONTAINER"
require_running_container "$CRM_DB_CONTAINER"
backup_outfit
backup_crm
remove_expired_backups
log "Production backup completed successfully."
