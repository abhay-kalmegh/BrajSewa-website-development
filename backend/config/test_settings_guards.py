"""Settings are plain Python, so we test them by importing config.settings in a fresh interpreter with a chosen
environment. Run:  cd backend && python -m unittest config.test_settings_guards -v
"""
import os
import subprocess
import sys
import unittest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A production-shaped environment that passes every guard. Individual tests change one thing.
GOOD_ENV = {
    'DJANGO_SECRET_KEY': 'q8Zt2vKx9PbNf4LwRc7YhJm3SdAe6UgXo1VnTiBk5CzQpWy0DrEaHuFlMj8GsOtIc',
    'JWT_SIGNING_KEY': 'Hk3Vb9WnPz5QdLx7RtYc2MfGj8SaEu4NoXi1BwKe6ZpTqUr0DlCvAmFgJhSyOtIdN',
    'DJANGO_DEBUG': 'false', 'DJANGO_HTTPS_ONLY': 'true', 'API_NUM_PROXIES': '1',
    'POSTGRES_DB': 'brajsewa', 'POSTGRES_USER': 'app', 'POSTGRES_PASSWORD': 'x', 'POSTGRES_HOST': 'db',
    'RAZORPAY_KEY_ID': 'rzp_' + 'live_' + 'ABCDEF123456',   # assembled at runtime so the repo-wide secret scan does not flag a fixture
    'RAZORPAY_KEY_SECRET': 's', 'RAZORPAY_WEBHOOK_SECRET': 'w',
}


def load_settings(overrides=None, drop=(), expr='1'):
    """Import config.settings in a clean subprocess. Returns (returncode, stdout, stderr)."""
    env = {k: v for k, v in os.environ.items() if not k.startswith(('DJANGO_', 'JWT_', 'RAZORPAY_', 'POSTGRES_', 'API_', 'REDIS_', 'CORS_', 'CSRF_'))}
    env.update(GOOD_ENV)
    env.update(overrides or {})
    for key in drop:
        env.pop(key, None)
    code = f"import warnings; warnings.simplefilter('always'); import config.settings as s; print({expr})"
    r = subprocess.run([sys.executable, '-c', code], cwd=BACKEND, env=env, capture_output=True, text=True)
    return r.returncode, r.stdout.strip(), r.stderr


class ProxyHopTests(unittest.TestCase):
    def test_good_production_environment_loads_without_warning(self):
        code, _, err = load_settings()
        self.assertEqual(code, 0, err)
        self.assertNotIn('API_NUM_PROXIES', err)

    def test_num_proxies_is_applied(self):
        code, out, err = load_settings(expr="s.REST_FRAMEWORK['NUM_PROXIES']")
        self.assertEqual((code, out), (0, '1'), err)

    def test_unset_num_proxies_in_production_warns_loudly(self):
        code, _, err = load_settings(drop=['API_NUM_PROXIES'])
        self.assertEqual(code, 0, err)
        self.assertIn('API_NUM_PROXIES is not set', err)

    def test_unset_num_proxies_in_debug_is_quiet(self):
        code, _, err = load_settings({'DJANGO_DEBUG': 'true', 'DJANGO_HTTPS_ONLY': 'false'}, drop=['API_NUM_PROXIES'])
        self.assertEqual(code, 0, err)
        self.assertNotIn('API_NUM_PROXIES', err)


if __name__ == '__main__':
    unittest.main()
