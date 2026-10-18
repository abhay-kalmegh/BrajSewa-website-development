import razorpay
from django.conf import settings
from django.db import transaction
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from .models import BuyerProfile, SellerProfile
from .serializers import ProfileSerializer, RegisterSerializer
from .models import Order, OrderLine, Product
from .serializers import CreateOrderSerializer, OrderSerializer, ProductSerializer

class ProductListView(generics.ListAPIView):
    queryset = Product.objects.filter(active=True, inventory__gt=0)
    serializer_class = ProductSerializer

class RegisterView(APIView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        User = get_user_model()
        if User.objects.filter(email=data['email']).exists():
            return Response({'detail': 'An account with this email already exists.'}, status=status.HTTP_409_CONFLICT)
        user = User.objects.create_user(username=data['email'], email=data['email'], password=data['password'], first_name=data['firstName'], last_name=data.get('lastName', ''))
        if data['role'] == 'seller':
            SellerProfile.objects.create(user=user, display_name=user.get_full_name() or user.email)
        else:
            BuyerProfile.objects.create(user=user)
        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh), 'user': ProfileSerializer(user).data}, status=status.HTTP_201_CREATED)

class MeView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response(ProfileSerializer(request.user).data)

class SellerProductListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ProductSerializer
    def get_queryset(self):
        if not hasattr(self.request.user, 'seller_profile'):
            return Product.objects.none()
        return Product.objects.filter(seller=self.request.user.seller_profile).order_by('-id')
    def perform_create(self, serializer):
        if not hasattr(self.request.user, 'seller_profile') or not self.request.user.seller_profile.approved:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Seller approval is required before publishing products.')
        serializer.save(seller=self.request.user.seller_profile)

class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    lookup_field = 'id'
    def get_queryset(self):
        if self.request.user.is_authenticated:
            return Order.objects.filter(user=self.request.user)
        return Order.objects.none()

class CreateOrderView(APIView):
    permission_classes = [IsAuthenticated]
    @transaction.atomic
    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lines = serializer.validated_data['lines']
        products = {product.id: product for product in Product.objects.filter(id__in=[line['productId'] for line in lines], active=True)}
        if len(products) != len({line['productId'] for line in lines}):
            return Response({'detail': 'One or more products are unavailable.'}, status=status.HTTP_400_BAD_REQUEST)
        if any(products[line['productId']].inventory < line['quantity'] for line in lines):
            return Response({'detail': 'One or more products do not have enough inventory.'}, status=status.HTTP_409_CONFLICT)
        total = sum(products[line['productId']].price_paise * line['quantity'] for line in lines)
        customer = serializer.validated_data['customer']
        order = Order.objects.create(user=request.user, email=customer['email'], phone=customer['phone'], total_paise=total)
        for line in lines:
            products[line['productId']].inventory -= line['quantity']
            products[line['productId']].save(update_fields=['inventory'])
        OrderLine.objects.bulk_create([OrderLine(order=order, product=products[line['productId']], quantity=line['quantity'], unit_price_paise=products[line['productId']].price_paise) for line in lines])
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        payment_order = client.order.create({'amount': total, 'currency': 'INR', 'receipt': str(order.id), 'notes': {'order_id': str(order.id)}})
        order.razorpay_order_id = payment_order['id']
        order.save(update_fields=['razorpay_order_id'])
        return Response({'orderId': str(order.id), 'razorpayOrderId': payment_order['id'], 'amount': total, 'currency': 'INR', 'keyId': settings.RAZORPAY_KEY_ID}, status=status.HTTP_201_CREATED)
