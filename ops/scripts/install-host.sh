#!/bin/bash
# Attach fixed deployment scripts to the already prepared serving host.
set -euo pipefail
umask 077
if [[ $# -lt 3 || $# -gt 4 || ${4:-} != '' && ${4:-} != '--check' ]]; then
  printf 'Usage: sudo bash install-host.sh staging|production PORT HTTPS_ORIGIN [--check]\n' >&2
  exit 64
fi
[[ $(id -u) == 0 ]] || { printf 'Run with sudo\n' >&2; exit 64; }
target=$1
web_port=$2
base_url=$3
for binary in python3 runuser docker systemctl ss visudo restic rclone; do
  command -v "$binary" >/dev/null || {
    printf 'Missing prerequisite: %s\n' "$binary" >&2
    exit 65
  }
done
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
python3 "$script_dir/host_check.py" "$target" "$web_port" "$base_url"
app_user="duindorpsv-$target"
runner_user="runner-duindorpsv-$target"
app_uid=$(id -u "$app_user")
app_group=$(id -gn "$app_user")
config_dir="/etc/duindorp/$target"
state_dir="/var/lib/duindorp/$target"
wrapper="/usr/local/libexec/duindorp/duindorp-deploy-$target"
sudoers_path="/etc/sudoers.d/duindorp-$target"

# Do not replace an existing deployment, configuration, state or sudo grant.
for path in "$config_dir" "$state_dir" "$wrapper" "$sudoers_path"; do
  if [[ -e $path || -L $path ]]; then
    printf 'Already exists; inspect before changing: %s\n' "$path" >&2
    exit 65
  fi
done
for path in /etc/duindorp /var/lib/duindorp /usr/local/libexec/duindorp; do
  if [[ -e $path || -L $path ]]; then
    [[ -d $path && ! -L $path && $(stat -c %u "$path") == 0 ]]
    mode=$(stat -c %a "$path")
    (( (8#$mode & 0022) == 0 ))
  fi
done
shared_release=/usr/local/libexec/duindorp/release.py
if [[ -e $shared_release || -L $shared_release ]]; then
  [[ -f $shared_release && ! -L $shared_release && $(stat -c %u "$shared_release") == 0 ]]
  mode=$(stat -c %a "$shared_release")
  (( (8#$mode & 0022) == 0 ))
  cmp -s "$script_dir/release.py" "$shared_release" || {
    printf 'Shared release.py differs; review an upgrade for both environments first\n' >&2
    exit 65
  }
fi
for source in deploy.py release.py backup.sh ../compose.yml; do test -f "$script_dir/$source"; done
if [[ ${4:-} == '--check' ]]; then
  printf 'Preflight passed. No files or services changed. Port %s is currently free; confirm its reservation and the URL %s before installation.\n' "$web_port" "$base_url"
  exit 0
fi

sudoers_file=$(mktemp)
trap 'rm -f "$sudoers_file"' EXIT
printf '%s ALL=(%s) NOPASSWD: /usr/local/libexec/duindorp/duindorp-deploy-%s ""\n' \
  "$runner_user" "$app_user" "$target" > "$sudoers_file"
visudo -cf "$sudoers_file" >/dev/null
install -d -o root -g root -m 0755 /usr/local/libexec/duindorp /etc/duindorp /var/lib/duindorp
install -o root -g root -m 0755 "$script_dir/deploy.py" "$wrapper"
if [[ ! -e $shared_release ]]; then
  install -o root -g root -m 0644 "$script_dir/release.py" "$shared_release"
fi
install -d -o root -g "$app_group" -m 0750 "$config_dir"
install -o root -g "$app_group" -m 0640 "$script_dir/../compose.yml" "$config_dir/compose.yml"
install -o root -g "$app_group" -m 0750 "$script_dir/backup.sh" "$config_dir/backup.sh"
install -d -o "$app_user" -g "$app_group" -m 0700 "$state_dir"
python3 - "$config_dir/deploy.json" "$app_uid" "$web_port" "$base_url" <<'PY'
import json,pathlib,sys
file,uid,port,url=sys.argv[1:]
pathlib.Path(file).write_text(json.dumps({'dockerHost':'unix:///run/user/'+uid+'/docker.sock','webPort':int(port),'baseUrl':url},indent=2)+'\n')
PY
chown root:"$app_group" "$config_dir/deploy.json"
chmod 0640 "$config_dir/deploy.json"
install -o root -g root -m 0440 "$sudoers_file" "$sudoers_path"
printf 'Deployment scripts attached to %s. Configure private runtime/migration/backup files and bootstrap the database before the first deployment. No application release was started.\n' "$target"
