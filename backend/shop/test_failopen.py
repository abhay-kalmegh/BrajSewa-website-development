import logging
import unittest
from unittest.mock import patch

from shop import failopen
from shop.failopen import FailOpenMixin


class FakeThrottle:
    """Stands in for DRF's throttle: returns `result`, or raises `error` (like a dead Redis)."""
    result, error = True, None

    def allow_request(self, request, view):
        if self.error:
            raise self.error
        return self.result


class GuardedThrottle(FailOpenMixin, FakeThrottle):
    pass


class FailOpenTests(unittest.TestCase):
    def setUp(self):
        FailOpenMixin._last_logged = 0.0
        logging.disable(logging.CRITICAL)

    def tearDown(self):
        logging.disable(logging.NOTSET)

    def make(self, result=True, error=None):
        t = GuardedThrottle()
        t.result, t.error = result, error
        return t

    def test_normal_decisions_pass_through_untouched(self):
        self.assertIs(self.make(result=True).allow_request(None, None), True)
        self.assertIs(self.make(result=False).allow_request(None, None), False)   # a real limit is still enforced

    def test_backend_failure_allows_the_request(self):
        for error in (ConnectionError('redis down'), TimeoutError(), OSError('network unreachable'), RuntimeError('boom')):
            self.assertIs(self.make(error=error).allow_request(None, None), True, repr(error))

    def test_failure_is_logged_loudly_but_at_most_once_per_minute(self):
        t = self.make(error=ConnectionError('redis down'))
        logging.disable(logging.NOTSET)
        with patch.object(failopen.logger, 'error') as log, patch('shop.failopen.time.monotonic') as clock:
            clock.return_value = 1000.0
            t.allow_request(None, None); t.allow_request(None, None); t.allow_request(None, None)
            self.assertEqual(log.call_count, 1, 'a burst must produce one log line, not a flood')
            clock.return_value = 1000.0 + failopen.LOG_EVERY_SECONDS + 1
            t.allow_request(None, None)
            self.assertEqual(log.call_count, 2, 'logs again after the quiet period')
            self.assertIn('throttle_backend_unavailable', log.call_args[0][0])

    def test_the_mixin_has_no_dependency_on_django_or_drf(self):
        import sys
        self.assertNotIn('rest_framework', sys.modules.get('shop.failopen').__dict__)
        self.assertNotIn('django', sys.modules.get('shop.failopen').__dict__)


if __name__ == '__main__':
    unittest.main()
