import hashlib
import logging
from collections import defaultdict

import razorpay
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import F, Q
from rest_framework import generics, status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView, TokenRefreshView

from .models import BuyerProfile, Order, OrderLine, Product, SellerProfile
from .pricing import shipping_for
from .serializers import (CreateOrderSerializer, OrderSerializer, ProductSerializer, ProfileSerializer,
                          RegisterSerializer, SellerProductSerializer)
from .services import release_order

logger = logging.getLogger(__name__)


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Not enough stock.'
    default_code = 'conflict'


# --------------------------------------------------------------------------- auth

class LoginEmailThrottle(SimpleRateThrottle):
    """Limit login attempts per target account, independent of the caller's IP.

    The per-IP 'auth' scope alone is not enough: attackers rotate IPs, and behind the
    Next.js proxy many real users can share one IP.
    """
    scope = 'login_email'

    def get_cache_key(self, request, view):
        username = str(request.data.get('username', '')).strip().lower()
        if not username:
            return None
        ident = hashlib.sha256(username.encode()).hexdigest()  # safe for any cache backend
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        field = self.username_field
        attrs[field] = str(attrs.get(field, '')).strip().lower()
        return super().validate(attrs)


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    throttle_scope = 'auth'
    throttle_classes = [*TokenObtainPairView.throttle_classes, LoginEmailThrottle]


class RefreshView(TokenRefreshView):
    throttle_scope = 'auth'


class LogoutView(TokenBlacklistView):
    throttle_scope = 'auth'


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'auth'

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        User = get_user_model()
        try:
            with transaction.atomic():
                if User.objects.filter(Q(username__iexact=data['email']) | Q(email__iexact=data['email'])).exists():
                    raise IntegrityError
                user = User.objects.create_user(
                    username=data['email'], email=data['email'], password=data['password'],
                    first_name=data['firstName'], last_name=data.get('lastName', ''))
                if data['role'] == 'seller':
                    SellerProfile.objects.create(user=user, display_name=user.get_full_name() or user.email)
                else:
                    BuyerProfile.objects.create(user=user, phone=data.get('phone', ''))
        except IntegrityError:
            return Response({'detail': 'An account with this email already exists.'}, status=status.HTTP_409_CONFLICT)
        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh),
                         'user': ProfileSerializer(user).data}, status=status.HTTP_201_CREATED)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(request.user).data)


# ------------------------------------------------------------------------ catalog

class ProductListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    queryset = Product.objects.filter(active=True, inventory__gt=0)
    serializer_class = ProductSerializer


class SellerProductListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SellerProductSerializer

    def get_queryset(self):
        if not hasattr(self.request.user, 'seller_profile'):
            return Product.objects.none()
        return Product.objects.filter(seller=self.request.user.seller_profile).order_by('-id')

    def perform_create(self, serializer):
        seller = getattr(self.request.user, 'seller_profile', None)
        if seller is None or not seller.approved:
            raise PermissionDenied('Seller approval is required before publishing products.')
        serializer.save(seller=seller)


# -------------------------------------------------------------------------- orders

class OrderDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user)


class CreateOrderView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = 'orders'

    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = serializer.validated_data['customer']

        # Merge duplicate lines so the stock check below sees the real quantity per product.
        wanted = defaultdict(int)
        for line in serializer.validated_data['lines']:
            wanted[line['productId']] += line['quantity']

        with transaction.atomic():
            # Lock the product rows (in id order, to avoid deadlocks) so two buyers
            # cannot both claim the last unit.
            products = {p.id: p for p in Product.objects.select_for_update()
                        .filter(id__in=list(wanted), active=True).order_by('id')}
            if len(products) != len(wanted):
                raise ValidationError({'detail': 'One or more products are unavailable.'})
            for pid, qty in wanted.items():
                if products[pid].inventory < qty:
                    raise Conflict(f'Not enough stock for {products[pid].name}.')

            subtotal = sum(products[pid].price_paise * qty for pid, qty in wanted.items())
            shipping = shipping_for(subtotal)
            order = Order.objects.create(
                user=request.user, email=customer['email'], phone=customer['phone'],
                first_name=customer['firstName'], last_name=customer.get('lastName', ''),
                address=customer['address'], city=customer['city'], state=customer['state'],
                postal_code=customer['postalCode'],
                subtotal_paise=subtotal, shipping_paise=shipping, total_paise=subtotal + shipping)
            OrderLine.objects.bulk_create([
                OrderLine(order=order, product=products[pid], product_name=products[pid].name,
                          quantity=qty, unit_price_paise=products[pid].price_paise)
                for pid, qty in wanted.items()])
            for pid, qty in wanted.items():
                Product.objects.filter(pk=pid).update(inventory=F('inventory') - qty)

        # The external API call happens after the transaction commits, so a slow or failing
        # payment provider never holds row locks. If it fails, give the stock back.
        try:
            client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
            payment_order = client.order.create({
                'amount': order.total_paise, 'currency': 'INR',
                'receipt': f'order_{order.id}', 'notes': {'order_id': str(order.id)}})
        except Exception:
            logger.exception('Razorpay order creation failed for order %s', order.id)
            release_order(order.id, Order.Status.FAILED)
            return Response({'detail': 'Payment service is unavailable. Please try again.'},
                            status=status.HTTP_502_BAD_GATEWAY)

        Order.objects.filter(pk=order.pk).update(razorpay_order_id=payment_order['id'])
        return Response({'orderId': str(order.id), 'razorpayOrderId': payment_order['id'],
                         'amount': order.total_paise, 'subtotal': subtotal, 'shipping': shipping,
                         'currency': 'INR', 'keyId': settings.RAZORPAY_KEY_ID},
                        status=status.HTTP_201_CREATED)
