"""Request-id correlation and JSON logging.

The Next.js proxy (or the load balancer) supplies X-Request-ID; every log line written while serving that request
carries it, and it is echoed in the response, so one id ties together a customer's error report, the Next.js log and
the Django log. The incoming value is UNTRUSTED: it is length-limited and character-restricted so it cannot be used to
forge log lines.
"""
import contextvars
import logging
import re
import uuid

request_id_var = contextvars.ContextVar('request_id', default='-')
_SAFE = re.compile(r'^[A-Za-z0-9._-]{1,64}$')


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_var.get()
        return True


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied = request.headers.get('X-Request-ID', '')
        request_id = supplied if _SAFE.match(supplied) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response['X-Request-ID'] = request_id
        return response


def logging_config(level='INFO'):
    """LOGGING dict: one JSON object per line on stdout (collected by the awslogs driver / Fluent Bit).
    Requires `python-json-logger` >= 3.1 (class path pythonjsonlogger.json.JsonFormatter)."""
    return {
        'version': 1,
        'disable_existing_loggers': False,
        'filters': {'request_id': {'()': 'config.logging_utils.RequestIdFilter'}},
        'formatters': {'json': {
            '()': 'pythonjsonlogger.json.JsonFormatter',
            'format': '%(asctime)s %(levelname)s %(name)s %(message)s %(request_id)s',
            'rename_fields': {'asctime': 'timestamp', 'levelname': 'level'},
        }},
        'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'json', 'filters': ['request_id']}},
        'root': {'handlers': ['console'], 'level': level},
    }
