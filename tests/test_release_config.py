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

    def test_only_one_service_migrates(self):
        migrating = [n for n, s in compose().items() if 'migrate' in json.dumps(s.get('command', ''))]
        self.assertEqual(migrating, ['migrate'])


if __name__ == '__main__':
    unittest.main()
