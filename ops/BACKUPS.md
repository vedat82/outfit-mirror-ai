# Production backups

`backup-production.sh` creates daily, application-consistent backups for both
production data stores without embedding credentials:

- Outfit Mirror AI: SQLite online backup plus `PRAGMA integrity_check`
- Mini CRM: PostgreSQL custom-format `pg_dump` plus `pg_restore --list`
- SHA-256 checksum files for every artifact
- 14-day local retention by default
- A non-blocking lock to prevent overlapping runs

The production installation lives at `/opt/veerapps/backups`. The `deploy`
user's crontab runs it daily and appends output to
`/opt/veerapps/backups/logs/backup.log`.

## Inspect backups

```sh
find /opt/veerapps/backups/outfit /opt/veerapps/backups/crm -type f -maxdepth 1 -ls
tail -n 100 /opt/veerapps/backups/logs/backup.log
```

## Restore rehearsal

Never overwrite production data during a rehearsal. Restore into a temporary
SQLite file or a temporary PostgreSQL database, validate it, then remove the
temporary target. A production restore should first stop the affected API and
preserve the current database as a rollback copy.

Run the non-destructive rehearsal with:

```sh
/opt/veerapps/backups/verify-production-backups.sh
```

These backups are stored on the VPS. They protect against application and data
mistakes, but not total VPS loss. Replicating encrypted copies to separate
object storage is the next infrastructure step.
