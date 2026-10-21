from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Order, Product


class ProductSerializer(serializers.ModelSerializer):
    price = serializers.SerializerMethodField()
    compareAtPrice = serializers.SerializerMethodField()
    image = serializers.URLField(source='image_url', read_only=True)

    class Meta:
        model = Product
        fields = ['id', 'name', 'slug', 'description', 'category', 'image', 'price', 'compareAtPrice', 'inventory', 'active']

    def get_price(self, obj):
        return obj.price_paise / 100

    def get_compareAtPrice(self, obj):
        return obj.compare_at_price_paise / 100 if obj.compare_at_price_paise else None


class SellerProductSerializer(serializers.ModelSerializer):
    """Writable serializer for the seller dashboard.

    The public ProductSerializer only exposes computed, read-only prices, so using it for
    creation could never populate the NOT NULL price_paise column.
    """
    price_paise = serializers.IntegerField(min_value=1)
    compare_at_price_paise = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    class Meta:
        model = Product
        fields = ['id', 'name', 'slug', 'description', 'category', 'image_url',
                  'price_paise', 'compare_at_price_paise', 'inventory', 'active']


class OrderLineInputSerializer(serializers.Serializer):
    productId = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=20)


class CustomerSerializer(serializers.Serializer):
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=24)
    firstName = serializers.CharField(max_length=80)
    lastName = serializers.CharField(max_length=80, required=False, allow_blank=True)
    address = serializers.CharField(max_length=500)
    city = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100)
    # Raw string with a single backslash: exactly six digits (Indian PIN code).
    # The previous r'^\\d{6}$' matched a literal backslash followed by "d{6}" and never validated.
    postalCode = serializers.RegexField(r'^\d{6}$', error_messages={'invalid': 'Enter a valid 6-digit PIN code.'})


class CreateOrderSerializer(serializers.Serializer):
    customer = CustomerSerializer()
    lines = OrderLineInputSerializer(many=True, allow_empty=False, max_length=50)


class OrderSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    shipping = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'status', 'subtotal', 'shipping', 'total', 'razorpay_order_id', 'paid_at', 'created_at']

    def get_total(self, obj):
        return obj.total_paise / 100

    def get_subtotal(self, obj):
        return obj.subtotal_paise / 100

    def get_shipping(self, obj):
        return obj.shipping_paise / 100


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, max_length=128, write_only=True)
    firstName = serializers.CharField(max_length=80)
    lastName = serializers.CharField(max_length=80, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=24, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=['buyer', 'seller'], default='buyer')

    def validate_email(self, value):
        # Accounts use the email as the username, so it must be normalised once, here.
        return value.strip().lower()

    def validate(self, attrs):
        candidate = get_user_model()(username=attrs['email'], email=attrs['email'],
                                     first_name=attrs['firstName'], last_name=attrs.get('lastName', ''))
        try:
            validate_password(attrs['password'], candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return attrs


class ProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField(source='pk')
    # No source='email': DRF asserts when source repeats the field name, which made
    # register and /account/me/ raise before returning a response.
    email = serializers.EmailField()
    role = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()

    def get_role(self, obj):
        return 'seller' if hasattr(obj, 'seller_profile') else 'buyer'

    def get_name(self, obj):
        return obj.get_full_name() or obj.email
