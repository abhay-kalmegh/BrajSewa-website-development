import hashlib
import hmac
import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

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

    def place_order(self, qty=1, lines=None, razorpay_id='order_X'):
        self.client.force_authenticate(self.user)
        body = {'customer': CUSTOMER, 'lines': lines or [{'productId': self.product.id, 'quantity': qty}]}
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
        self.place_order(razorpay_id='order_Y')
        paid = Order.objects.exclude(pk=recent.pk).get()
        Order.objects.filter(pk=paid.pk).update(status=Order.Status.PAID)
        self.age(paid, 120)
        self.assertIn('Expired 0', self.run_expiry())
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 1)

    def test_expiry_is_idempotent(self):
        self.place_order()
        self.age(Order.objects.get(), 45)
        self.run_expiry()
        self.assertIn('Expired 0', self.run_expiry())
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 3)  # not double-restored
