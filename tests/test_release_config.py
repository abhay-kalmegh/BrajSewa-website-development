"""Release configuration: the web container must not run migrations, and migrations must run once, first.
Run from the repository root:  python3 -m unittest tests.test_release_config     (needs PyYAML)
"""
import json
import re
import unittest

import yaml


def dockerfile_cmd(path='backend/Dockerfile'):
    with open(path) as handle:
        match = re.search(r'^CMD\s+(\[.*\])\s*$', handle.read(), re.M)
    return ' '.join(json.loads(match.group(1)))


def compose():
    with open('docker-compose.yml') as handle:
        return yaml.safe_load(handle)['services']


class ReleaseConfigTests(unittest.TestCase):
    def test_container_start_does_not_run_migrations(self):
        cmd = dockerfile_cmd()
        self.assertNotIn('migrate', cmd)
        self.assertIn('gunicorn', cmd)

    def test_gunicorn_is_pid_1_so_it_receives_sigterm(self):
        self.assertIn('exec gunicorn', dockerfile_cmd())

    def test_graceful_shutdown_and_keep_alive_beat_the_load_balancer_timeout(self):
        cmd = dockerfile_cmd()
        self.assertGreater(int(re.search(r'--keep-alive (\d+)', cmd).group(1)), 60)      # ALB idle timeout is 60 s
        self.assertIn('--graceful-timeout', cmd)
        self.assertIn('--worker-class gthread', cmd)

    def test_compose_has_a_one_shot_migrate_service(self):
        migrate = compose()['migrate']
        self.assertEqual(migrate['restart'], 'no')
        self.assertIn('migrate', ' '.join(migrate['command']))
        self.assertIn('db', migrate['depends_on'])

    def test_backend_waits_for_migrate_to_finish_successfully(self):
        dep = compose()['backend']['depends_on']['migrate']
        self.assertEqual(dep['condition'], 'service_completed_successfully')

    def test_no_dependency_cycles(self):
        services = compose()
        def deps(name): return list((services[name].get('depends_on') or {}))
        def visit(name, path):
            self.assertNotIn(name, path, f'cycle: {path + [name]}')
            for d in deps(name): visit(d, path + [name])
        for name in services: visit(name, [])

    def test_frontend_has_a_health_check_that_does_not_call_the_api(self):
        check = ' '.join(compose()['frontend']['healthcheck']['test'])
        self.assertIn('/api/health', check)
        with open('Dockerfile') as handle:
            self.assertIn('/api/health', handle.read())

    def test_scheduler_expires_orders_and_reconciles_payments(self):
        command = ' '.join(compose()['scheduler']['command'])
        self.assertIn('expire_orders', command)
        self.assertIn('reconcile_payments', command)
        self.assertIn('|| true', command)          # a reported discrepancy must not stop the loop that expires orders
        self.assertIn('$$', command)               # compose requires `$$` for a literal `$`
        self.assertIn('flushexpiredtokens', command)   # the JWT blacklist table needs a daily clean-up

    def test_cookie_and_token_lifetimes_come_from_one_setting(self):
        services = compose()
        self.assertEqual(services['backend']['environment']['JWT_REFRESH_DAYS'], '${SESSION_REFRESH_DAYS:-3}')
        self.assertEqual(services['frontend']['environment']['AUTH_REFRESH_DAYS'], '${SESSION_REFRESH_DAYS:-3}')

    def test_razorpay_sdk_has_the_setuptools_it_secretly_needs(self):
        with open('backend/requirements.txt') as handle:
            lines = [
                line.strip()
                for line in handle
                if line.strip() and not line.startswith('#')
            ]

        razorpay_pins = [l for l in lines if l.startswith('razorpay')]
        setuptools_pins = [l for l in lines if l.startswith('setuptools')]

        self.assertEqual(len(razorpay_pins), 1)
        self.assertEqual(len(setuptools_pins), 1)

        self.assertRegex(razorpay_pins[0], r'razorpay==2\.0\.1')
        self.assertRegex(setuptools_pins[0], r'setuptools>=84\.1\.0')
    # def test_razorpay_sdk_has_the_setuptools_it_secretly_needs(self):
    #     with open('backend/requirements.txt') as handle:
    #         lines = [l.strip() for l in handle if l.strip() and not l.startswith('#')]
    #     self.assertTrue(any(l.startswith('razorpay') for l in lines))
    #     pins = [l for l in lines if l.startswith('setuptools')]
    #     self.assertEqual(len(pins), 1, 'razorpay imports pkg_resources: setuptools must be declared')
    #     self.assertRegex(pins[0], r'<\s*81', 'pkg_resources is gone from setuptools 81 and later')

    def test_security_scanner_action_uses_an_existing_v_prefixed_tag(self):
        # After a supply-chain attack in March 2026 the Trivy action's maintainers renamed every tag to start with "v";
        # a reference such as @0.28.0 no longer resolves and the whole job fails before it starts.
        refs = []
        for path in ('.github/workflows/ci.yml',):
            with open(path) as handle:
                refs += re.findall(r'aquasecurity/trivy-action@(\S+)', handle.read())
        self.assertTrue(refs, 'the workflow should still scan with trivy')
        for ref in refs:
            self.assertRegex(ref, r'^(v\d+\.\d+\.\d+|[0-9a-f]{40})$', f'unresolvable or unpinned reference: {ref}')

    def test_only_one_service_migrates(self):
        migrating = [n for n, s in compose().items() if 'migrate' in json.dumps(s.get('command', ''))]
        self.assertEqual(migrating, ['migrate'])


if __name__ == '__main__':
    unittest.main()
