#!/bin/sh
set -eu
# Installed per environment, inaccessible to runner; receives no user paths.
# Configure RESTIC_* and DB backup connection in /etc/duindorp/<env>/backup.env.
: "${DUINDORP_BACKUP_ENV:?Set fixed installed environment name}"
case "$DUINDORP_BACKUP_ENV" in staging|production) ;; *) exit 64 ;; esac
set -a
. "/etc/duindorp/$DUINDORP_BACKUP_ENV/backup.env"
set +a
umask 077
backup_dir=$(mktemp -d)
trap 'rm -rf "$backup_dir"' EXIT HUP INT TERM
docker compose -p "duindorp-$DUINDORP_BACKUP_ENV" -f "/etc/duindorp/$DUINDORP_BACKUP_ENV/compose.yml" exec -T database pg_dump -U duindorp_migration -d duindorp --format=custom > "$backup_dir/database.dump"
# rclone remote must target this environment's private bucket, not another site.
rclone sync "$MEDIA_BACKUP_SOURCE" "$backup_dir/media" --quiet
restic backup "$backup_dir" --tag "duindorp-$DUINDORP_BACKUP_ENV" --quiet
restic forget --tag "duindorp-$DUINDORP_BACKUP_ENV" --keep-daily 14 --prune --quiet
