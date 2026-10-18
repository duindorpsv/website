#!/usr/bin/env python3
"""Read-only checks before attaching deployment to the prepared serving host."""
import grp
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys
from urllib.parse import urlsplit


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_target(target, port, base_url):
    require(target == "production", "Choose production")
    require(port.isascii() and port.isdecimal() and 1024 <= int(port) <= 65535,
            "Use an unprivileged web port between 1024 and 65535")
    url = urlsplit(base_url)
    require(url.scheme == "https" and url.hostname and not url.username
            and not url.password and url.path in ("", "/")
            and not url.query and not url.fragment and url.port in (None, 443)
            and not any(char.isspace() for char in base_url),
            "Use an HTTPS origin without credentials, path, query or fragment")


def validate_ranges(contents, username):
    ranges = []
    for line in contents.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        owner, start, count = line.split(":")
        start, count = int(start), int(count)
        require(start >= 0 and count > 0, "Invalid subordinate ID range")
        ranges.append((owner, start, start + count))
    own = [entry for entry in ranges if entry[0] == username]
    require(sum(end - start for _, start, end in own) >= 65536,
            "Missing subordinate ID range for " + username)
    for index, (owner, start, end) in enumerate(ranges):
        if owner == username:
            for other_index, (_, other_start, other_end) in enumerate(ranges):
                if other_index != index:
                    require(end <= other_start or start >= other_end,
                            "Overlapping subordinate ID ranges for " + username)


def validate_engine(info, data_root):
    require("name=rootless" in info.get("SecurityOptions", []),
            "Docker daemon is not rootless")
    require(info.get("CgroupDriver") == "systemd"
            and str(info.get("CgroupVersion")) == "2", "Require systemd and cgroup v2")
    require(info.get("DockerRootDir") == str(data_root), "Unexpected Docker data root")
    for capability in ("MemoryLimit", "PidsLimit", "CPUCfsQuota", "CPUCfsPeriod"):
        require(info.get(capability) is True, "Missing Docker resource support: " + capability)


def output(*arguments):
    result = subprocess.run(arguments, check=True, capture_output=True, text=True, timeout=20)
    return result.stdout.strip()


def directory(path, uid, private=False):
    entry = path.lstat()
    require(stat.S_ISDIR(entry.st_mode) and entry.st_uid == uid,
            "Unexpected directory or owner: " + str(path))
    require(not (entry.st_mode & (0o077 if private else 0o022)),
            "Directory permissions are too broad: " + str(path))


def check(target, port, base_url):
    validate_target(target, port, base_url)
    require(os.geteuid() == 0, "Run this host check using sudo")
    app_name = "duindorpsv-" + target
    runner_name = "runner-duindorpsv-" + target
    app, runner = pwd.getpwnam(app_name), pwd.getpwnam(runner_name)
    require(app.pw_uid > 0 and runner.pw_uid > 0 and app.pw_uid != runner.pw_uid,
            "Application and runner must have separate non-root identities")
    for account in (app, runner):
        require(account.pw_dir == "/home/" + account.pw_name, "Unexpected account home")
        groups = {grp.getgrgid(gid).gr_name for gid in os.getgrouplist(account.pw_name, account.pw_gid)}
        require(not groups.intersection({"root", "sudo", "docker", "lxd"}),
                "Privileged group on " + account.pw_name)
        directory(Path(account.pw_dir), account.pw_uid, private=True)
    for filename in ("/etc/subuid", "/etc/subgid"):
        validate_ranges(Path(filename).read_text(), app_name)
    require(Path("/sys/fs/cgroup/cgroup.controllers").is_file(), "cgroup v2 is unavailable")
    directory(Path("/srv/duindorpsv"), 0)
    data_root = Path("/srv/duindorpsv") / target / "docker"
    directory(data_root.parent, app.pw_uid)
    directory(data_root, app.pw_uid)
    runtime = Path("/run/user") / str(app.pw_uid)
    directory(runtime, app.pw_uid, private=True)
    socket = runtime / "docker.sock"
    entry = socket.lstat()
    require(stat.S_ISSOCK(entry.st_mode) and entry.st_uid == app.pw_uid
            and not (entry.st_mode & 0o007), "Invalid rootless Docker socket")
    unit = "actions.runner.duindorpsv-website.duindorpsv-" + target + "-01.service"
    service = dict(line.split("=", 1) for line in output(
        "systemctl", "show", unit, "--property=User", "--property=ActiveState").splitlines())
    require(service.get("User") == runner_name and service.get("ActiveState") == "active",
            "Runner service is not active under the expected account")
    info = json.loads(output("runuser", "-u", app_name, "--", "env",
                             "-u", "DOCKER_HOST", "-u", "DOCKER_CONTEXT", "-u", "DOCKER_CONFIG",
                             "docker", "--host", "unix://" + str(socket), "info", "--format", "{{json .}}"))
    validate_engine(info, data_root)
    require(not output("ss", "-H", "-ltn", "sport = :" + port), "Web port is already listening")
    print("Host check OK: " + target + "; runner=" + runner_name
          + "; application=" + app_name + "; data=" + str(data_root))


if __name__ == "__main__":
    try:
        require(len(sys.argv) == 4, "Usage: host_check.py production PORT HTTPS_ORIGIN")
        check(*sys.argv[1:])
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        # No command stdout/stderr: Docker info can contain private proxy settings.
        message = str(error) if isinstance(error, ValueError) else type(error).__name__
        print("Host check failed: " + message, file=sys.stderr)
        sys.exit(1)
