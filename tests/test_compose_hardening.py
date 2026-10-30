"""Static checks that the hardening in docker-compose.yml is actually applied to every service that should have it.
Run from the repository root:  python3 -m unittest tests.test_compose_hardening     (needs PyYAML)

These read the file only. They cannot prove the containers start: run `docker compose up` and confirm every service is healthy.
"""
import re
import unittest

import yaml

with open('docker-compose.yml') as handle:
    SERVICES = yaml.safe_load(handle)['services']

HARDENED = ('backend', 'migrate', 'scheduler', 'frontend', 'redis')


class ComposeHardeningTests(unittest.TestCase):
    def test_every_application_service_drops_all_capabilities_and_privilege_escalation(self):
        for name in HARDENED:
            svc = SERVICES[name]
            self.assertEqual(svc['cap_drop'], ['ALL'], name)
            self.assertIn('no-new-privileges:true', svc['security_opt'], name)
            self.assertNotIn('cap_add', svc, f'{name} must not add capabilities back')
            self.assertNotIn('privileged', svc, name)

    def test_root_filesystems_are_read_only_with_scratch_space_on_tmpfs(self):
        for name in HARDENED:
            self.assertIs(SERVICES[name]['read_only'], True, name)
        for name in ('backend', 'migrate', 'scheduler', 'frontend'):
            self.assertIn('/tmp', SERVICES[name]['tmpfs'], name)
        self.assertIn('/app/.next/cache', SERVICES['frontend']['tmpfs'])

    def test_resources_are_bounded(self):
        for name in HARDENED:
            self.assertTrue(SERVICES[name]['mem_limit'], name)
            self.assertLessEqual(SERVICES[name]['pids_limit'], 200, name)

    def test_redis_requires_a_password_and_the_app_uses_it(self):
        redis = SERVICES['redis']
        self.assertIn('--requirepass', ' '.join(redis['command']))
        self.assertIn('--appendonly no', ' '.join(redis['command']))
        self.assertIn('REDIS_PASSWORD', redis['environment'])
        self.assertIn('-a', ' '.join(redis['healthcheck']['test']))                     # the health check authenticates too
        for name in ('backend', 'migrate', 'scheduler'):
            url = SERVICES[name]['environment']['REDIS_URL']
            self.assertRegex(url, r'^redis://:\$\{REDIS_PASSWORD:\?[^}]+\}@redis:6379', name)

    def test_redis_and_the_database_are_not_published_and_redis_runs_unprivileged(self):
        self.assertNotIn('ports', SERVICES['redis'])
        self.assertNotIn('ports', SERVICES['db'])
        self.assertEqual(SERVICES['redis']['user'], 'redis')

    def test_the_scheduler_never_receives_the_webhook_secret(self):
        self.assertEqual(SERVICES['scheduler']['environment']['RAZORPAY_WEBHOOK_SECRET'], '')
        self.assertIn('RAZORPAY_KEY_SECRET', SERVICES['scheduler']['environment'])      # reconcile_payments needs the API key
        self.assertTrue(SERVICES['backend']['environment']['RAZORPAY_WEBHOOK_SECRET'])  # the web process does receive webhooks

    def test_published_ports_are_loopback_by_default(self):
        for name in ('backend', 'frontend'):
            for port in SERVICES[name]['ports']:
                self.assertRegex(str(port), r'^(127\.0\.0\.1|\$\{FRONTEND_BIND:-127\.0\.0\.1\}):', f'{name}: {port}')

    def test_the_database_keeps_its_own_filesystem_writable(self):
        self.assertNotIn('read_only', SERVICES['db'])     # PostgreSQL needs its data volume; hardened separately (see the plan)

    def test_the_env_template_documents_the_new_required_variables(self):
        with open('.env.example') as handle:
            template = handle.read()
        for variable in ('REDIS_PASSWORD', 'FRONTEND_BIND'):
            self.assertRegex(template, rf'(?m)^{variable}=', variable)


if __name__ == '__main__':
    unittest.main()
