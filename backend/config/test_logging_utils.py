"""No Django needed:  cd backend && python -m unittest config.test_logging_utils -v"""
import copy
import io
import logging
import logging.config
import unittest

from config import logging_utils as lu


class FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


class FakeResponse(dict):
    pass


def run_middleware(headers=None):
    seen = []
    middleware = lu.RequestIdMiddleware(lambda request: (seen.append(lu.request_id_var.get()), FakeResponse())[1])
    response = middleware(FakeRequest(headers))
    return seen[0], response['X-Request-ID']


class RequestIdTests(unittest.TestCase):
    def test_a_well_formed_id_is_kept_and_echoed(self):
        inside, echoed = run_middleware({'X-Request-ID': 'abc-123.DEF_9'})
        self.assertEqual((inside, echoed), ('abc-123.DEF_9', 'abc-123.DEF_9'))

    def test_hostile_ids_are_replaced(self):
        for bad in ('evil\nINFO forged log line', 'has space', 'semi;colon', '<script>', 'a' * 65, '', '\r\n'):
            inside, echoed = run_middleware({'X-Request-ID': bad})
            self.assertRegex(echoed, r'^[0-9a-f]{32}$', repr(bad))
            self.assertEqual(inside, echoed)

    def test_a_missing_id_is_generated_and_unique(self):
        self.assertNotEqual(run_middleware()[1], run_middleware()[1])

    def test_the_id_does_not_leak_into_the_next_request_or_outside_one(self):
        run_middleware({'X-Request-ID': 'first'})
        self.assertEqual(lu.request_id_var.get(), '-')

    def test_the_id_is_reset_even_when_the_view_raises(self):
        def boom(request):
            raise RuntimeError('view failed')
        with self.assertRaises(RuntimeError):
            lu.RequestIdMiddleware(boom)(FakeRequest({'X-Request-ID': 'will-reset'}))
        self.assertEqual(lu.request_id_var.get(), '-')


class LoggingTests(unittest.TestCase):
    def test_log_records_carry_the_request_id(self):
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.addFilter(lu.RequestIdFilter())
        handler.setFormatter(logging.Formatter('%(request_id)s|%(message)s'))
        log = logging.getLogger('test.request.id')
        log.addHandler(handler)
        log.setLevel(logging.INFO)
        token = lu.request_id_var.set('req-42')
        try:
            log.info('hello')
        finally:
            lu.request_id_var.reset(token)
            log.removeHandler(handler)
        self.assertEqual(stream.getvalue().strip(), 'req-42|hello')

    def test_config_is_structurally_valid_for_dictconfig(self):
        cfg = copy.deepcopy(lu.logging_config('WARNING'))
        self.assertEqual(cfg['root']['level'], 'WARNING')
        cfg['formatters']['json'] = {'format': '%(levelname)s %(request_id)s %(message)s'}   # stand-in: the real one needs python-json-logger
        logging.config.dictConfig(cfg)          # raises if filters/handlers/formatters are wired wrongly
        logging.config.dictConfig({'version': 1})   # restore a neutral config for other tests

    def test_config_uses_the_json_formatter_and_the_request_id_filter(self):
        cfg = lu.logging_config()
        self.assertEqual(cfg['formatters']['json']['()'], 'pythonjsonlogger.json.JsonFormatter')
        self.assertEqual(cfg['handlers']['console']['filters'], ['request_id'])
        self.assertIn('%(request_id)s', cfg['formatters']['json']['format'])


if __name__ == '__main__':
    unittest.main()
