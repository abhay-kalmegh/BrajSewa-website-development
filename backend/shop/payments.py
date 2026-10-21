import hashlib
import hmac
import json
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Order
from .services import mark_paid

logger = logging.getLogger(__name__)


def _signature(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


class RazorpayVerifyView(APIView):
    """Called by the browser after Razorpay Checkout succeeds.

    The HMAC signature proves Razorpay issued this payment for this order; the order must
    also belong to the signed-in user. The webhook remains the source of truth if the
    browser never calls back.
    """
    permission_classes = [IsAuthenticated]
    throttle_scope = 'payments'

    def post(self, request):
        order_id = str(request.data.get('razorpay_order_id', ''))
        payment_id = str(request.data.get('razorpay_payment_id', ''))
        signature = str(request.data.get('razorpay_signature', ''))
        if not (order_id and payment_id and signature) or not settings.RAZORPAY_KEY_SECRET:
            return Response({'detail': 'Invalid payment confirmation.'}, status=status.HTTP_400_BAD_REQUEST)

        expected = _signature(settings.RAZORPAY_KEY_SECRET, f'{order_id}|{payment_id}'.encode())
        if not hmac.compare_digest(expected, signature):
            return Response({'detail': 'Invalid payment signature.'}, status=status.HTTP_400_BAD_REQUEST)

        if not Order.objects.filter(razorpay_order_id=order_id, user=request.user).exists():
            return Response({'detail': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        order = mark_paid(order_id, payment_id)
        if order is None:
            return Response({'detail': 'We could not confirm this order. If you were charged, please contact support.'},
                            status=status.HTTP_409_CONFLICT)
        return Response({'status': order.status, 'orderId': str(order.id)})


class RazorpayWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]  # authenticated by HMAC signature instead

    def post(self, request):
        if not settings.RAZORPAY_WEBHOOK_SECRET:
            return Response({'detail': 'Webhook secret is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        raw_body = request.body
        expected = _signature(settings.RAZORPAY_WEBHOOK_SECRET, raw_body)
        if not hmac.compare_digest(expected, request.headers.get('X-Razorpay-Signature', '')):
            return Response({'detail': 'Invalid webhook signature.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            body = json.loads(raw_body)
        except ValueError:
            return Response({'detail': 'Malformed body.'}, status=status.HTTP_400_BAD_REQUEST)

        if body.get('event') in ('payment.captured', 'order.paid'):
            payment = body.get('payload', {}).get('payment', {}).get('entity', {})
            if payment.get('order_id'):
                mark_paid(payment['order_id'], payment.get('id', ''), payment.get('amount'))
        # Always 200 for authentic events we do not act on, so Razorpay stops retrying them.
        # payment.failed is deliberately ignored: the customer can retry on the same Razorpay
        # order, and stale reservations are released by `manage.py expire_orders`.
        return Response({'received': True})
