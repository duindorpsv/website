#!/bin/sh
set -eu
case "${1:-web}" in provision) exec node /app/runtime/provision.mjs ;;
  migrate) ;; *) node /app/runtime/runtime-validate.mjs ;; esac
case "${1:-web}" in
  web) exec node /app/server.js ;;
  worker) exec node /app/runtime/worker.mjs ;;
  migrate) exec node /app/runtime/migrate.mjs ;;
  seed) exec node /app/runtime/seed.mjs ;;
  owner) exec node /app/runtime/owner.mjs ;;
  *) echo 'Unsupported runtime command' >&2; exit 64 ;;
esac
