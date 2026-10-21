"""CI must actually run everything we rely on, and must not weaken its own guarantees.
Run from the repository root:  python3 -m unittest tests.test_ci_config     (needs PyYAML)
"""
import glob
import re
import unittest

import yaml

with open('.github/workflows/ci.yml') as handle:
    CI = yaml.safe_load(handle)
with open('.github/dependabot.yml') as handle:
    DEPENDABOT = yaml.safe_load(handle)


def runs(job):
    return [step['run'] for step in CI['jobs'][job].get('steps', []) if 'run' in step]


def uses(job):
    return [step['uses'] for step in CI['jobs'][job].get('steps', []) if 'uses' in step]


class CiConfigTests(unittest.TestCase):
    def test_workflow_token_is_read_only_by_default(self):
        self.assertEqual(CI['permissions'], {'contents': 'read'})
        for name, job in CI['jobs'].items():
            self.assertNotIn('write', str(job.get('permissions', '')), f'{name} escalates permissions')

    def test_every_typescript_test_file_is_run(self):
        self.assertTrue(glob.glob('tests/*.test.ts'), 'no TypeScript tests found')
        script = '\n'.join(runs('frontend'))
        self.assertIn('tests/*.test.ts', script)        # a glob, so a new file cannot be forgotten
        self.assertIn('set -e', script)                 # the loop stops at the first failure

    def test_tsx_is_pinned_to_an_exact_version(self):
        for job in CI['jobs']:
            for command in runs(job):
                for match in re.finditer(r'tsx(@\S+)?', command):
                    if 'npx' in command[:match.start()].split('\n')[-1] or 'dlx' in command[:match.start()].split('\n')[-1]:
                        self.assertRegex(match.group(0), r'^tsx@\d+\.\d+\.\d+$', f'{job}: {command!r}')

    def test_every_repo_level_python_test_is_discovered(self):
        self.assertIn("unittest discover -s tests -t . -p 'test_*.py'", '\n'.join(runs('secret-scan')))
        self.assertTrue(glob.glob('tests/__init__.py'), 'tests/ must be a package for discovery to work')

    def test_no_test_step_can_fail_silently(self):
        for job in CI['jobs']:
            for command in runs(job):
                if re.search(r'tsx|unittest|manage\.py test|pip-audit|pnpm audit|makemigrations', command):
                    self.assertNotIn('|| true', command, f'{job}: {command!r}')

    def test_backend_still_checks_migrations_tests_and_dependencies(self):
        script = '\n'.join(runs('backend'))
        for expected in ('makemigrations --check', 'manage.py test', 'pip-audit'):
            self.assertIn(expected, script)

    def test_dependency_and_image_scans_fail_the_build_on_high_or_critical(self):
        scans = [s for job in ('security', 'images') for s in CI['jobs'][job]['steps'] if str(s.get('uses', '')).startswith('aquasecurity/trivy-action')]
        self.assertEqual(len(scans), 2)
        for scan in scans:
            self.assertEqual(scan['with']['severity'], 'HIGH,CRITICAL')
            self.assertEqual(scan['with']['exit-code'], '1')
        self.assertIn('pnpm audit --prod', '\n'.join(runs('frontend')))

    def test_both_images_are_built_and_scanned(self):
        matrix = CI['jobs']['images']['strategy']['matrix']['include']
        self.assertEqual(sorted(m['name'] for m in matrix), ['api', 'web'])

    def test_secret_scanning_sees_the_full_history(self):
        checkout = CI['jobs']['secret-scan']['steps'][0]
        self.assertEqual(checkout['with']['fetch-depth'], 0)
        self.assertTrue(any(u.startswith('gitleaks/gitleaks-action') for u in uses('secret-scan')))

    def test_dependabot_covers_every_ecosystem_in_use(self):
        found = {(u['package-ecosystem'], u['directory']) for u in DEPENDABOT['updates']}
        for expected in (('npm', '/'), ('pip', '/backend'), ('docker', '/'), ('docker', '/backend'), ('github-actions', '/')):
            self.assertIn(expected, found)


if __name__ == '__main__':
    unittest.main()
