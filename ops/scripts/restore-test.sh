#!/bin/sh
set -eu
# Development-only synthetic restore; no production/source DB is overwritten.
mkdir -p .runtime/restore
chmod 700 .runtime/restore
docker exec duindorp-cms-development-database-1 pg_dump -U duindorp -d duindorp --format=custom > .runtime/restore/database.dump
docker exec duindorp-cms-development-database-1 dropdb -U duindorp --if-exists duindorp_restore_test
docker exec duindorp-cms-development-database-1 psql -U duindorp -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE duindorp_restore_test'
docker exec -i duindorp-cms-development-database-1 pg_restore -U duindorp -d duindorp_restore_test --no-owner --no-privileges < .runtime/restore/database.dump
mkdir -p .runtime/restore/media
cp -a .runtime/media/. .runtime/restore/media/
printf 'Synthetic restore completed in isolated duindorp_restore_test\n'
