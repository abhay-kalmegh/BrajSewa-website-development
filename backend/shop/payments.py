import hmac
import hashlib
from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Order

class RazorpayVerifyView(APIView):
    @transaction.atomic
    def post(self, request):
        data = request.data
        message = f"{data.get('razorpay_order_id')}|{data.get('razorpay_payment_id')}".encode()
        expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), message, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, data.get('razorpay_signature', '')):
            return Response({'detail': 'Invalid payment signature.'}, status=status.HTTP_400_BAD_REQUEST)
        order = Order.objects.select_for_update().get(razorpay_order_id=data['razorpay_order_id'])
        order.status = Order.Status.PAID
        order.save(update_fields=['status'])
        return Response({'status': order.status})

class RazorpayWebhookView(APIView):
    authentication_classes = []
    permission_classes = []
    def post(self, request):
        signature = request.headers.get('X-Razorpay-Signature', '')
        if not settings.RAZORPAY_WEBHOOK_SECRET:
            return Response({'detail': 'Webhook secret is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        raw_body = request.body
        expected = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return Response({'detail': 'Invalid webhook signature.'}, status=status.HTTP_400_BAD_REQUEST)
        event = request.data.get('event')
        payment = request.data.get('payload', {}).get('payment', {}).get('entity', {})
        if event == 'payment.captured' and payment.get('order_id'):
            Order.objects.filter(razorpay_order_id=payment['order_id']).update(status=Order.Status.PAID)
        return Response({'received': True})
