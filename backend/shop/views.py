import razorpay
from django.conf import settings
from django.db import transaction
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Order, OrderLine, Product
from .serializers import CreateOrderSerializer, OrderSerializer, ProductSerializer

class ProductListView(generics.ListAPIView):
    queryset = Product.objects.filter(active=True)
    serializer_class = ProductSerializer

class OrderDetailView(generics.RetrieveAPIView):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    lookup_field = 'id'

class CreateOrderView(APIView):
    @transaction.atomic
    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lines = serializer.validated_data['lines']
        products = {product.id: product for product in Product.objects.filter(id__in=[line['productId'] for line in lines], active=True)}
        if len(products) != len({line['productId'] for line in lines}):
            return Response({'detail': 'One or more products are unavailable.'}, status=status.HTTP_400_BAD_REQUEST)
        total = sum(products[line['productId']].price_paise * line['quantity'] for line in lines)
        customer = serializer.validated_data['customer']
        order = Order.objects.create(email=customer['email'], phone=customer['phone'], total_paise=total)
        OrderLine.objects.bulk_create([OrderLine(order=order, product=products[line['productId']], quantity=line['quantity'], unit_price_paise=products[line['productId']].price_paise) for line in lines])
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        payment_order = client.order.create({'amount': total, 'currency': 'INR', 'receipt': str(order.id), 'notes': {'order_id': str(order.id)}})
        order.razorpay_order_id = payment_order['id']
        order.save(update_fields=['razorpay_order_id'])
        return Response({'orderId': str(order.id), 'razorpayOrderId': payment_order['id'], 'amount': total, 'currency': 'INR', 'keyId': settings.RAZORPAY_KEY_ID}, status=status.HTTP_201_CREATED)
