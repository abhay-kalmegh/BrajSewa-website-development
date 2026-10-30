import hashlib
import hmac
import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.conf import settings as django_settings
from django.contrib import admin
from django.test import RequestFactory
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework.throttling import SimpleRateThrottle

from .models import Order, Product, SellerProfile
from .serializers import CustomerSerializer, ProfileSerializer

PASSWORD = 'correct-horse-9'
CUSTOMER = {'email': 'a@b.com', 'phone': '9999999999', 'firstName': 'A', 'address': '1 Seva Kunj',
            'city': 'Vrindavan', 'state': 'UP', 'postalCode': '281121'}


def sign(secret, message):
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


@override_settings(SECURE_SSL_REDIRECT=False, RAZORPAY_KEY_ID='key', RAZORPAY_KEY_SECRET='secret',
                   RAZORPAY_WEBHOOK_SECRET='whsec')
class ShopTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache
        self.user = get_user_model().objects.create_user('a@b.com', 'a@b.com', PASSWORD, first_name='A')
        self.product = Product.objects.create(name='Mala', slug='mala', price_paise=29_900, inventory=3)

    def place_order(self, qty=1, lines=None, razorpay_id='order_X', **extra):
        self.client.force_authenticate(self.user)
        body = {'customer': CUSTOMER, 'lines': lines or [{'productId': self.product.id, 'quantity': qty}], **extra}
        with patch('shop.views.razorpay.Client') as client:
            client.return_value.order.create.return_value = {'id': razorpay_id}
            return self.client.post('/api/v1/orders/', body, format='json')


class SerializerTests(ShopTestCase):
    def test_postal_code_accepts_six_digits_only(self):
        base = {**CUSTOMER}
        for good in ('560001', '281121'):
            self.assertTrue(CustomerSerializer(data={**base, 'postalCode': good}).is_valid(), good)
        for bad in ('56001', '5600011', 'abcdef', '56 001', '\\d{6}'):
            self.assertFalse(CustomerSerializer(data={**base, 'postalCode': bad}).is_valid(), bad)

    def test_profile_serializer_builds(self):
        data = ProfileSerializer(self.user).data
        self.assertEqual(data['email'], 'a@b.com')
        self.assertEqual(data['role'], 'buyer')


class AuthTests(ShopTestCase):
    def test_register_normalises_email_and_rejects_duplicates_case_insensitively(self):
        payload = {'email': 'New@Example.com', 'password': PASSWORD, 'firstName': 'N'}
        r = self.client.post('/api/v1/auth/register/', payload, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['user']['email'], 'new@example.com')
        again = self.client.post('/api/v1/auth/register/', {**payload, 'email': 'NEW@example.com'}, format='json')
        self.assertEqual(again.status_code, 409)

    def test_register_enforces_password_validators(self):
        r = self.client.post('/api/v1/auth/register/',
                             {'email': 'x@y.com', 'password': '12345678', 'firstName': 'X'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('password', r.data)

    def test_login_is_case_insensitive_on_email(self):
        r = self.client.post('/api/v1/auth/token/', {'username': 'A@B.com', 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('access', r.data)

    def test_login_is_throttled_per_account(self):
        codes = [self.client.post('/api/v1/auth/token/', {'username': 'a@b.com', 'password': 'wrong'},
                                  format='json').status_code for _ in range(9)]
        self.assertEqual(codes[:8], [401] * 8)
        self.assertEqual(codes[8], 429)

    def test_logout_blacklists_refresh_token(self):
        tokens = self.client.post('/api/v1/auth/token/', {'username': 'a@b.com', 'password': PASSWORD},
                                  format='json').data
        self.assertEqual(self.client.post('/api/v1/auth/token/blacklist/', {'refresh': tokens['refresh']},
                                          format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/auth/token/refresh/', {'refresh': tokens['refresh']},
                                          format='json').status_code, 401)


class PermissionTests(ShopTestCase):
    def test_catalog_is_public(self):
        self.assertEqual(self.client.get('/api/v1/products/').status_code, 200)

    def test_private_endpoints_require_auth(self):
        for method, url in (('get', '/api/v1/account/me/'), ('post', '/api/v1/orders/'),
                            ('get', '/api/v1/orders/1/'), ('get', '/api/v1/seller/products/'),
                            ('post', '/api/v1/payments/razorpay/verify/')):
            self.assertEqual(getattr(self.client, method)(url).status_code, 401, url)

    def test_orders_are_private_to_their_owner(self):
        self.assertEqual(self.place_order().status_code, 201)
        order = Order.objects.get()
        other = get_user_model().objects.create_user('o@b.com', 'o@b.com', PASSWORD)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'/api/v1/orders/{order.id}/').status_code, 404)

    def test_unapproved_seller_cannot_publish(self):
        SellerProfile.objects.create(user=self.user, display_name='A', approved=False)
        self.client.force_authenticate(self.user)
        body = {'name': 'Ittar', 'slug': 'ittar', 'price_paise': 24_900, 'inventory': 5}
        self.assertEqual(self.client.post('/api/v1/seller/products/', body, format='json').status_code, 403)
        SellerProfile.objects.filter(user=self.user).update(approved=True)
        self.assertEqual(self.client.post('/api/v1/seller/products/', body, format='json').status_code, 201)


class OrderCreationTests(ShopTestCase):
    def test_total_includes_server_side_shipping_and_stores_address(self):
        r = self.place_order()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['amount'], 29_900 + 4_900)  # below the free-shipping threshold
        order = Order.objects.get()
        self.assertEqual((order.city, order.postal_code, order.first_name), ('Vrindavan', '281121', 'A'))
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 2)

    def test_free_shipping_above_threshold(self):
        self.assertEqual(self.place_order(qty=2).data['amount'], 59_800)

    def test_duplicate_lines_are_merged_before_the_stock_check(self):
        lines = [{'productId': self.product.id, 'quantity': 2}, {'productId': self.product.id, 'quantity': 2}]
        self.assertEqual(self.place_order(lines=lines).status_code, 409)
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 3)

    def test_oversell_is_rejected_and_nothing_is_created(self):
        self.assertEqual(self.place_order(qty=4).status_code, 409)
        self.assertEqual(Order.objects.count(), 0)

    def test_razorpay_failure_restores_stock(self):
        self.client.force_authenticate(self.user)
        body = {'customer': CUSTOMER, 'lines': [{'productId': self.product.id, 'quantity': 2}]}
        with patch('shop.views.razorpay.Client') as client:
            client.return_value.order.create.side_effect = RuntimeError('provider down')
            r = self.client.post('/api/v1/orders/', body, format='json')
        self.assertEqual(r.status_code, 502)
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 3)
        self.assertEqual(Order.objects.get().status, Order.Status.FAILED)

    def test_invalid_pin_code_is_rejected(self):
        self.client.force_authenticate(self.user)
        body = {'customer': {**CUSTOMER, 'postalCode': 'abc'}, 'lines': [{'productId': self.product.id, 'quantity': 1}]}
        self.assertEqual(self.client.post('/api/v1/orders/', body, format='json').status_code, 400)


class PaymentTests(ShopTestCase):
    VERIFY = '/api/v1/payments/razorpay/verify/'
    WEBHOOK = '/api/v1/payments/razorpay/webhook/'

    def verify_payload(self, order_id='order_X', payment_id='pay_1', secret='secret'):
        return {'razorpay_order_id': order_id, 'razorpay_payment_id': payment_id,
                'razorpay_signature': sign(secret, f'{order_id}|{payment_id}'.encode())}

    def webhook(self, amount=34_800, event='payment.captured', signature=None, order_id='order_X'):
        raw = json.dumps({'event': event, 'payload': {'payment': {'entity': {
            'id': 'pay_1', 'order_id': order_id, 'amount': amount}}}}).encode()
        return self.client.post(self.WEBHOOK, raw, content_type='application/json',
                                HTTP_X_RAZORPAY_SIGNATURE=signature or sign('whsec', raw))

    def test_verify_marks_order_paid_and_is_idempotent(self):
        self.place_order()
        for _ in range(2):
            r = self.client.post(self.VERIFY, self.verify_payload(), format='json')
            self.assertEqual(r.status_code, 200, r.data)
        order = Order.objects.get()
        self.assertEqual((order.status, order.razorpay_payment_id), (Order.Status.PAID, 'pay_1'))

    def test_verify_rejects_bad_signature(self):
        self.place_order()
        payload = self.verify_payload(secret='wrong')
        self.assertEqual(self.client.post(self.VERIFY, payload, format='json').status_code, 400)
        self.assertEqual(Order.objects.get().status, Order.Status.PENDING)

    def test_verify_unknown_order_is_404_not_500(self):
        self.client.force_authenticate(self.user)
        r = self.client.post(self.VERIFY, self.verify_payload(order_id='order_nope'), format='json')
        self.assertEqual(r.status_code, 404)

    def test_verify_cannot_be_used_on_someone_elses_order(self):
        self.place_order()
        other = get_user_model().objects.create_user('o@b.com', 'o@b.com', PASSWORD)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(self.VERIFY, self.verify_payload(), format='json').status_code, 404)

    def test_webhook_requires_valid_signature(self):
        self.place_order()
        self.client.force_authenticate(None)
        self.assertEqual(self.webhook(signature='nope').status_code, 400)
        self.assertEqual(Order.objects.get().status, Order.Status.PENDING)

    def test_webhook_is_idempotent(self):
        self.place_order()
        self.client.force_authenticate(None)
        self.assertEqual(self.webhook().status_code, 200)
        self.assertEqual(self.webhook().status_code, 200)
        self.assertEqual(Order.objects.get().status, Order.Status.PAID)

    def test_webhook_amount_mismatch_does_not_mark_paid(self):
        self.place_order()
        self.client.force_authenticate(None)
        self.assertEqual(self.webhook(amount=100).status_code, 200)  # acknowledged, but not applied
        self.assertEqual(Order.objects.get().status, Order.Status.PENDING)

    def test_webhook_for_unknown_order_is_acknowledged(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.webhook(order_id='order_unknown').status_code, 200)


class InventoryRestorationTests(ShopTestCase):
    def age(self, order, minutes):
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(minutes=minutes))

    def run_expiry(self):
        out = StringIO()
        call_command('expire_orders', '--minutes', '30', stdout=out)
        return out.getvalue()

    def test_stale_unpaid_orders_release_stock(self):
        self.place_order(qty=2)
        order = Order.objects.get()
        self.age(order, 45)
        self.assertIn('Expired 1', self.run_expiry())
        order.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(order.status, Order.Status.EXPIRED)
        self.assertEqual(self.product.inventory, 3)

    def test_recent_and_paid_orders_are_left_alone(self):
        self.place_order()
        recent = Order.objects.get()
        self.age(recent, 5)
        other = Product.objects.create(name='Other Product', slug='other-product', price_paise=1000,
                                       inventory=1, active=True)
        self.place_order(lines=[{'productId': other.id, 'quantity': 1}], razorpay_id='order_Y')
        paid = Order.objects.exclude(pk=recent.pk).get()
        Order.objects.filter(pk=paid.pk).update(status=Order.Status.PAID)
        self.age(paid, 120)
        self.assertIn('Expired 0', self.run_expiry())
        self.product.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(self.product.inventory, 2)
        self.assertEqual(other.inventory, 1)

    def test_expiry_is_idempotent(self):
        self.place_order()
        self.age(Order.objects.get(), 45)
        self.run_expiry()
        self.assertIn('Expired 0', self.run_expiry())
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 3)  # not double-restored


class CatalogTests(ShopTestCase):
    def test_list_hides_unlisted_and_sold_out_products(self):
        Product.objects.create(name='Hidden', slug='hidden', price_paise=100, inventory=5, listed=False)
        Product.objects.create(name='Gone', slug='gone', price_paise=100, inventory=0)
        slugs = [p['slug'] for p in self.client.get('/api/v1/products/').data]
        self.assertEqual(slugs, ['mala'])

    def test_detail_resolves_by_slug_including_sold_out_but_not_inactive(self):
        Product.objects.create(name='Gone', slug='gone', price_paise=100, inventory=0)
        Product.objects.create(name='Off', slug='off', price_paise=100, inventory=5, active=False)
        r = self.client.get('/api/v1/products/mala/')
        self.assertEqual((r.status_code, r.data['price'], r.data['category']), (200, 299.0, 'General'))
        self.assertEqual(self.client.get('/api/v1/products/gone/').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/products/off/').status_code, 404)
        self.assertEqual(self.client.get('/api/v1/products/nope/').status_code, 404)


class CartTests(ShopTestCase):
    def lines(self, qty, product=None):
        return {'lines': [{'productId': (product or self.product).id, 'quantity': qty}]}

    def test_quote_is_public_and_uses_server_prices_and_stock(self):
        r = self.client.post('/api/v1/cart/quote/', self.lines(5), format='json')
        self.assertEqual(r.status_code, 200, r.data)
        line = r.data['lines'][0]
        self.assertEqual((line['quantity'], line['issue'], line['pricePaise']), (3, 'reduced', 29_900))
        self.assertEqual((r.data['subtotalPaise'], r.data['shippingPaise'], r.data['totalPaise']), (89_700, 0, 89_700))

    def test_quote_adds_shipping_below_threshold_and_flags_unavailable_products(self):
        r = self.client.post('/api/v1/cart/quote/', {'lines': [{'productId': self.product.id, 'quantity': 1},
                                                                  {'productId': 999_999, 'quantity': 1}]}, format='json')
        self.assertEqual(r.data['totalPaise'], 29_900 + 4_900)
        self.assertEqual(r.data['lines'][1]['issue'], 'unavailable')
        self.assertEqual(r.data['lines'][1]['quantity'], 0)

    def test_empty_cart_has_no_shipping(self):
        r = self.client.post('/api/v1/cart/quote/', {'lines': []}, format='json')
        self.assertEqual((r.data['subtotalPaise'], r.data['shippingPaise'], r.data['totalPaise']), (0, 0, 0))

    def test_saved_cart_requires_auth(self):
        self.assertEqual(self.client.get('/api/v1/cart/').status_code, 401)
        self.assertEqual(self.client.put('/api/v1/cart/', self.lines(1), format='json').status_code, 401)
        self.assertEqual(self.client.post('/api/v1/cart/merge/', self.lines(1), format='json').status_code, 401)

    def test_put_replaces_and_get_returns_the_saved_cart(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.put('/api/v1/cart/', self.lines(2), format='json').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/cart/').data['lines'][0]['quantity'], 2)
        self.client.put('/api/v1/cart/', {'lines': []}, format='json')
        self.assertEqual(self.client.get('/api/v1/cart/').data['lines'], [])

    def test_saved_cart_is_clamped_to_stock(self):
        self.client.force_authenticate(self.user)
        self.client.put('/api/v1/cart/', self.lines(10), format='json')
        self.assertEqual(self.client.get('/api/v1/cart/').data['lines'][0]['quantity'], 3)

    def test_merge_adds_guest_quantities_to_the_saved_cart(self):
        self.client.force_authenticate(self.user)
        self.client.put('/api/v1/cart/', self.lines(1), format='json')
        other = Product.objects.create(name='Ittar', slug='ittar', price_paise=24_900, inventory=9)
        r = self.client.post('/api/v1/cart/merge/', {'lines': [{'productId': self.product.id, 'quantity': 1},
                                                                  {'productId': other.id, 'quantity': 2}]}, format='json')
        quantities = {line['productId']: line['quantity'] for line in r.data['lines']}
        self.assertEqual(quantities, {self.product.id: 2, other.id: 2})

    def test_carts_are_private_per_user(self):
        self.client.force_authenticate(self.user)
        self.client.put('/api/v1/cart/', self.lines(2), format='json')
        other = get_user_model().objects.create_user('o@b.com', 'o@b.com', PASSWORD)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get('/api/v1/cart/').data['lines'], [])


class CheckoutRetryTests(ShopTestCase):
    def test_retrying_checkout_reuses_the_unpaid_order_and_does_not_reserve_twice(self):
        first = self.place_order(qty=2)
        self.assertEqual(first.status_code, 201)
        # If a new Razorpay order were created it would be 'order_Z'; reuse must hand back the original.
        second = self.place_order(qty=2, razorpay_id='order_Z')
        self.assertEqual(second.status_code, 200, second.data)
        self.assertTrue(second.data['reused'])
        self.assertEqual(second.data['orderId'], first.data['orderId'])
        self.assertEqual(second.data['razorpayOrderId'], 'order_X')
        self.assertEqual(Order.objects.count(), 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 1)  # reserved once, not twice

    def test_retry_works_even_for_the_last_unit(self):
        Product.objects.filter(pk=self.product.pk).update(inventory=1)
        self.assertEqual(self.place_order(qty=1).status_code, 201)
        self.assertEqual(self.place_order(qty=1).status_code, 200)  # would be 409 without reuse

    def test_changing_the_cart_cancels_the_old_order_and_returns_its_stock(self):
        first = self.place_order(qty=1)
        second = self.place_order(qty=2, razorpay_id='order_Y')
        self.assertEqual(second.status_code, 201, second.data)
        self.assertNotEqual(second.data['orderId'], first.data['orderId'])
        self.assertEqual(Order.objects.get(pk=first.data['orderId']).status, Order.Status.CANCELLED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 1)  # 3 - 2; the first reservation was released

    def test_a_price_change_prevents_reuse(self):
        first = self.place_order(qty=1)
        Product.objects.filter(pk=self.product.pk).update(price_paise=39_900)
        second = self.place_order(qty=1, razorpay_id='order_Y')
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.data['subtotal'], 39_900)
        self.assertEqual(Order.objects.get(pk=first.data['orderId']).status, Order.Status.CANCELLED)

    def test_paid_orders_are_never_reused_or_cancelled(self):
        first = self.place_order(qty=1)
        Order.objects.filter(pk=first.data['orderId']).update(status=Order.Status.PAID)
        second = self.place_order(qty=1, razorpay_id='order_Y')
        self.assertEqual(second.status_code, 201)
        self.assertEqual(Order.objects.get(pk=first.data['orderId']).status, Order.Status.PAID)

    def test_save_address_updates_the_profile(self):
        self.place_order(saveAddress=True)
        me = self.client.get('/api/v1/account/me/').data
        self.assertEqual(me['address'], {'address': '1 Seva Kunj', 'city': 'Vrindavan', 'state': 'UP', 'postalCode': '281121'})
        self.assertEqual(me['phone'], '9999999999')

    def test_address_is_not_saved_unless_asked(self):
        self.place_order()
        self.assertIsNone(self.client.get('/api/v1/account/me/').data['address'])


class OrderHistoryTests(ShopTestCase):
    def test_history_lists_own_orders_newest_first_with_lines_and_address(self):
        self.place_order(qty=1)
        Order.objects.update(status=Order.Status.PAID)
        self.place_order(qty=2, razorpay_id='order_Y')
        r = self.client.get('/api/v1/orders/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)
        newest = r.data[0]
        self.assertEqual(newest['lines'][0]['quantity'], 2)
        self.assertEqual(newest['lines'][0]['name'], 'Mala')
        self.assertEqual(newest['shippingAddress']['city'], 'Vrindavan')

    def test_history_excludes_other_customers_orders(self):
        self.place_order()
        other = get_user_model().objects.create_user('o@b.com', 'o@b.com', PASSWORD)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get('/api/v1/orders/').data, [])

    def test_history_requires_auth(self):
        self.assertEqual(self.client.get('/api/v1/orders/').status_code, 401)


class SeedCatalogTests(ShopTestCase):
    def test_seed_is_idempotent_and_hides_the_packing_sku(self):
        call_command('seed_catalog', stdout=StringIO())
        count = Product.objects.count()
        call_command('seed_catalog', stdout=StringIO())
        self.assertEqual(Product.objects.count(), count)
        packing = Product.objects.get(slug='seva-box-packing')
        self.assertFalse(packing.listed)
        self.assertEqual(packing.price_paise, 14_900)
        listed = [p['slug'] for p in self.client.get('/api/v1/products/').data]
        self.assertNotIn('seva-box-packing', listed)
        self.assertIn('tulsi-japa-mala', listed)


class HealthCheckTests(TestCase):
    """Probes must work with the target's IP as Host, which Django's host validation would otherwise reject."""

    def test_health_middleware_is_first(self):
        self.assertEqual(django_settings.MIDDLEWARE[0], 'config.health.HealthCheckMiddleware')

    def test_liveness_accepts_a_pod_ip_host(self):
        r = self.client.get('/healthz/', HTTP_HOST='10.20.3.4')
        self.assertEqual((r.status_code, r.content), (200, b'ok'))

    def test_readiness_ok_when_database_answers(self):
        r = self.client.get('/readyz/', HTTP_HOST='10.20.3.4')
        self.assertEqual((r.status_code, r.content), (200, b'ok'))

    def test_readiness_is_503_when_database_is_down_but_liveness_stays_200(self):
        with patch('config.health.connection') as conn:
            conn.cursor.side_effect = Exception('connection refused')
            self.assertEqual(self.client.get('/readyz/', HTTP_HOST='10.20.3.4').status_code, 503)
            self.assertEqual(self.client.get('/healthz/', HTTP_HOST='10.20.3.4').status_code, 200)

    def test_host_validation_is_still_enforced_elsewhere(self):
        self.assertEqual(self.client.get('/api/v1/products/', HTTP_HOST='evil.example').status_code, 400)


class MalformedInputTests(ShopTestCase):
    """Bad input must be answered with a 4xx, never a 500, including on unauthenticated endpoints."""
    WEBHOOK = '/api/v1/payments/razorpay/webhook/'

    def test_webhook_with_a_non_ascii_signature_header_is_400(self):
        r = self.client.post(self.WEBHOOK, b'{}', content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE='\xe9')
        self.assertEqual(r.status_code, 400)

    def test_webhook_with_a_valid_signature_but_non_object_body_is_400(self):
        raw = b'[]'
        r = self.client.post(self.WEBHOOK, raw, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=sign('whsec', raw))
        self.assertEqual(r.status_code, 400)

    def test_webhook_with_unexpected_nested_shapes_is_acknowledged_not_crashed(self):
        raw = json.dumps({'event': 'payment.captured', 'payload': {'payment': 'not-an-object'}}).encode()
        r = self.client.post(self.WEBHOOK, raw, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=sign('whsec', raw))
        self.assertEqual(r.status_code, 200)

    def test_login_with_a_non_object_json_body_is_a_client_error(self):
        for body in ('[]', '"text"', '123', 'null'):
            r = self.client.post('/api/v1/auth/token/', body, content_type='application/json')
            self.assertLess(r.status_code, 500, body)
            self.assertGreaterEqual(r.status_code, 400, body)

    def test_verify_with_a_non_object_body_is_400(self):
        self.client.force_authenticate(self.user)
        r = self.client.post('/api/v1/payments/razorpay/verify/', [], format='json')
        self.assertEqual(r.status_code, 400)


class BrokenCache:
    """A cache whose every operation fails, like Redis after an outage."""
    def get(self, *args, **kwargs):
        raise ConnectionError('redis unreachable')
    set = get
    add = get
    incr = get
    delete = get


class RateLimitFailsOpenTests(ShopTestCase):
    def test_login_still_answers_when_the_cache_is_down(self):
        with patch.object(SimpleRateThrottle, 'cache', BrokenCache()):
            wrong = self.client.post('/api/v1/auth/token/', {'username': 'a@b.com', 'password': 'wrong'}, format='json')
            right = self.client.post('/api/v1/auth/token/', {'username': 'a@b.com', 'password': PASSWORD}, format='json')
        self.assertEqual(wrong.status_code, 401)     # a normal auth failure, not a 500
        self.assertEqual(right.status_code, 200)

    def test_the_public_quote_endpoint_still_answers_when_the_cache_is_down(self):
        with patch.object(SimpleRateThrottle, 'cache', BrokenCache()):
            r = self.client.post('/api/v1/cart/quote/', {'lines': []}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_limits_are_still_enforced_when_the_cache_works(self):
        codes = [self.client.post('/api/v1/auth/token/', {'username': 'a@b.com', 'password': 'wrong'}, format='json').status_code for _ in range(9)]
        self.assertEqual(codes[8], 429)


class RequestIdTests(TestCase):
    def test_a_supplied_request_id_is_echoed(self):
        r = self.client.get('/api/v1/products/', HTTP_X_REQUEST_ID='abc-123')
        self.assertEqual(r['X-Request-ID'], 'abc-123')

    def test_a_missing_request_id_is_generated(self):
        self.assertRegex(self.client.get('/api/v1/products/')['X-Request-ID'], r'^[0-9a-f]{32}$')

    def test_a_hostile_request_id_is_replaced(self):
        r = self.client.get('/api/v1/products/', HTTP_X_REQUEST_ID='x INFO forged line')
        self.assertRegex(r['X-Request-ID'], r'^[0-9a-f]{32}$')

    def test_middleware_order_puts_health_then_request_id_first(self):
        self.assertEqual(django_settings.MIDDLEWARE[:2], ['config.health.HealthCheckMiddleware', 'config.logging_utils.RequestIdMiddleware'])


class AdminHardeningTests(ShopTestCase):
    def setUp(self):
        super().setUp()
        self.staff = get_user_model().objects.create_superuser('staff@b.com', 'staff@b.com', PASSWORD)
        request = RequestFactory().post('/admin/')
        request.user = self.staff
        request.session = {}
        request._messages = type('Messages', (), {'add': lambda *a, **k: None})()   # message_user needs a message store
        self.request = request
        self.order_admin = admin.site._registry[Order]

    def make_order(self, status):
        return Order.objects.create(user=self.user, email='a@b.com', phone='9', first_name='A', address='x', city='c',
                                    state='s', postal_code='560001', status=status, subtotal_paise=100, total_paise=100)

    def test_order_status_cannot_be_edited_by_hand(self):
        self.assertIn('status', self.order_admin.get_readonly_fields(self.request))

    def test_orders_cannot_be_added_or_deleted_in_the_admin(self):
        self.assertFalse(self.order_admin.has_add_permission(self.request))
        self.assertFalse(self.order_admin.has_delete_permission(self.request))

    def test_mark_fulfilled_moves_only_paid_orders(self):
        paid, pending, failed = (self.make_order(s) for s in (Order.Status.PAID, Order.Status.PENDING, Order.Status.FAILED))
        self.order_admin.mark_fulfilled(self.request, Order.objects.all())
        statuses = {o.pk: o.status for o in Order.objects.all()}
        self.assertEqual(statuses[paid.pk], Order.Status.FULFILLED)
        self.assertEqual(statuses[pending.pk], Order.Status.PENDING)     # an unpaid order can NEVER be shipped from here
        self.assertEqual(statuses[failed.pk], Order.Status.FAILED)

    def test_mark_fulfilled_leaves_an_audit_trail(self):
        from django.contrib.admin.models import LogEntry
        paid = self.make_order(Order.Status.PAID)
        self.order_admin.mark_fulfilled(self.request, Order.objects.filter(pk=paid.pk))
        entry = LogEntry.objects.get(object_id=str(paid.pk))
        self.assertEqual(entry.user_id, self.staff.pk)
        self.assertIn('fulfilled', entry.change_message)

    def test_product_price_is_not_inline_editable(self):
        self.assertNotIn('price_paise', admin.site._registry[Product].list_editable)

    def test_seller_approval_is_an_explicit_logged_action_not_an_inline_checkbox(self):
        seller_admin = admin.site._registry[SellerProfile]
        self.assertNotIn('approved', seller_admin.list_editable)
        profile = SellerProfile.objects.create(user=self.user, display_name='A', approved=False)
        seller_admin.approve_sellers(self.request, SellerProfile.objects.filter(pk=profile.pk))
        profile.refresh_from_db()
        self.assertTrue(profile.approved)
        seller_admin.revoke_sellers(self.request, SellerProfile.objects.filter(pk=profile.pk))
        profile.refresh_from_db()
        self.assertFalse(profile.approved)

    def test_admin_actions_require_the_change_permission(self):
        self.assertEqual(list(self.order_admin.mark_fulfilled.allowed_permissions), ['change'])   # Django stores the list as given


class InputValidationTests(ShopTestCase):
    def test_postal_codes_with_non_ascii_digits_or_a_leading_zero_are_rejected_at_checkout(self):
        self.client.force_authenticate(self.user)
        for pin in ('\u0665\u0666\u0660\u0660\u0660\u0661', '060001', '56001', 'abcdef'):
            body = {'customer': {**CUSTOMER, 'postalCode': pin}, 'lines': [{'productId': self.product.id, 'quantity': 1}]}
            self.assertEqual(self.client.post('/api/v1/orders/', body, format='json').status_code, 400, pin)

    def seller_post(self, **overrides):
        SellerProfile.objects.update_or_create(user=self.user, defaults={'display_name': 'A', 'approved': True})
        self.client.force_authenticate(self.user)
        body = {'name': 'Ittar', 'slug': 'ittar-x', 'price_paise': 24_900, 'inventory': 5, **overrides}
        return self.client.post('/api/v1/seller/products/', body, format='json')

    def test_seller_image_must_be_a_site_path_or_an_approved_https_host(self):
        self.assertEqual(self.seller_post(slug='ok-1', image_url='https://images.unsplash.com/photo-1').status_code, 201)
        self.assertEqual(self.seller_post(slug='ok-2', image_url='/braj-seva-hero.webp').status_code, 201)
        for bad in ('https://evil.com/x.png', 'http://images.unsplash.com/x', 'javascript:alert(1)', '//evil.com/x'):
            self.assertEqual(self.seller_post(slug='bad', image_url=bad).status_code, 400, bad)

    def test_seller_details_must_be_a_short_list_of_text_lines(self):
        self.assertEqual(self.seller_post(slug='ok-3', details=['108 beads', 'Keep dry']).status_code, 201)
        for bad in ([{'a': 1}], 'not a list', ['x'] * 11, ['x' * 201], ['']):
            self.assertEqual(self.seller_post(slug='bad', details=bad).status_code, 400, repr(bad))


class ApiExposureTests(TestCase):
    BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

    def test_a_browser_gets_json_not_the_html_browsable_api(self):
        r = self.client.get('/api/v1/products/', HTTP_ACCEPT=self.BROWSER_ACCEPT)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r['Content-Type'].startswith('application/json'), r['Content-Type'])
        self.assertNotIn(b'<html', r.content.lower())

    def test_no_cross_origin_access_is_granted(self):
        r = self.client.get('/api/v1/products/', HTTP_ORIGIN='https://evil.example')
        self.assertNotIn('Access-Control-Allow-Origin', r)


class ReconcilePaymentsCommandTests(ShopTestCase):
    """The command wires Razorpay's client to the pure logic tested in shop/test_reconcile.py."""

    def run_command(self, items):
        out = StringIO()
        with patch('shop.management.commands.reconcile_payments.razorpay.Client') as client:
            client.return_value.payment.all.return_value = {'items': items}
            call_command('reconcile_payments', '--grace-minutes', '0', stdout=out)
        return out.getvalue()

    def captured(self, order_id, amount=34_800, pid='pay_1'):
        return {'id': pid, 'order_id': order_id, 'amount': amount, 'status': 'captured', 'created_at': 1}

    def test_a_paid_order_reconciles_cleanly(self):
        self.place_order(razorpay_id='order_X')
        Order.objects.update(status=Order.Status.PAID)
        self.assertIn('no discrepancies', self.run_command([self.captured('order_X')]))

    def test_a_charged_but_unpaid_order_is_reported_and_fails_the_command(self):
        from django.core.management.base import CommandError
        self.place_order(razorpay_id='order_X')                     # still pending
        with self.assertRaises(CommandError) as ctx:
            self.run_command([self.captured('order_X')])
        self.assertIn('1 discrepancy', str(ctx.exception))

    def test_a_payment_for_an_unknown_order_is_reported(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self.run_command([self.captured('order_nobody_knows')])

    def test_missing_razorpay_keys_is_a_clear_error(self):
        from django.core.management.base import CommandError
        with override_settings(RAZORPAY_KEY_ID='', RAZORPAY_KEY_SECRET=''):
            with self.assertRaises(CommandError):
                call_command('reconcile_payments')
