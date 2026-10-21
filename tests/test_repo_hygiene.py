"""Repository hygiene: real environment files must never be committable, and no obvious secret may be tracked.
Run from the repository root:  python3 -m unittest tests.test_repo_hygiene
"""
import re
import subprocess
import unittest

SECRET_PATTERNS = [
    re.compile(r'rzp_live_[A-Za-z0-9]{8,}'),                 # Razorpay live key id
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(r'AKIA[0-9A-Z]{16}'),                          # AWS access key id
]


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True)


def ignored(path):
    return git('check-ignore', '-q', path).returncode == 0


class RepoHygiene(unittest.TestCase):
    def test_real_env_files_are_ignored(self):
        for path in ['.env', '.env.production', '.env.staging', '.env.local', 'backend/.env', 'backend/.env.production']:
            self.assertTrue(ignored(path), f'{path} would be committed by `git add .`')

    def test_templates_are_not_ignored(self):
        for path in ['.env.example', '.env.local.example']:
            self.assertFalse(ignored(path), f'{path} must stay committable')

    def test_only_templates_are_tracked(self):
        tracked = git('ls-files').stdout.split()
        offenders = [f for f in tracked if re.search(r'(^|/)\.env(\..+)?$', f) and not f.endswith('.example')]
        self.assertEqual(offenders, [], 'an environment file is tracked')

    def test_no_obvious_secret_is_tracked(self):
        hits = []
        for f in git('ls-files').stdout.split():
            try:
                text = open(f, encoding='utf-8').read()
            except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
                continue
            hits += [f'{f}: {p.pattern}' for p in SECRET_PATTERNS if p.search(text)]
        self.assertEqual(hits, [])


if __name__ == '__main__':
    unittest.main()
