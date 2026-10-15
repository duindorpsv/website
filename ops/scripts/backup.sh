#!/bin/sh
set -eu
# Installed root-owned entrypoint; no sourced shell configuration or user paths.
exec /usr/bin/python3 /usr/local/libexec/duindorp/backup.py
