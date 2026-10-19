#!/bin/bash
# Run manually on the production VPS after the first healthy deployment.
set -euo pipefail
[[ $(id -u) == 0 ]] || { printf 'Gebruik: sudo bash ops/scripts/create-production-owner.sh\n' >&2; exit 64; }
[[ -t 0 && -t 1 ]] || { printf 'Voer dit uit in een interactieve terminal.\n' >&2; exit 64; }
app_user=duindorpsv-production
app_uid=$(id -u "$app_user")
[[ $app_uid != 0 ]]
socket="unix:///run/user/$app_uid/docker.sock"
app_docker=(runuser -u "$app_user" -- env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_CONFIG docker --host "$socket")
mapfile -t containers < <("${app_docker[@]}" ps -q --filter label=com.docker.compose.project=duindorp-production --filter label=com.docker.compose.service=web)
[[ ${#containers[@]} == 1 && -n ${containers[0]} ]] || { printf 'Er moet precies één draaiende Duindorp-productiewebcontainer zijn.\n' >&2; exit 65; }
exec "${app_docker[@]}" exec --interactive --tty "${containers[0]}" /app/entrypoint.sh owner
