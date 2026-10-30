"""Framework-free mixin that makes a rate limiter FAIL OPEN when its backing store is unavailable.

DRF keeps throttle counters in Django's cache (Redis in production). If that cache is unreachable, reading or writing a
counter raises, and every throttled request (login, register, cart quote, order, payment) turns into an HTTP 500: a
cache outage would take the whole store down. Rate limiting is a protection, not a function of the shop, so on failure
we allow the request and log loudly: that log line is what tells you protection is off.
"""
import logging
import time

logger = logging.getLogger(__name__)
LOG_EVERY_SECONDS = 60          # an outage must not also flood the logs, once per minute is enough to alert on


class FailOpenMixin:
    _last_logged = 0.0

    def allow_request(self, request, view):
        try:
            return super().allow_request(request, view)
        except Exception:
            now = time.monotonic()
            if now - FailOpenMixin._last_logged >= LOG_EVERY_SECONDS:
                FailOpenMixin._last_logged = now
                logger.error('throttle_backend_unavailable: rate limiting is OFF, failing open', exc_info=True)
            return True
