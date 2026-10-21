"""Settings are plain Python, so we test them by importing config.settings in a fresh interpreter with a chosen
environment. Run:  cd backend && python -m unittest config.test_settings_guards -v
"""
import os
import subprocess
import sys
import unittest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Assembled at runtime so the repository's secret scan does not flag a realistic-looking fixture.
LIVE_KEY = 'rzp_' + 'live_' + 'ABCDEF123456'
TEST_KEY = 'rzp_' + 'test_' + 'ABCDEF123456'

# A production-shaped environment that passes every guard. Individual tests change one thing.
GOOD_ENV = {
    'DJANGO_SECRET_KEY': 'q8Zt2vKx9PbNf4LwRc7YhJm3SdAe6UgXo1VnTiBk5CzQpWy0DrEaHuFlMj8GsOtIc',
    'JWT_SIGNING_KEY': 'Hk3Vb9WnPz5QdLx7RtYc2MfGj8SaEu4NoXi1BwKe6ZpTqUr0DlCvAmFgJhSyOtIdN',
    'DJANGO_DEBUG': 'false', 'DJANGO_HTTPS_ONLY': 'true', 'API_NUM_PROXIES': '1',
    'POSTGRES_DB': 'brajsewa', 'POSTGRES_USER': 'app', 'POSTGRES_PASSWORD': 'x', 'POSTGRES_HOST': 'db',
    'RAZORPAY_KEY_ID': LIVE_KEY, 'RAZORPAY_KEY_SECRET': 's', 'RAZORPAY_WEBHOOK_SECRET': 'w',
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
        code, _, err = load_settings({'DJANGO_DEBUG': 'true', 'DJANGO_HTTPS_ONLY': 'false'}, drop=['API_NUM_PROXIES', 'RAZORPAY_KEY_ID'])
        self.assertEqual(code, 0, err)
        self.assertNotIn('API_NUM_PROXIES', err)



class SecretKeyTests(unittest.TestCase):
    def assertRefused(self, overrides=None, drop=(), message=''):
        code, _, err = load_settings(overrides, drop)
        self.assertNotEqual(code, 0, 'settings should have refused to load')
        self.assertIn('ImproperlyConfigured', err)
        if message:
            self.assertIn(message, err)

    def test_short_secret_key_is_refused_in_production(self):
        self.assertRefused({'DJANGO_SECRET_KEY': 'dev'}, message='DJANGO_SECRET_KEY is too weak')

    def test_long_but_repetitive_secret_key_is_refused(self):
        self.assertRefused({'DJANGO_SECRET_KEY': 'a' * 80}, message='too weak')

    def test_weak_secret_key_is_fine_in_debug(self):
        code, _, err = load_settings({'DJANGO_SECRET_KEY': 'dev', 'DJANGO_DEBUG': 'true', 'DJANGO_HTTPS_ONLY': 'false'}, drop=['JWT_SIGNING_KEY', 'RAZORPAY_KEY_ID'])
        self.assertEqual(code, 0, err)

    def test_jwt_key_is_required_in_production(self):
        self.assertRefused(drop=['JWT_SIGNING_KEY'], message='JWT_SIGNING_KEY is required')

    def test_jwt_key_must_differ_from_secret_key(self):
        self.assertRefused({'JWT_SIGNING_KEY': GOOD_ENV['DJANGO_SECRET_KEY']}, message='must differ')

    def test_weak_jwt_key_is_refused(self):
        self.assertRefused({'JWT_SIGNING_KEY': 'short'}, message='JWT_SIGNING_KEY is too weak')

    def test_jwt_settings_use_the_dedicated_key_issuer_and_audience(self):
        code, out, err = load_settings(expr="bool(s.SIMPLE_JWT['SIGNING_KEY'] == s.os.environ['JWT_SIGNING_KEY'] and s.SIMPLE_JWT['ISSUER'] and s.SIMPLE_JWT['AUDIENCE'] and s.SIMPLE_JWT['SIGNING_KEY'] != s.SECRET_KEY)")
        self.assertEqual((code, out), (0, 'True'), err)


class TransportTests(unittest.TestCase):
    def test_production_without_https_enforcement_is_refused(self):
        code, _, err = load_settings({'DJANGO_HTTPS_ONLY': 'false'})
        self.assertNotEqual(code, 0)
        self.assertIn('Refusing to start in production without HTTPS', err)

    def test_explicit_opt_out_is_allowed_for_local_runs(self):
        code, _, err = load_settings({'DJANGO_HTTPS_ONLY': 'false', 'DJANGO_ALLOW_INSECURE_HTTP': 'true'})
        self.assertEqual(code, 0, err)

    def test_https_is_on_by_default_in_production(self):
        code, out, err = load_settings(drop=['DJANGO_HTTPS_ONLY'], expr='s.HTTPS_ONLY and s.SECURE_SSL_REDIRECT')
        self.assertEqual((code, out), (0, 'True'), err)


class RazorpayKeyModeTests(unittest.TestCase):
    def test_live_key_in_production_is_fine(self):
        code, _, err = load_settings()
        self.assertEqual(code, 0, err)

    def test_test_key_in_production_is_refused(self):
        code, _, err = load_settings({'RAZORPAY_KEY_ID': TEST_KEY})
        self.assertNotEqual(code, 0)
        self.assertIn('TEST key', err)

    def test_test_key_allowed_for_staging_with_the_explicit_flag(self):
        code, _, err = load_settings({'RAZORPAY_KEY_ID': TEST_KEY, 'RAZORPAY_ALLOW_TEST_KEYS': 'true'})
        self.assertEqual(code, 0, err)

    def test_live_key_with_debug_is_refused(self):
        code, _, err = load_settings({'DJANGO_DEBUG': 'true', 'DJANGO_HTTPS_ONLY': 'false'})
        self.assertNotEqual(code, 0)
        self.assertIn('LIVE key', err)

    def test_no_razorpay_key_is_allowed(self):
        code, _, err = load_settings(drop=['RAZORPAY_KEY_ID'])   # CI and one-off tasks run without payment keys
        self.assertEqual(code, 0, err)



class DatabaseSettingsTests(unittest.TestCase):
    def test_connections_are_reused_and_health_checked(self):
        code, out, err = load_settings(expr="(s.DATABASES['default']['CONN_MAX_AGE'], s.DATABASES['default']['CONN_HEALTH_CHECKS'])")
        self.assertEqual((code, out), (0, '(60, True)'), err)

    def test_connection_lifetime_is_configurable(self):
        code, out, err = load_settings({'DB_CONN_MAX_AGE': '0'}, expr="s.DATABASES['default']['CONN_MAX_AGE']")
        self.assertEqual((code, out), (0, '0'), err)

    def test_connect_timeout_is_bounded(self):
        code, out, err = load_settings(expr="s.DATABASES['default']['OPTIONS']['connect_timeout']")
        self.assertEqual((code, out), (0, '5'), err)

    def test_require_tls_is_applied_and_quiet(self):
        code, out, err = load_settings({'POSTGRES_SSLMODE': 'require'}, expr="s.DATABASES['default']['OPTIONS']['sslmode']")
        self.assertEqual((code, out), (0, 'require'), err)
        self.assertNotIn('POSTGRES_SSLMODE', err)

    def test_weak_sslmode_in_production_warns(self):
        for mode in ('disable', 'allow', 'prefer'):
            code, _, err = load_settings({'POSTGRES_SSLMODE': mode})
            self.assertEqual(code, 0, err)
            self.assertIn('database traffic may be unencrypted', err, mode)



class ThrottleSettingsTests(unittest.TestCase):
    def test_default_throttle_class_fails_open(self):
        code, out, err = load_settings(expr="s.REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES']")
        self.assertEqual((code, out), (0, "['shop.throttling.FailOpenScopedRateThrottle']"), err)



class LoggingSettingsTests(unittest.TestCase):
    def test_logging_is_json_with_a_request_id(self):
        code, out, err = load_settings(expr="s.LOGGING['formatters']['json']['()'] + '|' + ','.join(s.LOGGING['handlers']['console']['filters'])")
        self.assertEqual((code, out), (0, 'pythonjsonlogger.json.JsonFormatter|request_id'), err)

    def test_log_level_is_configurable(self):
        code, out, err = load_settings({'LOG_LEVEL': 'WARNING'}, expr="s.LOGGING['root']['level']")
        self.assertEqual((code, out), (0, 'WARNING'), err)

    def test_request_id_middleware_follows_the_health_middleware(self):
        code, out, err = load_settings(expr='s.MIDDLEWARE[:2]')
        self.assertEqual((code, out), (0, "['config.health.HealthCheckMiddleware', 'config.logging_utils.RequestIdMiddleware']"), err)

    def test_json_logger_is_a_declared_dependency(self):
        with open(os.path.join(BACKEND, 'requirements.txt')) as handle:
            self.assertIn('python-json-logger', handle.read())



class AdminSessionTests(unittest.TestCase):
    def test_admin_session_is_eight_hours_not_two_weeks(self):
        code, out, err = load_settings(expr='s.SESSION_COOKIE_AGE')
        self.assertEqual((code, out), (0, '28800'), err)

    def test_admin_session_length_is_configurable(self):
        code, out, err = load_settings({'ADMIN_SESSION_HOURS': '1'}, expr='s.SESSION_COOKIE_AGE')
        self.assertEqual((code, out), (0, '3600'), err)

    def test_session_ends_with_the_browser_and_is_strict(self):
        code, out, err = load_settings(expr='(s.SESSION_EXPIRE_AT_BROWSER_CLOSE, s.SESSION_COOKIE_SAMESITE)')
        self.assertEqual((code, out), (0, "(True, 'Strict')"), err)

    def test_default_admin_path_in_production_warns(self):
        code, _, err = load_settings()
        self.assertEqual(code, 0, err)
        self.assertIn('default /admin/ path', err)

    def test_custom_admin_path_is_quiet(self):
        code, _, err = load_settings({'DJANGO_ADMIN_PATH': 'staff-7f3a/'})
        self.assertEqual(code, 0, err)
        self.assertNotIn('default /admin/ path', err)


if __name__ == '__main__':
    unittest.main()
