"""Configuration and deployment boundaries using synthetic credentials and mocked hosts."""
from contextlib import ExitStack, redirect_stdout
import io
import base64
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
ROOT = SCRIPTS.parents[1]
sys.path.insert(0, str(SCRIPTS))
import backup
import deploy
import deploy_config as configuration
import release as manifests
import rollback
REAL_COMMAND = deploy.command


def settings(target='production'):
    app_password='application-example-' + 'b' * 32
    project='abcdefghijklmnopqrst'
    values = dict(APP_BASE_URL='https://' + target + '.example.org',
                DATABASE_URL='postgres://duindorp_app:'+app_password+'@db.'+project+'.supabase.co:5432/postgres?sslmode=verify-full',
                MIGRATION_DATABASE_URL='postgres://postgres:migration-example-'+'a'*32+'@db.'+project+'.supabase.co:5432/postgres?sslmode=verify-full',
                APP_DATABASE_PASSWORD=app_password,
                SUPABASE_URL='https://'+project+'.supabase.co',
                SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic', SUPABASE_SECRET_KEY='sb_secret_synthetic',
                SUPABASE_DB_CA_CERT_B64=base64.b64encode((Path(__file__).parent/'fixtures/supabase-ca.crt').read_bytes()).decode(),
                S3_BUCKET='cms-' + target, S3_ENDPOINT='https://fsn1.your-objectstorage.com', S3_REGION='fsn1',
                S3_ACCESS_KEY_ID='synthetic-media-key', S3_SECRET_ACCESS_KEY='synthetic-media-secret',
                RESEND_API_KEY='synthetic-resend-key', MAIL_FROM='cms@example.org',
                RESTIC_REPOSITORY='s3:https://backup.example.org/cms-' + target,
                RESTIC_PASSWORD='synthetic-restic-' + 'd' * 32,
                BACKUP_S3_ACCESS_KEY_ID='synthetic-backup-key',
                BACKUP_S3_SECRET_ACCESS_KEY='synthetic-backup-secret')
    if target == 'staging':
        values['TEST_MAIL_TO'] = 'staging-test@example.org'
    return values


def release(run=10, target='production'):
    return dict(schemaVersion=1, repository='duindorpsv/website',
                workflow=manifests.deployment_target(target)['workflow'], runId=run,
                sourceSha='a' * 40, treeSha='b' * 40, digest='sha256:' + str(run % 10) * 64,
                migrationHash='c' * 64, configVersion=5)


class ConfigurationTests(unittest.TestCase):
    def test_requirements_defaults_and_environment_separation(self):
        for target in ('production', 'staging'):
            installed = {'baseUrl': settings(target)['APP_BASE_URL']}
            values = configuration.validate_configuration(settings(target), target, installed)
            self.assertEqual(values['RESEND_API_KEY'], 'synthetic-resend-key')
            self.assertEqual(values['NEWS_IMPORT_MAX_MB'], '512')
            self.assertNotIn('NEWSLETTER_PROVIDER', values)
            with tempfile.TemporaryDirectory() as temporary:
                state = Path(temporary)
                identifier = configuration.write_generation(state, values, target)
                directory = configuration.generation_path(state, identifier)
                self.assertEqual(configuration.read_generation(state, identifier), values)
                runtime = (directory / 'runtime.env').read_text()
                self.assertIn('APP_ENV="' + target + '"', runtime)
                self.assertNotIn(values['MIGRATION_DATABASE_URL'], runtime)
                self.assertNotIn('MIGRATION_DATABASE_URL', runtime)
                migration=(directory/'migration.env').read_text()
                self.assertIn('PGHOST="db.abcdefghijklmnopqrst.supabase.co"',migration)
                self.assertIn('PGDATABASE="postgres"',migration)
                self.assertIn('PGSSLMODE="verify-full"',migration)
                self.assertNotIn('PGPASSWORD',runtime)
                self.assertNotIn(values['RESTIC_PASSWORD'], runtime)
                self.assertNotIn(values['BACKUP_S3_SECRET_ACCESS_KEY'], runtime)
                for file in directory.iterdir():
                    self.assertEqual(file.stat().st_mode & 0o777, 0o600)
                self.assertEqual(directory.stat().st_mode & 0o777, 0o700)

    def test_rejects_injections_missing_settings_and_host_controls(self):
        values = settings()
        invalid = [dict(values, DOCKER_HOST='unix:///var/run/docker.sock'),
                   dict(values, WEB_PORT='22'), dict(values, APP_ENV='production'),
                   dict(values, DATABASE_URL='postgres://root@another-site/db'),
                   dict(values, DATABASE_PASSWORD='password\nDOCKER_HOST=evil'),
                   dict(values, RESEND_API_KEY='contains whitespace'),
                   dict(values, APP_BASE_URL='http://production.example.org'),
                   dict(values, APP_BASE_URL='https://other.example.org'),
                   dict(values, TEST_MAIL_TO='test@example.org'), dict(values, S3_BUCKET='--config=/etc/passwd'),
                   dict(values, S3_ENDPOINT='http://169.254.169.254'),
                   dict(values, S3_ENDPOINT='https://fsn1.your-objectstorage.com/cms-production'),
                   dict(values, S3_ENDPOINT='https://fsn1.your-objectstorage.com.evil.example'),
                   dict(values, S3_ENDPOINT='https://fsn1.your-objectstorage.com?endpoint=other'),
                   dict(values, S3_ENDPOINT='https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/s3'),
                   dict(values, S3_REGION='hel1'),
                   dict(values, RESTIC_REPOSITORY='/srv/another-site'),
                   dict(values, RESTIC_REPOSITORY='s3:https://user:password@example.org/backup'),
                   dict(values, RESTIC_REPOSITORY='s3:https://fsn1.your-objectstorage.com/cms-production'),
                   dict(values, RESTIC_REPOSITORY='s3:https://fsn1.your-objectstorage.com/cms-production/originals'),
                   dict(values, SUPABASE_URL='https://zzzzzzzzzzzzzzzzzzzz.supabase.co'),
                   dict(values, SUPABASE_DB_CA_CERT_B64='invalid'),
                   dict(values, DATABASE_URL=values['MIGRATION_DATABASE_URL']),
                   dict(values, MIGRATION_DATABASE_URL=values['MIGRATION_DATABASE_URL'].replace('5432','6543')),
                   dict(values, DATABASE_URL=values['DATABASE_URL'].replace('verify-full','require')),
                   dict(values, NEWSLETTER_PROVIDER='brevo'),
                   dict(values, NEWSLETTER_LIST_ID='123'), dict(values, NEWSLETTER_API_KEY='obsolete'),
                   dict(values, SENDGRID_API_KEY='obsolete'),
                   dict(values, SUPABASE_SECRET_KEY=42),
                   dict(values, NEWS_IMPORT_MAX_MB='0'),
                   dict(values, NEWS_IMPORT_MAX_UNPACKED_MB='99999'),
                   dict(values, NEWS_IMPORT_MAX_ENTRIES='x')]
        for key in configuration.REQUIRED:
            if key != 'S3_REGION':
                invalid.append(dict(values, **{key: ''}))
        for candidate in invalid:
            with self.subTest(keys=set(candidate)), self.assertRaises(ValueError):
                configuration.validate_configuration(candidate, 'production', {'baseUrl': values['APP_BASE_URL']})
        with self.assertRaises(ValueError):
            configuration.validate_configuration(dict(settings('production'), TEST_MAIL_TO='test@example.org'),
                                                 'production', {'baseUrl': settings('production')['APP_BASE_URL']})

    def test_shared_bucket_backup_is_separate_from_media(self):
        values = dict(settings(), RESTIC_REPOSITORY='s3:https://fsn1.your-objectstorage.com/cms-production/.duindorp-backups/production')
        self.assertEqual(configuration.validate_configuration(values, 'production', {'baseUrl': values['APP_BASE_URL']})['RESTIC_REPOSITORY'], values['RESTIC_REPOSITORY'])

    def test_staging_requires_test_recipient_and_separate_shared_bucket_backup_prefix(self):
        values = settings('staging')
        installed = {'baseUrl': values['APP_BASE_URL']}
        for recipient in ('', 'invalid', 'a@example.org\nBcc: real@example.org'):
            with self.subTest(recipient=recipient), self.assertRaises(ValueError):
                configuration.validate_configuration({**values, 'TEST_MAIL_TO': recipient}, 'staging', installed)
        prefix = 's3:https://fsn1.your-objectstorage.com/cms-staging/.duindorp-backups/'
        for wrong in ('production', '', 'staging/other'):
            with self.subTest(prefix=wrong), self.assertRaises(ValueError):
                configuration.validate_configuration({**values, 'RESTIC_REPOSITORY': prefix + wrong}, 'staging', installed)
        result = configuration.validate_configuration({**values, 'RESTIC_REPOSITORY': prefix + 'staging'}, 'staging', installed)
        self.assertIn('TEST_MAIL_TO="staging-test@example.org"', configuration.generation_files(result, 'staging')['runtime.env'])
        for legacy in ('DATABASE_PASSWORD', 'AUTH_SESSION_SECRET', 'SMTP_HOST', 'DOCKER_HOST'):
            with self.subTest(legacy=legacy), self.assertRaises(ValueError):
                configuration.validate_configuration({**values, legacy: 'obsolete'}, 'staging', installed)

    def test_staging_push_is_read_only_and_deployment_requires_explicit_dispatch(self):
        source = (ROOT / '.github/workflows/staging.yml').read_text()
        for job in ('build', 'deploy'):
            block = source.split('  ' + job + ':\n', 1)[1].split('\n  ', 1)[0]
            self.assertIn("github.event_name == 'workflow_dispatch' && inputs.operation == 'deploy'", block)
        inventory = source.split('  inventory:\n', 1)[1]
        self.assertIn('environment: staging', inventory)
        self.assertNotIn('checkout@', inventory)
        self.assertNotIn('secrets.', inventory)
        self.assertNotIn('sudo -n -u ', inventory)
        self.assertIn("python3 -I - <<'PYCODE'", inventory)
        self.assertIn("['sudo','-n','-l'", inventory)
        self.assertNotIn('commit.message', source)

    def test_generation_rejects_symlinks_and_modified_files(self):
        values = configuration.validate_configuration(settings(), 'production', {'baseUrl': settings()['APP_BASE_URL']})
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            identifier = configuration.write_generation(state, values, 'production')
            runtime = configuration.generation_path(state, identifier) / 'runtime.env'
            runtime.write_text('modified')
            with self.assertRaises(ValueError):
                configuration.write_generation(state, values, 'production')
            runtime.unlink()
            runtime.symlink_to(state / 'outside')
            with self.assertRaises((ValueError, FileNotFoundError)):
                configuration.write_generation(state, values, 'production')
            for identifier in ('../production', 'x' * 64, '/etc/passwd'):
                with self.assertRaises(ValueError):
                    configuration.generation_path(state, identifier)

    def test_workflow_payload_preserves_values_and_uses_only_expected_settings(self):
        for target in ('production', 'staging'):
            source = (ROOT / '.github/workflows' / (target + '.yml')).read_text()
            branch = manifests.deployment_target(target)['branch']
            self.assertIn('branches: [' + branch + ']', source)
            self.assertIn("if: github.ref == 'refs/heads/" + branch + "'", source)
            self.assertIn('environment: ' + target, source)
            self.assertIn('sudo -n -u duindorpsv-' + target + ' /usr/local/libexec/duindorp/duindorp-deploy-' + target, source)
            if target == 'production':
                self.assertNotIn('staging', source)
            self.assertNotIn('SMTP_', source)
            mappings = re.findall(r'CFG_(\w+): \$\{\{ (vars|secrets)\.(\w+) \}\}', source)
            self.assertEqual({name for name, _, _ in mappings}, set(configuration.SECRETS + configuration.VARIABLES + (configuration.STAGING_VARIABLES if target == 'staging' else ())))
            for name, kind, lookup in mappings:
                self.assertEqual(name, lookup)
                self.assertEqual(kind, 'secrets' if name in configuration.SECRETS else 'vars')
            block = source.split("python3 - <<'PY' |", 1)[1].split('\n', 1)[1].split('          PY', 1)[0]
            script = '\n'.join(line[10:] for line in block.splitlines())
            with tempfile.TemporaryDirectory() as temporary:
                (Path(temporary) / 'release.json').write_text(json.dumps(release()))
                values = dict(settings(target), RESEND_API_KEY="x'$`#\\")
                environment = {**os.environ, **{'CFG_' + key: value for key, value in values.items()},
                               'DEPLOY_TOKEN': 'synthetic-job-token'}
                result = subprocess.run([sys.executable, '-c', script], cwd=temporary,
                                        env=environment, capture_output=True, text=True, check=True)
                payload = json.loads(result.stdout)
                self.assertEqual(payload['configuration'], values)
                self.assertEqual(set(payload), {'release', 'token', 'configuration'})

    @unittest.skipUnless(shutil.which('docker'), 'Docker Compose parser unavailable')
    def test_compose_parses_generated_values_literally_without_shell_expansion(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            tricky = "apostrophe'dollar$HOME${TOKEN}backtick`hash#backslash\\tail\\'"
            values = settings()
            from urllib.parse import quote
            values.update(RESEND_API_KEY=tricky, APP_DATABASE_PASSWORD=tricky)
            values['DATABASE_URL']='postgres://duindorp_app:'+quote(tricky,safe='')+'@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full'
            values = configuration.validate_configuration(values, 'production', {'baseUrl': values['APP_BASE_URL']})
            identifier = configuration.write_generation(state, values, 'production')
            installed = dict(dockerHost='unix:///nonexistent.sock', webPort=3112)
            environment = {**os.environ, **configuration.compose_environment('production', installed, state, identifier, release(), manifests.REGISTRY)}
            parsed = subprocess.run(['docker', 'compose', '-f', str(ROOT / 'ops/compose.yml'),
                                     '--profile', 'bootstrap', '--profile', 'migration',
                                     'config', '--format', 'json'], env=environment, capture_output=True, text=True)
            self.assertEqual(parsed.returncode, 0, 'Docker Compose rejected generated configuration')
            services = json.loads(parsed.stdout)['services']
            # `compose config` escapes dollars again for reusable serialization.
            self.assertEqual(services['web']['environment']['RESEND_API_KEY'].replace('$$', '$'), tricky)
            self.assertEqual(services['provision']['environment']['APP_DATABASE_PASSWORD'].replace('$$', '$'), tricky)
            self.assertNotIn('MIGRATION_DATABASE_URL', services['web']['environment'])
            self.assertNotIn('RESTIC_PASSWORD', services['web']['environment'])
            # Verify what the engine actually receives, using the already pulled
            # tiny BusyBox image solely as an env printer: no DB, network or mounts.
            probe = state / 'probe.json'
            probe.write_text(json.dumps({'services': {'configuration-check': {
                'image': 'busybox:1.37.0', 'entrypoint': ['/bin/busybox','env'],
                'env_file': [str(state / 'configuration' / identifier / 'runtime.env')],
                'network_mode': 'none', 'read_only': True, 'cap_drop': ['ALL'],
                'tmpfs': ['/tmp:size=1m']}}}))
            printed = subprocess.run(['docker', 'compose', '-p', 'duindorp-config-' + os.urandom(4).hex(),
                                      '-f', str(probe), 'run', '--rm', '--no-deps', 'configuration-check'],
                                     capture_output=True, text=True, timeout=30)
            self.assertEqual(printed.returncode, 0, 'Synthetic configuration container failed')
            actual = dict(line.split('=', 1) for line in printed.stdout.splitlines() if '=' in line)
            self.assertEqual(actual['RESEND_API_KEY'], tricky)


class DeploymentTests(unittest.TestCase):
    target = 'production'
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.directory = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.installed = dict(baseUrl=settings(self.target)['APP_BASE_URL'], webPort=3112,
                              dockerHost='unix:///run/user/' + str(os.getuid()) + '/docker.sock')
        self.stack.enter_context(patch.object(deploy, 'STATE_ROOT', self.directory))
        self.stack.enter_context(patch.object(deploy, 'installed_configuration', return_value=self.installed))
        self.stack.enter_context(patch.object(deploy.pwd, 'getpwuid', return_value=SimpleNamespace(
            pw_name='duindorpsv-' + self.target, pw_dir=str(self.directory))))
        self.verify = self.stack.enter_context(patch.object(deploy, 'verify'))
        self.stack.enter_context(patch.object(deploy, 'api', side_effect=lambda path, token:
            {'object': {'sha': 'a' * 40}} if 'git/ref/' in path else {'tree': {'sha': 'b' * 40}}))
        self.calls = []
        def command(args, env, input=None):
            self.calls.append((args, dict(env), input))
            return json.dumps({'org.opencontainers.image.revision': 'a' * 40, 'nl.duindorpsv.source-tree': 'b' * 40}) if 'inspect' in args else ''
        self.stack.enter_context(patch.object(deploy, 'command', side_effect=command))
        self.health = self.stack.enter_context(patch.object(deploy, 'ready'))
        self.stack.enter_context(redirect_stdout(io.StringIO()))
        self.previous_umask = os.umask(0o077)
        self.addCleanup(os.umask, self.previous_umask)

    def request(self, run=10, **changes):
        return {'release': release(run, self.target), 'token': 'synthetic-job-token',
                'configuration': {**settings(self.target), **changes}}

    def current(self):
        return json.loads((self.directory / (self.target + '/current.json')).read_text())

    def test_first_boot_backs_up_before_migration_and_activates_after_health(self):
        deploy.deploy(self.target, self.request())
        calls = [args for args, _, _ in self.calls]
        backup_index = next(i for i, args in enumerate(calls) if args[0].endswith('/backup.sh'))
        migrate_index = next(i for i, args in enumerate(calls) if args[-1] == 'migration' and 'run' in args)
        seed_index = next(i for i, args in enumerate(calls) if args[-1] == 'seed')
        self.assertLess(backup_index, migrate_index)
        self.assertLess(migrate_index, seed_index)
        self.assertEqual(self.current()['release'], release(target=self.target))
        self.health.assert_called_once_with(3112, release(target=self.target)['digest'])
        self.assertTrue(all(settings()['SUPABASE_SECRET_KEY'] not in str(args) for args in calls))

    def test_same_image_new_configuration_can_be_deployed_and_identical_retry_is_noop(self):
        deploy.deploy(self.target, self.request())
        old = self.current()
        self.calls.clear()
        deploy.deploy(self.target, self.request(MAIL_FROM='changed@example.org'))
        new = self.current()
        self.assertEqual(old['release'], new['release'])
        self.assertNotEqual(old['configuration'], new['configuration'])
        self.assertEqual(json.loads((self.directory / (self.target + '/previous.json')).read_text()), old)
        self.assertFalse(any(args[-1] == 'seed' for args, _, _ in self.calls))
        backup_env = next(env for args, env, _ in self.calls if args[0].endswith('/backup.sh'))
        self.assertEqual(backup_env['DUINDORP_SNAPSHOT_CONFIGURATION'], old['configuration'])
        self.calls.clear()
        deploy.deploy(self.target, self.request(MAIL_FROM='changed@example.org'))
        self.assertEqual(self.calls, [])

    def test_failed_health_restores_previous_image_and_configuration(self):
        deploy.deploy(self.target, self.request())
        old = self.current()
        self.calls.clear()
        self.health.side_effect = [RuntimeError('unhealthy'), None]
        with self.assertRaises(RuntimeError):
            deploy.deploy(self.target, self.request(11, MAIL_FROM='changed@example.org'))
        self.assertEqual(self.current(), old)
        last_env = self.calls[-1][1]
        self.assertIn(old['configuration'], last_env['RUNTIME_ENV_FILE'])
        self.assertEqual(last_env['APP_IMAGE'], manifests.REGISTRY + '@' + old['release']['digest'])

    def test_unsafe_rotations_and_stale_jobs_do_not_change_containers(self):
        deploy.deploy(self.target, self.request())
        self.calls.clear()
        for change in ({'APP_DATABASE_PASSWORD': 'different-' + 'x' * 32},
                       {'DATABASE_PASSWORD': 'different-' + 'x' * 32},
                       {'AUTH_SESSION_SECRET': 'different-' + 'x' * 32},
                       {'S3_BUCKET': 'another-bucket'}):
            with self.assertRaises(ValueError):
                deploy.deploy(self.target, self.request(11, **change))
        with self.assertRaises(ValueError):
            deploy.deploy(self.target, self.request(9))
        self.assertEqual(self.calls, [])
        (self.directory / (self.target + '/latest-run-id')).write_text('20')
        with self.assertRaises(ValueError):
            deploy.deploy(self.target, self.request(11))

    def test_bad_configuration_and_untrusted_artifacts_never_reach_docker(self):
        with self.assertRaises(ValueError):
            deploy.deploy(self.target, self.request(DOCKER_HOST='unix:///var/run/docker.sock'))
        self.verify.assert_not_called()
        self.verify.side_effect = ValueError('untrusted')
        with self.assertRaises(ValueError):
            deploy.deploy(self.target, self.request())
        self.assertEqual(self.calls, [])
        self.assertFalse((self.directory / (self.target + '/configuration')).exists())

    def test_failed_backup_stops_migrations_and_web_activation(self):
        def fail_backup(args, environment, input=None):
            if args[0].endswith('/backup.sh'):
                raise RuntimeError('external backup unavailable')
            self.calls.append((args, environment, input))
            return json.dumps({'org.opencontainers.image.revision': 'a' * 40, 'nl.duindorpsv.source-tree': 'b' * 40}) if 'inspect' in args else ''
        with patch.object(deploy, 'command', side_effect=fail_backup), self.assertRaises(RuntimeError):
            deploy.deploy(self.target, self.request())
        self.assertFalse((self.directory / (self.target + '/current.json')).exists())
        self.assertFalse(any('run' in args for args, _, _ in self.calls))
        self.health.assert_not_called()

    def test_older_main_commit_and_wrong_image_tree_cannot_activate(self):
        with patch.object(deploy, 'api', return_value={'object': {'sha': 'f' * 40}}):
            with self.assertRaises(ValueError):
                deploy.deploy(self.target, self.request())
        self.assertEqual(self.calls, [])
        def wrong_tree(args, environment, input=None):
            self.calls.append((args, environment, input))
            return json.dumps({'org.opencontainers.image.revision': 'a' * 40,
                               'nl.duindorpsv.source-tree': 'f' * 40}) if 'inspect' in args else ''
        with patch.object(deploy, 'command', side_effect=wrong_tree):
            with self.assertRaises(ValueError):
                deploy.deploy(self.target, self.request())
        self.assertFalse(any('up' in args or 'run' in args for args, _, _ in self.calls))
        self.assertFalse((self.directory / (self.target + '/current.json')).exists())

    def test_cross_environment_manifest_never_reaches_docker(self):
        wrong = 'staging' if self.target == 'production' else 'production'
        request = self.request()
        request['release'] = release(target=wrong)
        with self.assertRaises(ValueError):
            deploy.deploy(self.target, request)
        self.assertEqual(self.calls, [])

    def test_legacy_state_blocks_before_provenance_and_configuration_writes(self):
        state = self.directory / self.target
        state.mkdir(mode=0o700)
        (state / 'active.json').write_text('legacy state must be preserved')
        with self.assertRaisesRegex(ValueError, 'Legacy deployment state'):
            deploy.deploy(self.target, self.request())
        self.assertEqual((state / 'active.json').read_text(), 'legacy state must be preserved')
        self.assertFalse((state / 'configuration').exists())
        self.verify.assert_not_called()
        self.assertEqual(self.calls, [])

    def test_child_failure_never_exposes_captured_secrets(self):
        process = SimpleNamespace(returncode=1, stdout='sensitive', stderr=settings()['SUPABASE_SECRET_KEY'])
        with patch.object(subprocess, 'run', return_value=process):
            with self.assertRaisesRegex(RuntimeError, '^Deployment command failed$'):
                REAL_COMMAND(['docker'], {})

    def test_operator_rollback_keeps_matching_config_and_stale_run_protection(self):
        deploy.deploy(self.target, self.request())
        old = self.current()
        deploy.deploy(self.target, self.request(11, MAIL_FROM='changed@example.org'))
        current = self.current()
        with patch.object(rollback, 'STATE_ROOT', self.directory), \
             patch.object(rollback, 'installed_configuration', return_value=self.installed), \
             patch.object(rollback, 'command') as command, \
             patch.object(rollback, 'ready', side_effect=RuntimeError('not ready')) as health:
            with self.assertRaises(RuntimeError):
                rollback.rollback(self.target)
            self.assertEqual(self.current(), current)
            health.side_effect = None
            rollback.rollback(self.target)
            self.assertEqual(self.current(), old)
            self.assertIn(old['configuration'], command.call_args.args[1]['RUNTIME_ENV_FILE'])
        with self.assertRaises(ValueError):
            deploy.deploy(self.target, self.request(10))


class StagingDeploymentTests(DeploymentTests):
    target = 'staging'


class ProvenanceTests(unittest.TestCase):
    def test_staging_binding_rejects_production_and_feature_builds(self):
        item = release(target='staging')
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as contents:
            contents.writestr('release.json', json.dumps(item))
        run = dict(head_sha=item['sourceSha'], head_branch='staging', event='workflow_dispatch',
                   path='.github/workflows/staging.yml', conclusion=None)
        def api(path, token, binary=False):
            if binary:
                return archive.getvalue()
            if '/jobs?' in path:
                return {'total_count': 2, 'jobs': [dict(id=i, run_attempt=1, name=name, conclusion='success')
                        for i, name in enumerate(('checks / verify', 'build'))]}
            if path.endswith('/artifacts'):
                return {'artifacts': [dict(name='release', id=1, expired=False)]}
            return run
        with patch.object(deploy, 'api', side_effect=api):
            deploy.verify(item, 'synthetic', 'staging')
            for field, bad in [('head_branch', 'main'), ('head_branch', 'codex/sponsoring-v64'),
                               ('path', '.github/workflows/production.yml'), ('event', 'pull_request'), ('event', 'push')]:
                with self.subTest(field=field, bad=bad), patch.dict(run, {field: bad}), self.assertRaises(ValueError):
                    deploy.verify(item, 'synthetic', 'staging')
            with self.assertRaises(ValueError):
                deploy.verify(release(), 'synthetic', 'staging')
            with self.assertRaises(ValueError):
                deploy.verify(item, 'synthetic', 'production')

    def test_only_main_production_builds_with_successful_latest_checks_are_accepted(self):
        item = release()
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as contents:
            contents.writestr('release.json', json.dumps(item))
        run = dict(head_sha=item['sourceSha'], head_branch='main', event='push',
                   path='.github/workflows/production.yml', conclusion=None)
        jobs = [dict(id=i, run_attempt=1, name=name, conclusion='success')
                for i, name in enumerate(('checks / verify', 'build'))]
        artifacts = [dict(name='release', id=1, expired=False)]
        def api(path, token, binary=False):
            if binary:
                return archive.getvalue()
            if '/jobs?' in path:
                return dict(total_count=len(jobs), jobs=jobs)
            if path.endswith('/artifacts'):
                return dict(artifacts=artifacts)
            return run
        with patch.object(deploy, 'api', side_effect=api):
            deploy.verify(item, 'synthetic', 'production')
            for field, bad in [('head_branch', 'staging'), ('head_branch', 'production'),
                               ('head_sha', 'f' * 40), ('event', 'pull_request'),
                               ('path', '.github/workflows/staging.yml'), ('conclusion', 'failure')]:
                with self.subTest(field=field, bad=bad), patch.dict(run, {field: bad}):
                    with self.assertRaises(ValueError):
                        deploy.verify(item, 'synthetic', 'production')
            artifacts[0]['expired'] = True
            with self.assertRaises(ValueError):
                deploy.verify(item, 'synthetic', 'production')
            artifacts[0]['expired'] = False
            jobs.append(dict(id=5, run_attempt=2, name='build', conclusion='failure'))
            with self.assertRaises(ValueError):
                deploy.verify(item, 'synthetic', 'production')
            jobs[-1]['conclusion'] = 'success'
            deploy.verify(item, 'synthetic', 'production')
            jobs.append(dict(id=6, run_attempt=3, name='checks / verify', conclusion='failure'))
            with self.assertRaises(ValueError):
                deploy.verify(item, 'synthetic', 'production')

    def test_legacy_manifest_cannot_be_used_as_a_production_release(self):
        for changes in [dict(configVersion=2), dict(configVersion=3), dict(configVersion=4), dict(workflow='.github/workflows/staging.yml')]:
            with self.assertRaises(ValueError):
                manifests.validate({**release(), **changes})

    def test_runtime_configuration_does_not_bypass_digest_or_acceptance_binding(self):
        item = release()
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as contents:
            contents.writestr('release.json', json.dumps(item))
        run = dict(head_sha=item['sourceSha'], head_branch='main', event='push',
                   path='.github/workflows/production.yml', conclusion='success')
        def api(path, token, binary=False):
            if binary:
                return archive.getvalue()
            if '/jobs?' in path:
                return {'total_count': 2, 'jobs': [{'id': i, 'run_attempt': 1, 'name': name, 'conclusion': 'success'} for i, name in enumerate(('checks / verify', 'build'))]}
            if path.endswith('/artifacts'):
                return {'artifacts': [{'name': name, 'expired': False, 'id': index}
                                      for index, name in enumerate(('release',))]}
            return run
        with patch.object(deploy, 'api', side_effect=api):
            deploy.verify(item, 'synthetic', 'production')
            run['event'] = 'workflow_dispatch'
            deploy.verify(item, 'synthetic', 'production')
            with self.assertRaises(ValueError):
                deploy.verify({**item, 'digest': 'sha256:' + 'f' * 64}, 'synthetic', 'production')
            run['conclusion'] = 'failure'
            with self.assertRaises(ValueError):
                deploy.verify(item, 'synthetic', 'production')


class BackupTests(unittest.TestCase):
    def test_backup_separates_media_and_external_credentials_and_includes_runtime_settings(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / 'production'
            state.mkdir(mode=0o700)
            values = configuration.validate_configuration(settings(), 'production', {'baseUrl': settings()['APP_BASE_URL']})
            identifier = configuration.write_generation(state, values, 'production')
            installed = dict(baseUrl=values['APP_BASE_URL'], webPort=3112, dockerHost='unix:///fake')
            environment = configuration.compose_environment('production', installed, state, identifier, release(), manifests.REGISTRY)
            commands = []
            def quiet(args, env):
                commands.append((args, env))
                self.assertFalse(any(values[key] in str(args) for key in configuration.SECRETS if values[key]))
                if args[:2] == ['restic', 'backup']:
                    directory = Path(args[2])
                    runtime = (directory / 'configuration/runtime.env').read_text()
                    self.assertIn(values['SUPABASE_SECRET_KEY'], runtime)
                    self.assertFalse((directory / 'configuration/configuration.json').exists())
            def run(args, **kwargs):
                if 'database-backup' in args:
                    kwargs['stdout'].write(b'synthetic-dump')
                return SimpleNamespace(returncode=0)
            account = SimpleNamespace(pw_name='duindorpsv-production', pw_dir=temporary)
            config_root = Path(temporary) / 'etc/production'
            config_root.mkdir(parents=True)
            (config_root / 'deploy.json').write_text(json.dumps(installed))
            with patch.object(backup, 'STATE_ROOT', Path(temporary)), \
                 patch.object(backup, 'CONFIG_ROOT', config_root.parent), \
                 patch.object(backup.pwd, 'getpwuid', return_value=account), \
                 patch.object(backup, 'quiet', side_effect=quiet), \
                 patch.object(backup.subprocess, 'run', side_effect=run):
                backup.backup('production', identifier, environment, initialize=True)
            media_env = commands[0][1]
            self.assertIn('/.duindorp-backups/**', commands[0][0])
            external_env = commands[1][1]
            self.assertEqual(media_env['RCLONE_CONFIG_MEDIA_SECRET_ACCESS_KEY'], values['S3_SECRET_ACCESS_KEY'])
            self.assertNotIn('AWS_SECRET_ACCESS_KEY', media_env)
            self.assertEqual(external_env['AWS_SECRET_ACCESS_KEY'], values['BACKUP_S3_SECRET_ACCESS_KEY'])
            self.assertNotIn('RCLONE_CONFIG_MEDIA_SECRET_ACCESS_KEY', external_env)
            self.assertIn('host,tags', commands[-1][0])


if __name__ == '__main__':
    unittest.main()
