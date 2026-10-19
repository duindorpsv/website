"""Offline validation of the serving-host checks and deployment identity boundary."""
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import host_check
import deploy


class HostSetupTests(unittest.TestCase):
    def test_supplied_subordinate_ranges_are_disjoint(self):
        ranges = "duindorpsv-staging:296608:65536\nduindorpsv-production:362144:65536\n"
        for name in ("duindorpsv-staging", "duindorpsv-production"):
            host_check.validate_ranges(ranges, name)

    def test_rejects_overlap_with_another_project_or_duplicate_range(self):
        for other in ("another-site:320000:65536", "duindorpsv-staging:320000:65536"):
            with self.subTest(other=other), self.assertRaisesRegex(ValueError, "Overlapping"):
                host_check.validate_ranges("duindorpsv-staging:296608:65536\n" + other,
                                           "duindorpsv-staging")

    def test_rejects_missing_or_short_range(self):
        for ranges in ("", "another-site:100000:65536", "duindorpsv-staging:296608:65535"):
            with self.subTest(ranges=ranges), self.assertRaises(ValueError):
                host_check.validate_ranges(ranges, "duindorpsv-staging")

    def test_rootless_engine_and_required_limits(self):
        expected = "/srv/duindorpsv/staging/docker"
        info = dict(SecurityOptions=["name=seccomp,profile=builtin", "name=rootless", "name=cgroupns"],
                    CgroupDriver="systemd", CgroupVersion="2", DockerRootDir=expected,
                    MemoryLimit=True, PidsLimit=True, CpuCfsQuota=True, CpuCfsPeriod=True)
        host_check.validate_engine(info, expected)
        invalid_values = dict(SecurityOptions=["name=seccomp"], CgroupDriver="none",
                              CgroupVersion="1", DockerRootDir="/srv/duindorpsv/production/docker",
                              MemoryLimit=False, PidsLimit=False, CpuCfsQuota=False, CpuCfsPeriod=False)
        for key, value in invalid_values.items():
            with self.subTest(key=key), self.assertRaises(ValueError):
                host_check.validate_engine({**info, key: value}, expected)

    def test_missing_or_non_boolean_docker_capabilities_are_rejected(self):
        expected = "/srv/duindorpsv/production/docker"
        info = dict(SecurityOptions=["name=rootless"], CgroupDriver="systemd",
                    CgroupVersion="2", DockerRootDir=expected, MemoryLimit=True,
                    PidsLimit=True, CpuCfsQuota=True, CpuCfsPeriod=True)
        for capability in ("MemoryLimit", "PidsLimit", "CpuCfsQuota", "CpuCfsPeriod"):
            missing = {key: value for key, value in info.items() if key != capability}
            with self.subTest(capability=capability, value="missing"):
                with self.assertRaisesRegex(ValueError, capability):
                    host_check.validate_engine(missing, expected)
            for value in (None, False, 1, "true"):
                with self.subTest(capability=capability, value=value):
                    with self.assertRaisesRegex(ValueError, capability):
                        host_check.validate_engine({**info, capability: value}, expected)

    def test_accepts_only_expected_target_port_and_https_origin(self):
        with self.assertRaises(ValueError):
            host_check.validate_target("staging", "3112", "https://staging.duindorpsv.nl")
        host_check.validate_target("production", "3113", "https://duindorpsv.nl/")
        bad = [("../production", "3112", "https://example.org"),
               ("production", "443", "https://example.org"),
               ("production", "65536", "https://example.org"),
               ("production", "3;id", "https://example.org"),
               ("production", "3112", "http://example.org"),
               ("production", "3112", "https://user:secret@example.org"),
               ("production", "3112", "https://example.org/path"),
               ("production", "3112", "https://example.org?token=secret"),
               ("production", "3112", "https://example.org#fragment"),
               ("production", "3112", "https://example.org:broken")]
        for args in bad:
            with self.subTest(args=args), self.assertRaises(ValueError):
                host_check.validate_target(*args)

    def test_deploy_accepts_application_identity_then_validates_input(self):
        for target in ("production",):
            account = SimpleNamespace(pw_name="duindorpsv-" + target)
            with self.subTest(target=target), patch.object(deploy.pwd, "getpwuid", return_value=account):
                with self.assertRaisesRegex(ValueError, "Invalid request"):
                    deploy.deploy(target, {})

    def test_deploy_rejects_runner_root_legacy_and_other_environment(self):
        for target in ("staging", "production"):
            other = "production" if target == "staging" else "staging"
            for name in ("root", "runner-duindorpsv-" + target, "duindorp-" + target, "duindorpsv-" + other):
                with self.subTest(target=target, name=name):
                    with patch.object(deploy.pwd, "getpwuid", return_value=SimpleNamespace(pw_name=name)):
                        with self.assertRaises(PermissionError):
                            deploy.deploy(target, {})

    def test_installer_shell_syntax_and_invalid_arguments(self):
        installer = str(SCRIPTS / "install-host.sh")
        subprocess.run(["bash", "-n", installer], check=True)
        for args in ([], ["staging", "3112", "https://example.org", "--force"]):
            result = subprocess.run(["bash", installer, *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 64)


if __name__ == "__main__":
    unittest.main()
