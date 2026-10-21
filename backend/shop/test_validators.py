import unittest

from shop.validators import clean_details, is_allowed_image, is_valid_pin_code

HOSTS = ['images.unsplash.com', 'cdn.brajsewa.com']


class PinCodeTests(unittest.TestCase):
    def test_valid_pins(self):
        for pin in ('560001', '281121', '110001', '999999'):
            self.assertTrue(is_valid_pin_code(pin), pin)

    def test_non_ascii_digits_are_rejected(self):
        # these all passed the old r'^\d{6}$'
        for pin in ('٥٦٠٠٠١', '५६००००', '５６０００１', '١٢٣٤٥٦'):
            self.assertFalse(is_valid_pin_code(pin), pin)

    def test_leading_zero_and_wrong_length_are_rejected(self):
        for pin in ('060001', '000000', '56001', '5600011', '', '5600 1', 'abcdef', '56000a'):
            self.assertFalse(is_valid_pin_code(pin), pin)

    def test_trailing_newline_is_rejected(self):
        self.assertFalse(is_valid_pin_code('560001\n'))      # `$` would have accepted this
        self.assertFalse(is_valid_pin_code('\n560001'))

    def test_non_strings_are_rejected(self):
        for pin in (560001, None, ['560001']):
            self.assertFalse(is_valid_pin_code(pin))


class ImageTests(unittest.TestCase):
    def ok(self, value):
        return is_allowed_image(value, HOSTS)

    def test_allowed(self):
        for v in ('', '/braj-seva-hero.webp', '/products/a-b_c.webp', 'https://images.unsplash.com/photo-1606293926075?auto=format',
                  'https://cdn.brajsewa.com/p/1.webp', 'https://IMAGES.UNSPLASH.COM/photo-1'):
            self.assertTrue(self.ok(v), v)

    def test_other_hosts_and_look_alikes_are_refused(self):
        for v in ('https://evil.com/x.png', 'https://images.unsplash.com.evil.com/x', 'https://evilimages.unsplash.com/x',
                  'https://unsplash.com/x', 'https://cdn.brajsewa.com.attacker.io/x'):
            self.assertFalse(self.ok(v), v)

    def test_dangerous_schemes_are_refused(self):
        for v in ('http://images.unsplash.com/x', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'ftp://cdn.brajsewa.com/x',
                  'file:///etc/passwd', 'vbscript:x'):
            self.assertFalse(self.ok(v), v)

    def test_protocol_relative_backslash_and_traversal_style_paths_are_refused(self):
        for v in ('//evil.com/x', '/\\evil.com', '/a b', '/a\tb', '/x?y=1', '/<script>'):
            self.assertFalse(self.ok(v), repr(v))

    def test_userinfo_ports_whitespace_and_control_characters_are_refused(self):
        for v in ('https://user@images.unsplash.com/x', 'https://user:pw@images.unsplash.com/x', 'https://images.unsplash.com:8443/x',
                  ' https://images.unsplash.com/x', 'https://images.unsplash.com/x ', 'https://images.unsplash.com/x\n',
                  'https://images.unsplash.com/a b', 'https://images.unsplash.com:abc/x'):
            self.assertFalse(self.ok(v), repr(v))

    def test_non_strings_are_refused(self):
        for v in (None, 5, ['/a'], {'u': 1}):
            self.assertFalse(self.ok(v))

    def test_an_empty_allow_list_permits_only_site_paths(self):
        self.assertTrue(is_allowed_image('/x.webp', []))
        self.assertFalse(is_allowed_image('https://images.unsplash.com/x', []))


class DetailsTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(clean_details(['108 Tulsi beads', 'Keep dry']), ['108 Tulsi beads', 'Keep dry'])
        self.assertEqual(clean_details([]), [])

    def test_non_lists_are_refused(self):
        for v in ({'a': 1}, 'text', 5, None):
            with self.assertRaises(ValueError):
                clean_details(v)

    def test_non_text_items_are_refused(self):
        # an object in this list made React throw while rendering the product page
        for v in ([{'a': 1}], [1], [None], [['nested']], ['ok', {'x': 'y'}]):
            with self.assertRaises(ValueError):
                clean_details(v)

    def test_size_limits(self):
        clean_details(['x'] * 10)
        with self.assertRaises(ValueError):
            clean_details(['x'] * 11)
        clean_details(['x' * 200])
        with self.assertRaises(ValueError):
            clean_details(['x' * 201])

    def test_blank_and_control_characters_are_refused(self):
        for v in ([''], ['   '], ['a\x00b'], ['line\nbreak'], ['tab\there']):
            with self.assertRaises(ValueError):
                clean_details(v)


if __name__ == '__main__':
    unittest.main()
