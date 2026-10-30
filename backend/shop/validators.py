"""Input rules that need to be exactly right, kept free of Django so they can be unit-tested in isolation."""
import re
from urllib.parse import urlsplit

# Indian PIN codes: six ASCII digits, never starting with 0. In Python 3 `\d` also matches Arabic-Indic, Devanagari and
# full-width digits, and `$` matches before a trailing newline, so neither is used here.
PIN_CODE_PATTERN = r'^[1-9][0-9]{5}\Z'
_PIN_CODE = re.compile(PIN_CODE_PATTERN)

_SITE_PATH = re.compile(r'^/[A-Za-z0-9._~/-]*\Z')          # a path on our own site, e.g. /braj-seva-hero.webp
MAX_DETAILS = 10
MAX_DETAIL_LENGTH = 200
_CONTROL = re.compile(r'[\x00-\x1f\x7f]')


def is_valid_pin_code(value):
    return isinstance(value, str) and _PIN_CODE.match(value) is not None


def is_allowed_image(value, allowed_hosts):
    """A product image must be empty, a path on our own site, or an https URL on an allow-listed host (no userinfo, no
    custom port). Anything else (other hosts, http, javascript:, data:, protocol-relative, backslashes) is refused."""
    if value == '':
        return True
    if not isinstance(value, str) or _CONTROL.search(value) or value != value.strip() or ' ' in value:
        return False
    if value.startswith('/'):
        return not value.startswith('//') and _SITE_PATH.match(value) is not None
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        return False
    return (parts.scheme == 'https' and parts.hostname in {h.lower() for h in allowed_hosts}
            and parts.username is None and parts.password is None and port is None and '\\' not in value)


def clean_details(value):
    """`details` is a short list of plain-text bullet points. Returns the list, or raises ValueError with a reason."""
    if not isinstance(value, list):
        raise ValueError('details must be a list of text lines')
    if len(value) > MAX_DETAILS:
        raise ValueError(f'at most {MAX_DETAILS} detail lines')
    for item in value:
        if not isinstance(item, str):
            raise ValueError('every detail line must be text')           # an object here crashes the product page
        if not item.strip() or len(item) > MAX_DETAIL_LENGTH or _CONTROL.search(item):
            raise ValueError(f'each detail line must be 1 to {MAX_DETAIL_LENGTH} characters with no control characters')
    return value
