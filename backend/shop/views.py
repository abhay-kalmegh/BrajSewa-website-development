import hashlib
import logging
from datetime import timedelta

import razorpay
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import F, Prefetch, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView, TokenRefreshView

from . import cart as cart_logic
from .models import BuyerProfile, Order, OrderLine, Product, SellerProfile
from .inputs import mapping_or_empty
from .pricing import shipping_for
from .serializers import (CartLinesSerializer, CreateOrderSerializer, OrderSerializer, ProductSerializer,
                          ProfileSerializer, RegisterSerializer, SellerProductSerializer)
from .services import PENDING_ORDER_TTL_MINUTES, release_order

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
        username = str(mapping_or_empty(request.data).get('username', '')).strip().lower()
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
    queryset = Product.objects.filter(active=True, listed=True, inventory__gt=0)
    serializer_class = ProductSerializer


class ProductDetailView(generics.RetrieveAPIView):
    """Looked up by slug. Sold-out products still resolve (so the page can say so); inactive ones do not."""
    permission_classes = [AllowAny]
    authentication_classes = []
    queryset = Product.objects.filter(active=True)
    serializer_class = ProductSerializer
    lookup_field = 'slug'


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


# ---------------------------------------------------------------------------------- cart

class CartQuoteView(APIView):
    """Price a cart for anyone, signed in or not. The cart page and checkout use this to show live
    prices and stock instead of trusting what the browser stored."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'quote'

    def post(self, request):
        serializer = CartLinesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(cart_logic.quote(cart_logic.merge_lines(serializer.validated_data['lines'])))


class CartView(APIView):
    """The signed-in customer's saved cart. GET reads it, PUT replaces it."""
    permission_classes = [IsAuthenticated]
    throttle_scope = 'cart'

    def get(self, request):
        return Response(cart_logic.quote(cart_logic.merge_lines(cart_logic.stored_lines(request.user))))

    def put(self, request):
        serializer = CartLinesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quoted = cart_logic.quote(cart_logic.merge_lines(serializer.validated_data['lines']))
        cart_logic.save_cart(request.user, quoted)
        return Response(quoted)


class CartMergeView(APIView):
    """Called once after sign-in: fold the guest's local cart into the saved one (quantities add up)."""
    permission_classes = [IsAuthenticated]
    throttle_scope = 'cart'

    def post(self, request):
        serializer = CartLinesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        merged = cart_logic.merge_lines(cart_logic.stored_lines(request.user), serializer.validated_data['lines'])
        quoted = cart_logic.quote(merged)
        cart_logic.save_cart(request.user, quoted)
        return Response(quoted)


# -------------------------------------------------------------------------- orders

def _order_queryset():
    return (Order.objects.prefetch_related(Prefetch('lines', queryset=OrderLine.objects.select_related('product')))
            .order_by('-created_at'))


class OrderDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return _order_queryset().filter(user=self.request.user)


def _payment_payload(order, reused):
    return {'orderId': str(order.id), 'razorpayOrderId': order.razorpay_order_id,
            'amount': order.total_paise, 'subtotal': order.subtotal_paise, 'shipping': order.shipping_paise,
            'currency': 'INR', 'keyId': settings.RAZORPAY_KEY_ID, 'reused': reused}


def _save_address(user, customer):
    profile, _ = BuyerProfile.objects.get_or_create(user=user)
    profile.phone = customer['phone']
    profile.address = customer['address']
    profile.city = customer['city']
    profile.state = customer['state']
    profile.postal_code = customer['postalCode']
    profile.save()


class OrderCollectionView(APIView):
    """GET: the signed-in customer's order history. POST: start checkout for a cart."""
    permission_classes = [IsAuthenticated]
    throttle_scope = 'orders'

    def get(self, request):
        orders = _order_queryset().filter(user=request.user)[:50]
        return Response(OrderSerializer(orders, many=True).data)

    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = serializer.validated_data['customer']
        wanted = cart_logic.merge_lines(serializer.validated_data['lines'])  # also merges duplicate lines

        with transaction.atomic():
            # Serialise this customer's checkouts (double click, two tabs) with a row lock on the user.
            get_user_model().objects.select_for_update().get(pk=request.user.pk)

            # Lock the product rows (id order, to avoid deadlocks) so two buyers cannot claim the last unit.
            products = {p.id: p for p in Product.objects.select_for_update()
                        .filter(id__in=list(wanted), active=True).order_by('id')}
            if len(products) != len(wanted):
                raise ValidationError({'detail': 'One or more products are unavailable.'})
            subtotal = sum(products[pid].price_paise * qty for pid, qty in wanted.items())

            # Retrying payment must not reserve the same stock twice. Reuse this customer's identical
            # unpaid order (same lines, same prices) and give back the stock of any other unpaid ones.
            cutoff = timezone.now() - timedelta(minutes=PENDING_ORDER_TTL_MINUTES)
            pending = (Order.objects.filter(user=request.user, status=Order.Status.PENDING,
                                            razorpay_order_id__isnull=False, created_at__gte=cutoff)
                       .prefetch_related('lines').order_by('-created_at'))
            reusable = None
            for order in pending:
                same_lines = {line.product_id: line.quantity for line in order.lines.all()} == dict(wanted)
                if reusable is None and same_lines and order.subtotal_paise == subtotal:
                    reusable = order
                else:
                    release_order(order.id, Order.Status.CANCELLED)
            if reusable is not None:
                for field, value in (('email', customer['email']), ('phone', customer['phone']),
                                     ('first_name', customer['firstName']), ('last_name', customer.get('lastName', '')),
                                     ('address', customer['address']), ('city', customer['city']),
                                     ('state', customer['state']), ('postal_code', customer['postalCode'])):
                    setattr(reusable, field, value)
                reusable.save()
                if serializer.validated_data['saveAddress']:
                    _save_address(request.user, customer)
                return Response(_payment_payload(reusable, reused=True), status=status.HTTP_200_OK)

            for product in products.values():
                product.refresh_from_db(fields=['inventory'])  # stock may have just been released above
            for pid, qty in wanted.items():
                if products[pid].inventory < qty:
                    raise Conflict(f'Not enough stock for {products[pid].name}.')

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
            if serializer.validated_data['saveAddress']:
                _save_address(request.user, customer)

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

        order.razorpay_order_id = payment_order['id']
        Order.objects.filter(pk=order.pk).update(razorpay_order_id=payment_order['id'])
        return Response(_payment_payload(order, reused=False), status=status.HTTP_201_CREATED)
