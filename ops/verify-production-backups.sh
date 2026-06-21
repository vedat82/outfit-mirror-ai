#!/usr/bin/env bash

set -Eeuo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/opt/veerapps/backups}"
OUTFIT_CONTAINER="${OUTFIT_CONTAINER:-outfit-mirror-ai-api-1}"
CRM_DB_CONTAINER="${CRM_DB_CONTAINER:-mini-crm-postgres-1}"
CRM_DB_USER="${CRM_DB_USER:-mini_crm}"
OUTFIT_BACKUP="$(find "$BACKUP_ROOT/outfit" -name '*.sqlite.gz' | sort | tail -1)"
CRM_BACKUP="$(find "$BACKUP_ROOT/crm" -name '*.dump' | sort | tail -1)"
OUTFIT_TEMP="/tmp/outfit-restore-check.sqlite"
CRM_TEMP="/tmp/mini-crm-restore-check.dump"
CRM_RESTORE_DB="mini_crm_restore_check"

[[ -n "$OUTFIT_BACKUP" && -n "$CRM_BACKUP" ]]
sha256sum -c "${OUTFIT_BACKUP}.sha256"
sha256sum -c "${CRM_BACKUP}.sha256"

cleanup() {
  rm -f "$OUTFIT_TEMP"
  docker exec "$OUTFIT_CONTAINER" rm -f "$OUTFIT_TEMP" >/dev/null 2>&1 || true
  docker exec "$CRM_DB_CONTAINER" dropdb -U "$CRM_DB_USER" --if-exists "$CRM_RESTORE_DB" >/dev/null 2>&1 || true
  docker exec "$CRM_DB_CONTAINER" rm -f "$CRM_TEMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

gunzip -c "$OUTFIT_BACKUP" > "$OUTFIT_TEMP"
docker cp "$OUTFIT_TEMP" "$OUTFIT_CONTAINER:$OUTFIT_TEMP"
docker exec "$OUTFIT_CONTAINER" node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const db = new DatabaseSync("/tmp/outfit-restore-check.sqlite", { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  const tables = db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = $type").get({ $type: "table" }).count;
  db.close();
  if (integrity !== "ok" || tables < 1) process.exit(1);
  console.log(JSON.stringify({ database: "outfit", integrity, tables }));
'

docker cp "$CRM_BACKUP" "$CRM_DB_CONTAINER:$CRM_TEMP"
docker exec "$CRM_DB_CONTAINER" dropdb -U "$CRM_DB_USER" --if-exists "$CRM_RESTORE_DB"
docker exec "$CRM_DB_CONTAINER" createdb -U "$CRM_DB_USER" "$CRM_RESTORE_DB"
docker exec "$CRM_DB_CONTAINER" pg_restore -U "$CRM_DB_USER" -d "$CRM_RESTORE_DB" "$CRM_TEMP"
CRM_TABLE_COUNT="$(docker exec "$CRM_DB_CONTAINER" psql -U "$CRM_DB_USER" -d "$CRM_RESTORE_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
[[ "$CRM_TABLE_COUNT" -gt 0 ]]
echo "{\"database\":\"crm\",\"tables\":${CRM_TABLE_COUNT}}"
echo "Production backup restore rehearsal passed."
