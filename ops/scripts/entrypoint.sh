#!/bin/sh
set -eu
case "${1:-web}" in provision) exec node /app/provision.mjs ;;
  migrate) ;; *) node /app/runtime-validate.mjs ;; esac
case "${1:-web}" in
  web) exec node /app/server.js ;;
  worker) exec node /app/worker.mjs ;;
  migrate) exec node /app/migrate.mjs ;;
  seed) exec node /app/seed.mjs ;;
  owner) exec node /app/owner.mjs ;;
  *) echo 'Unsupported runtime command' >&2; exit 64 ;;
esac
