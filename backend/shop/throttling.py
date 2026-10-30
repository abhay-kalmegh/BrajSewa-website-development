from rest_framework.throttling import ScopedRateThrottle

from .failopen import FailOpenMixin


class FailOpenScopedRateThrottle(FailOpenMixin, ScopedRateThrottle):
    """The default throttle for every view that sets `throttle_scope`; allows the request if the cache is down."""
