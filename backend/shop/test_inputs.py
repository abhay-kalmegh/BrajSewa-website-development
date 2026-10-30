import unittest

from shop.inputs import dig, mapping_or_empty, safe_equal


class SafeEqualTests(unittest.TestCase):
    def test_equal_and_unequal_ascii(self):
        self.assertTrue(safe_equal('abc123', 'abc123'))
        self.assertFalse(safe_equal('abc123', 'abc124'))

    def test_non_ascii_never_raises(self):
        # hmac.compare_digest('abc', 'é') raises TypeError: this is the crash being fixed
        self.assertFalse(safe_equal('deadbeef', 'é'))
        self.assertFalse(safe_equal('é', 'deadbeef'))
        self.assertTrue(safe_equal('é', 'é'))

    def test_different_lengths_and_empty(self):
        self.assertFalse(safe_equal('a', 'aa'))
        self.assertTrue(safe_equal('', ''))

    def test_non_string_input_is_coerced(self):
        self.assertFalse(safe_equal(None, 'None-but-not-equal'))
        self.assertTrue(safe_equal(123, '123'))


class MappingTests(unittest.TestCase):
    def test_non_mappings_become_empty(self):
        for bad in ([], [1, 2], 'text', 123, None, 4.5, True):
            self.assertEqual(mapping_or_empty(bad), {}, repr(bad))
            self.assertEqual(mapping_or_empty(bad).get('username', ''), '')   # the expression that used to crash

    def test_mappings_pass_through(self):
        self.assertEqual(mapping_or_empty({'a': 1}), {'a': 1})

    def test_dig_follows_nested_keys(self):
        body = {'payload': {'payment': {'entity': {'id': 'pay_1'}}}}
        self.assertEqual(dig(body, 'payload', 'payment', 'entity'), {'id': 'pay_1'})

    def test_dig_is_safe_on_wrong_shapes(self):
        for body in ({'payload': []}, {'payload': {'payment': 'x'}}, {'payload': {'payment': {'entity': None}}}, [], None):
            self.assertEqual(dig(body, 'payload', 'payment', 'entity'), {}, repr(body))


if __name__ == '__main__':
    unittest.main()
