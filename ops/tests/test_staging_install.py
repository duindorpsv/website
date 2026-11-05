"""Real temporary-file installation checks; no real host or deployment commands."""
from contextlib import ExitStack, redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

REAL_RUN = subprocess.run

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location('staging_install', SCRIPTS / 'install-staging-host.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class StagingInstallTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.stack.enter_context(patch.object(installer, 'ROOT', self.root))
        self.stack.enter_context(patch.object(installer, 'ROOT_OWNER', os.getuid()))
        self.stack.enter_context(patch.object(installer.os, 'geteuid', return_value=0))
        self.stack.enter_context(patch.object(installer.shutil, 'which', return_value='/synthetic/binary'))
        self.stack.enter_context(patch.object(installer.pwd, 'getpwnam', return_value=SimpleNamespace(
            pw_uid=os.getuid(), pw_gid=os.getgid())))
        self.check = self.stack.enter_context(patch.object(installer.host_check, 'check'))
        self.command = self.stack.enter_context(patch.object(installer.subprocess, 'run'))
        self.stack.enter_context(redirect_stdout(io.StringIO()))
        for path in ('etc/sudoers.d', 'etc/duindorp/production', 'var/lib/duindorp/production',
                     'usr/local/libexec/duindorp'):
            (self.root / path).mkdir(parents=True, mode=0o755, exist_ok=True)
        self.preserved = []
        for path in ('etc/duindorp/production/deploy.json', 'var/lib/duindorp/production/current.json',
                     'etc/sudoers.d/duindorp-production', 'usr/local/libexec/duindorp/release.py',
                     'usr/local/libexec/duindorp/duindorp-deploy-production'):
            file = self.root / path
            file.write_text('production sentinel; never replace')
            self.preserved.append((file, file.read_bytes(), file.stat().st_mtime_ns))

    def files(self):
        return {str(path.relative_to(self.root)): path.read_bytes()
                for path in self.root.rglob('*') if path.is_file()}

    def test_preflight_does_not_create_or_change_any_host_file(self):
        before = self.files()
        installer.prepare('3112', 'https://staging.example.org')
        self.assertEqual(self.files(), before)
        self.command.assert_not_called()
        self.check.assert_called_once_with('staging', '3112', 'https://staging.example.org')

    def test_install_uses_immutable_isolated_helpers_and_preserves_production(self):
        version = installer.prepare('3112', 'https://staging.example.org', install=True)
        base = self.root / 'usr/local/libexec/duindorp/staging-v5' / version
        for name in installer.HELPERS:
            self.assertEqual((base / name).read_bytes(), (SCRIPTS / name).read_bytes())
        wrapper = (self.root / 'usr/local/libexec/duindorp/duindorp-deploy-staging').read_text()
        self.assertIn('/usr/bin/python3 -I ' + str(base / 'duindorp-deploy-staging'), wrapper)
        backup = (self.root / 'etc/duindorp/staging/backup.sh').read_text()
        self.assertIn(str(base / 'backup.py'), backup)
        self.assertNotIn('/usr/local/libexec/duindorp/backup.py', backup)
        rule = (self.root / 'etc/sudoers.d/duindorp-staging').read_text()
        self.assertIn('duindorpsv-staging)', rule)
        self.assertNotIn('production', rule)
        self.assertTrue(rule.endswith('duindorp-deploy-staging ""\n'))
        for file, contents, modified in self.preserved:
            self.assertEqual(file.read_bytes(), contents)
            self.assertEqual(file.stat().st_mtime_ns, modified)
        self.assertEqual(self.command.call_count, 1)
        self.assertEqual(self.command.call_args.args[0][:2], ['visudo', '-cf'])
        # Python isolated mode must still resolve the fixed private helper imports.
        for name in ('duindorp-deploy-staging', 'backup.py', 'rollback.py'):
            result = REAL_RUN([sys.executable, '-I', str(base / name)], input='',
                                    capture_output=True, text=True, env={'PATH': '/usr/bin:/bin'})
            self.assertNotIn('ModuleNotFoundError', result.stderr)
            self.assertEqual(result.returncode, 1)

    def test_legacy_state_blocks_even_explicit_install_without_data_loss(self):
        state = self.root / 'var/lib/duindorp/staging'
        state.mkdir(mode=0o700)
        (state / 'active.json').write_text('legacy image, database and configuration references')
        before = self.files()
        with self.assertRaisesRegex(ValueError, 'Legacy active.json'):
            installer.prepare('3112', 'https://staging.example.org', install=True)
        self.assertEqual(self.files(), before)
        self.command.assert_not_called()
        self.check.assert_not_called()

    def test_invalid_sudoers_prevents_installation_writes(self):
        before = self.files()
        self.command.side_effect = subprocess.CalledProcessError(1, ['visudo'])
        with self.assertRaises(subprocess.CalledProcessError):
            installer.prepare('3112', 'https://staging.example.org', install=True)
        self.assertEqual(self.files(), before)
        self.check.assert_called_once_with('staging', '3112', 'https://staging.example.org')

    def test_existing_origin_and_unsafe_wrapper_cannot_be_replaced(self):
        config = self.root / 'etc/duindorp/staging'
        config.mkdir(mode=0o750)
        (config / 'deploy.json').write_text(json.dumps({'baseUrl': 'https://different.example.org'}))
        before = self.files()
        with self.assertRaisesRegex(ValueError, 'Existing staging'):
            installer.prepare('3112', 'https://staging.example.org', install=True)
        self.assertEqual(self.files(), before)
        (config / 'deploy.json').unlink()
        wrapper = self.root / 'usr/local/libexec/duindorp/duindorp-deploy-staging'
        wrapper.symlink_to(self.preserved[-1][0])
        with self.assertRaisesRegex(ValueError, 'Unsafe staging'):
            installer.prepare('3112', 'https://staging.example.org', install=True)
        self.command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
