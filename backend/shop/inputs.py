"""Small, framework-free helpers for handling untrusted input without raising.

Python's hmac.compare_digest() raises TypeError for a `str` containing non-ASCII characters, and DRF's
`request.data` is whatever JSON the client sent (a list, a string, a number, null), not necessarily a dict.
Code that assumed otherwise turned bad input into HTTP 500 responses, including before authentication.
"""
import hmac
from collections.abc import Mapping


def safe_equal(a, b):
    """Constant-time equality for any text. Never raises, whatever characters are involved."""
    return hmac.compare_digest(str(a).encode('utf-8'), str(b).encode('utf-8'))


def mapping_or_empty(value):
    """Return `value` if it is dict-like, else {}. Use on request.data before calling .get()."""
    return value if isinstance(value, Mapping) else {}


def dig(obj, *keys):
    """Follow nested keys, returning {} as soon as something on the path is not a mapping."""
    for key in keys:
        obj = mapping_or_empty(obj).get(key, {})
    return obj if isinstance(obj, Mapping) else {}
