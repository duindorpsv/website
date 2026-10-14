#!/bin/bash
# Run once on the inventoried serving host, from the reviewed repository tree.
set -euo pipefail
target=${1:?Use staging or production}
web_port=${2:?Supply an inventoried free loopback port}
base_url=${3:?Supply the HTTPS URL}
case "$target" in staging|production) ;; *) exit 64 ;; esac
[[ $(id -u) == 0 && $web_port =~ ^[0-9]+$ && $web_port -ge 1024 && $web_port -le 65535 ]] || exit 64
python3 - "$base_url" <<'PY'
import sys,urllib.parse
u=urllib.parse.urlparse(sys.argv[1])
assert u.scheme=='https' and u.hostname and not u.username and not u.password and u.path in ('','/')
PY
for binary in docker dockerd-rootless-setuptool.sh newuidmap newgidmap loginctl visudo restic rclone; do command -v "$binary" >/dev/null; done
[[ -f /sys/fs/cgroup/cgroup.controllers ]]
if ss -H -ltn "sport = :$web_port" | read -r _; then printf 'Chosen port is already used\n' >&2; exit 65; fi
app_user="duindorp-$target"
runner_user="duindorp-runner-$target"
# Existing identities require inspection; never adopt another application's user.
if getent passwd "$app_user" >/dev/null || getent passwd "$runner_user" >/dev/null; then printf 'Application or runner identity already exists; inspect it first\n' >&2; exit 65; fi
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
useradd --create-home --shell /bin/bash "$app_user"
useradd --create-home --shell /bin/bash "$runner_user"
app_uid=$(id -u "$app_user")
app_group=$(id -gn "$app_user")
loginctl enable-linger "$app_user"
systemctl start "user@$app_uid.service"
runuser -u "$app_user" -- env XDG_RUNTIME_DIR="/run/user/$app_uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$app_uid/bus" dockerd-rootless-setuptool.sh install
install -d -o root -g root -m 0755 /usr/local/libexec/duindorp
install -o root -g root -m 0755 "$script_dir/deploy.py" "/usr/local/libexec/duindorp/duindorp-deploy-$target"
install -o root -g root -m 0644 "$script_dir/release.py" /usr/local/libexec/duindorp/release.py
install -d -o root -g "$app_group" -m 0750 "/etc/duindorp/$target"
install -o root -g "$app_group" -m 0640 "$script_dir/../compose.yml" "/etc/duindorp/$target/compose.yml"
install -o root -g "$app_group" -m 0750 "$script_dir/backup.sh" "/etc/duindorp/$target/backup.sh"
install -d -o "$app_user" -g "$app_group" -m 0700 "/var/lib/duindorp/$target"
python3 - "$target" "$app_uid" "$web_port" "$base_url" <<'PY'
import json,pathlib,sys
target,uid,port,url=sys.argv[1:]
file=pathlib.Path('/etc/duindorp')/target/'deploy.json'
file.write_text(json.dumps({'dockerHost':'unix:///run/user/'+uid+'/docker.sock','webPort':int(port),'baseUrl':url},indent=2)+'\n')
PY
chown root:"$app_group" "/etc/duindorp/$target/deploy.json"
chmod 0640 "/etc/duindorp/$target/deploy.json"
sudoers_file=$(mktemp)
trap 'rm -f "$sudoers_file"' EXIT
printf '%s ALL=(%s) NOPASSWD: /usr/local/libexec/duindorp/duindorp-deploy-%s ""\n' "$runner_user" "$app_user" "$target" > "$sudoers_file"
visudo -cf "$sudoers_file" >/dev/null
install -o root -g root -m 0440 "$sudoers_file" "/etc/sudoers.d/duindorp-$target"
printf 'Scoped identities, rootless engine and deployment wrapper installed for %s. Configure protected runtime/migration/backup files and register the matching runner before deploying.\n' "$target"
